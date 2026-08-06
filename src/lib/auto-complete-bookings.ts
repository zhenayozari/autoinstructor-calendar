import "server-only";

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
  if (!hasSupabaseAdminKey()) return 0;

  const uniqueInstructorIds = [...new Set((instructorIds ?? []).filter(Boolean))];

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
