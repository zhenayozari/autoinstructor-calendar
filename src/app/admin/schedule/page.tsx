import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { getLocalDate } from "@/lib/formatters";
import {
  buildActiveInstructorsQuery,
  getInitialInstructorId,
} from "@/lib/queries";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";
import { AdminScheduleWorkspace } from "@/components/admin/admin-schedule-workspace";

export const dynamic = "force-dynamic";

type AdminSchedulePageProps = {
  searchParams?: Promise<{
    create?: string | string[];
    date?: string | string[];
  }>;
};


export default async function AdminSchedulePage({
  searchParams,
}: AdminSchedulePageProps) {
  const params = (await searchParams) ?? {};
  const createParam = Array.isArray(params.create)
    ? params.create[0]
    : params.create;
  const dateParam = Array.isArray(params.date) ? params.date[0] : params.date;
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();
  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name, timezone",
    );
  const instructors = (instructorData ?? []) as Instructor[];
  const initialInstructorId = getInitialInstructorId(
    instructors,
    membership.instructorId,
  );
  const instructorIds = instructors.map((instructor) => instructor.id);
  const [
    { data: lessonTypeData, error: lessonTypeError },
    { data: schoolData, error: schoolError },
    { data: scheduleDayData, error: scheduleDayError },
    { data: slotData, error: slotError },
  ] = await Promise.all([
    supabase
      .from("lesson_types")
      .select(
        "id, code, name, description, color, kind, requires_vehicle, default_duration_minutes, tags, sort_order, is_active",
      )
      .order("sort_order")
      .order("name"),
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    instructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission, published_at")
          .in("instructor_id", instructorIds)
          .order("date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    instructorIds.length > 0
      ? supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, school_id, start_time, end_time, location_type, status, note",
          )
          .in("instructor_id", instructorIds)
          .neq("status", "cancelled")
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const slots = (slotData ?? []) as Slot[];
  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    adminEnabled && slotIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, slot_id, student_label, student_access_id, created_at, price_amount, paid_amount, is_paid, paid_at, payment_note, lesson_state, completed_at, instructor_note")
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };
  const loadError =
    instructorError ??
    lessonTypeError ??
    schoolError ??
    scheduleDayError ??
    slotError ??
    bookingError;
  const lessonTypeCatalog = (lessonTypeData ?? []) as LessonType[];
  const schools = (schoolData ?? []) as School[];
  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const bookings = (bookingData ?? []) as Booking[];
  const slotCountsByScheduleDay = new Map<string, number>();

  for (const slot of slots) {
    slotCountsByScheduleDay.set(
      slot.schedule_day_id,
      (slotCountsByScheduleDay.get(slot.schedule_day_id) ?? 0) + 1,
    );
  }

  const defaultWeekDate = getLocalDate("Asia/Irkutsk");

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Расписание
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Неделя
            </h1>
            <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
              Посмотрите загрузку на 7 дней, найдите свободные окна и быстро
              добавьте нужные слоты.
            </p>
            <Link
              href="/admin/schedule?create=slot#schedule-quick-actions"
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <CalendarPlus className="size-4" />
              Добавить слот
            </Link>
          </div>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <AdminScheduleWorkspace
          instructors={instructors}
          lessonTypes={lessonTypeCatalog}
          schools={schools}
          scheduleDays={scheduleDays.map((day) => ({
            ...day,
            slot_count: slotCountsByScheduleDay.get(day.id) ?? 0,
          }))}
          slots={slots}
          bookings={bookings}
          defaultWeekDate={defaultWeekDate}
          initialInstructorId={initialInstructorId}
          canSelectInstructor={false}
          adminEnabled={adminEnabled}
          initialOpenSlotForm={createParam === "slot"}
          initialSlotDate={dateParam}
        />

      </div>
    </main>
  );
}
