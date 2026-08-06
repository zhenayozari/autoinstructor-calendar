import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import { requireDirectorAccess } from "@/lib/director-auth";
import {
  formatDate,
  formatMoney,
  getLocalDate,
} from "@/lib/formatters";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";
import {
  DirectorSlotRow,
  type DirectorSlot,
} from "@/components/director/director-slot-row";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const dynamic = "force-dynamic";

function pluralLessons(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return "занятие";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return "занятия";
  }

  return "занятий";
}

function MetricCard({
  label,
  value,
  description,
  tone = "default",
}: {
  label: string;
  value: string;
  description: string;
  tone?: "default" | "money" | "warning";
}) {
  return (
    <div
      className={
        tone === "warning"
          ? "rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
          : tone === "money"
            ? "rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-sm"
            : "rounded-2xl border bg-white px-4 py-3 shadow-sm"
      }
    >
      <p
        className={
          tone === "warning"
            ? "text-xs font-medium text-amber-700"
            : tone === "money"
              ? "text-xs font-medium text-emerald-700"
              : "text-xs font-medium text-zinc-500"
        }
      >
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p
        className={
          tone === "warning"
            ? "mt-0.5 text-xs text-amber-700"
            : tone === "money"
              ? "mt-0.5 text-xs text-emerald-700"
              : "mt-0.5 text-xs text-zinc-500"
        }
      >
        {description}
      </p>
    </div>
  );
}

export default async function DirectorOverviewPage() {
  const membership = await requireDirectorAccess();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name, timezone, is_active",
  );
  const instructors = (instructorData ?? []) as Instructor[];
  const instructorIds = instructors.map((instructor) => instructor.id);
  await autoCompletePastBookings({ instructorIds });
  const timezone = instructors[0]?.timezone ?? "Asia/Irkutsk";
  const today = getLocalDate(timezone);
  const tomorrow = getLocalDate(timezone, 1);

  const [
    { data: scheduleDayData, error: scheduleDayError },
    { data: lessonTypeData, error: lessonTypeError },
    { data: schoolData, error: schoolError },
    { data: studentAccessData, error: studentAccessError },
  ] = await Promise.all([
    instructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission")
          .in("instructor_id", instructorIds)
          .in("date", [today, tomorrow])
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("lesson_types")
      .select("id, code, name, color, kind, default_duration_minutes"),
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    instructorIds.length > 0
      ? supabase
          .from("student_accesses")
          .select("id, instructor_id, is_active, is_archived")
          .in("instructor_id", instructorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);
  const { data: slotData, error: slotError } =
    scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, school_id, start_time, end_time, location_type, status, note",
          )
          .in("schedule_day_id", scheduleDayIds)
          .neq("status", "cancelled")
          .order("start_time")
      : { data: [], error: null };
  const slots = (slotData ?? []) as Slot[];
  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    slotIds.length > 0
      ? await supabase
          .from("bookings")
          .select(
            "id, slot_id, student_label, student_access_id, created_at, price_amount, paid_amount, is_paid, paid_at, payment_note, booking_category, lesson_state, completed_at, instructor_note",
          )
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };

  const loadError =
    instructorError ??
    scheduleDayError ??
    lessonTypeError ??
    schoolError ??
    studentAccessError ??
    slotError ??
    bookingError;
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const schools = (schoolData ?? []) as School[];
  const bookings = (bookingData ?? []) as Booking[];
  const studentAccesses = (studentAccessData ?? []) as {
    id: string;
    instructor_id: string;
    is_active: boolean;
    is_archived: boolean;
  }[];
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const scheduleDaysById = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay]),
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const bookingsBySlotId = new Map(
    bookings.map((booking) => [booking.slot_id, booking]),
  );
  const directorSlots: DirectorSlot[] = slots
    .map((slot) => ({
      ...slot,
      instructor: instructorsById.get(slot.instructor_id) ?? null,
      lessonType: lessonTypesById.get(slot.lesson_type_id) ?? null,
      scheduleDay: scheduleDaysById.get(slot.schedule_day_id) ?? null,
      school: slot.school_id ? schoolsById.get(slot.school_id) ?? null : null,
      booking: bookingsBySlotId.get(slot.id) ?? null,
    }))
    .sort(
      (first, second) =>
        new Date(first.start_time).getTime() -
        new Date(second.start_time).getTime(),
    );
  const todaySlots = directorSlots.filter(
    (slot) => slot.scheduleDay?.date === today,
  );
  const now = new Date();
  const upcomingSlots = directorSlots.filter(
    (slot) => new Date(slot.end_time) >= now,
  );
  const todayOccupiedSlots = todaySlots.filter((slot) => slot.booking);
  const todayFreeSlots = todaySlots.filter(
    (slot) => slot.status === "available" && !slot.booking,
  );
  const todayCompletedSlots = todaySlots.filter(
    (slot) => slot.booking?.lesson_state === "completed",
  );
  const todayEarnedAmount = todayCompletedSlots.reduce(
    (sum, slot) => sum + (slot.booking?.price_amount ?? 0),
    0,
  );
  const todayPaidAmount = todaySlots.reduce(
    (sum, slot) => sum + (slot.booking?.paid_amount ?? 0),
    0,
  );
  const todayDebtAmount = Math.max(todayEarnedAmount - todayPaidAmount, 0);
  const activeStudentsCount = studentAccesses.filter(
    (access) => access.is_active && !access.is_archived,
  ).length;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Обзор школы
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Сегодня: {formatDate(today)}. Общая картина по всем инструкторам.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Занятий сегодня"
            value={`${todaySlots.length}`}
            description={`${todayOccupiedSlots.length} занято · ${todayFreeSlots.length} свободно`}
          />
          <MetricCard
            label="Инструкторы"
            value={`${instructors.length}`}
            description={`${activeStudentsCount} активных учеников`}
          />
          <MetricCard
            label="Получено сегодня"
            value={formatMoney(todayPaidAmount)}
            description={`Проведено: ${todayCompletedSlots.length} ${pluralLessons(todayCompletedSlots.length)}`}
            tone="money"
          />
          <MetricCard
            label="Долг сегодня"
            value={formatMoney(todayDebtAmount)}
            description="По проведённым занятиям"
            tone="warning"
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Ближайшие занятия</CardTitle>
              <CardDescription>
                Общий список по школе на сегодня и завтра.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingSlots.length > 0 ? (
                upcomingSlots
                  .slice(0, 5)
                  .map((slot) => (
                    <DirectorSlotRow
                      key={slot.id}
                      slot={slot}
                      timezone={slot.instructor?.timezone ?? timezone}
                    />
                  ))
              ) : (
                <div className="rounded-2xl border border-dashed bg-white px-4 py-8 text-center text-sm text-zinc-500">
                  Ближайших занятий пока нет.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Быстрые переходы</CardTitle>
              <CardDescription>
                Управленческие экраны без смешивания с кабинетом инструктора.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Button
                nativeButton={false}
                render={<Link href="/director/schedule" />}
                className="h-11 justify-start"
              >
                <CalendarDays />
                Расписание школы
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/director/staff" />}
                className="h-11 justify-start"
              >
                <UsersRound />
                Сотрудники
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/director/students" />}
                className="h-11 justify-start"
              >
                <UserRoundCheck />
                Ученики
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href="/director/reports" />}
                className="h-11 justify-start"
              >
                <BarChart3 />
                Итоги
              </Button>
            </CardContent>
          </Card>
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="size-4" />
                Сотрудники
              </CardTitle>
              <CardDescription>
                Приглашения и подтверждения добавим следующим этапом.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <UserRoundCheck className="size-4" />
                Ученики
              </CardTitle>
              <CardDescription>
                Руководитель видит всех, но доступы ученикам выдают инструкторы.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="size-4" />
                Деньги
              </CardTitle>
              <CardDescription>
                Управленческие отчёты будут собираться поверх текущих оплат.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </main>
  );
}
