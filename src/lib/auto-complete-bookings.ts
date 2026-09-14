import "server-only";

import { isPostgresBackend } from "@/lib/backend-mode";
import { executeQuery, queryRows } from "@/lib/db/postgres";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

type AutoCompletePastBookingsOptions = {
  instructorIds?: string[];
  studentAccessId?: string;
  now?: Date;
};

type PastSlotRow = {
  id: string;
  end_time: string;
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

  if (isPostgresBackend()) {
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
      }

      return bookings.length;
    } catch (error) {
      console.error("autoCompletePastBookings postgres:", error);
      return 0;
    }
  }

  if (!hasSupabaseAdminKey()) return 0;

  if (uniqueInstructorIds.length === 0 && !studentAccessId) {
    return 0;
  }

  const supabase = createAdminClient();
  let slotQuery = supabase
    .from("slots")
    .select("id, end_time")
    .lt("end_time", now.toISOString())
    .neq("status", "cancelled");

  if (uniqueInstructorIds.length > 0) {
    slotQuery = slotQuery.in("instructor_id", uniqueInstructorIds);
  }

  const { data: slotData, error: slotError } = await slotQuery;

  if (slotError) {
    console.error("autoCompletePastBookings slots:", slotError.message);
    return 0;
  }

  const slots = (slotData ?? []) as PastSlotRow[];
  const slotIds = slots.map((slot) => slot.id);

  if (slotIds.length === 0) {
    return 0;
  }

  const completedAtBySlotId = new Map(
    slots.map((slot) => [slot.id, slot.end_time]),
  );
  let bookingQuery = supabase
    .from("bookings")
    .select("id, slot_id")
    .in("slot_id", slotIds)
    .eq("status", "confirmed")
    .eq("lesson_state", "scheduled");

  if (studentAccessId) {
    bookingQuery = bookingQuery.eq("student_access_id", studentAccessId);
  }

  const { data: bookingData, error: bookingError } = await bookingQuery;

  if (bookingError) {
    console.error("autoCompletePastBookings bookings:", bookingError.message);
    return 0;
  }

  const bookings = (bookingData ?? []) as ScheduledBookingRow[];
  let completedCount = 0;

  for (const booking of bookings) {
    const { error } = await supabase
      .from("bookings")
      .update({
        lesson_state: "completed",
        completed_at: completedAtBySlotId.get(booking.slot_id) ?? now.toISOString(),
      })
      .eq("id", booking.id)
      .eq("status", "confirmed")
      .eq("lesson_state", "scheduled");

    if (error) {
      console.error("autoCompletePastBookings update:", error.message);
      continue;
    }

    completedCount += 1;
  }

  return completedCount;
}
