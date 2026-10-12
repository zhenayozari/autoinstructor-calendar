import "server-only";

import { executeQuery, queryRows } from "@/lib/db/postgres";
import { createInstructorPayoutEntryForBookingWithCurrentPolicy } from "@/lib/instructor-payouts";

type AutoCompletePastBookingsOptions = {
  instructorIds?: string[];
  studentAccessId?: string;
  now?: Date;
};

type ScheduledBookingRow = {
  id: string;
  slot_id: string;
};

export async function autoCompletePastBookings({
  instructorIds,
  studentAccessId,
  now = new Date(),
}: AutoCompletePastBookingsOptions = {}) {
  const uniqueInstructorIds = [...new Set((instructorIds ?? []).filter(Boolean))];

  if (uniqueInstructorIds.length === 0 && !studentAccessId) {
    return 0;
  }

  try {
    const bookings = await queryRows<ScheduledBookingRow & { completed_at: string }>(
      `
        select bookings.id, bookings.slot_id, slots.end_time as completed_at
        from public.bookings
        join public.slots on slots.id = bookings.slot_id
        where slots.end_time < $1
          and slots.status <> 'cancelled'
          and bookings.status = 'confirmed'
          and bookings.lesson_state = 'scheduled'
          and ($2::uuid[] is null or slots.instructor_id = any($2::uuid[]))
          and ($3::uuid is null or bookings.student_access_id = $3::uuid)
      `,
      [
        now.toISOString(),
        uniqueInstructorIds.length > 0 ? uniqueInstructorIds : null,
        studentAccessId ?? null,
      ],
    );

    for (const booking of bookings) {
      await executeQuery(
        `
          update public.bookings
          set lesson_state = 'completed',
              completed_at = $2
          where id = $1
            and status = 'confirmed'
            and lesson_state = 'scheduled'
        `,
        [booking.id, booking.completed_at],
      );

      await createInstructorPayoutEntryForBookingWithCurrentPolicy({
        bookingId: booking.id,
        plannedAt: booking.completed_at,
      });
    }

    return bookings.length;
  } catch (error) {
    console.error("autoCompletePastBookings postgres:", error);
    return 0;
  }
}
