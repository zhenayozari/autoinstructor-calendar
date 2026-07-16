import Link from "next/link";
import { ChevronLeft, ChevronRight, UsersRound } from "lucide-react";
import { DirectorSlotRow, type DirectorSlot } from "@/components/director/director-slot-row";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import {
  addUtcDays,
  formatDate,
  formatDateValue,
  getLocalDate,
  getUtcWeekStart,
} from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type DirectorSchedulePageProps = {
  searchParams?: Promise<{
    week?: string;
    day?: string;
    instructor?: string;
  }>;
};

type CalendarDay = {
  date: string;
  slots: DirectorSlot[];
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_ANCHOR = "director-schedule";

function isDateValue(value: string | undefined) {
  return Boolean(value && DATE_PATTERN.test(value));
}

function getCalendarWeekday(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function getCalendarDayNumber(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

function getScheduleHref({
  week,
  day,
  instructor,
}: {
  week: string;
  day: string;
  instructor?: string;
}) {
  const params = new URLSearchParams();
  params.set("week", week);
  params.set("day", day);

  if (instructor) {
    params.set("instructor", instructor);
  }

  return `/director/schedule?${params.toString()}#${SCHEDULE_ANCHOR}`;
}

function getSelectedDay(
  weekDates: string[],
  requestedDay: string | undefined,
  currentDate: string,
  days: CalendarDay[],
) {
  const firstDate = weekDates[0];
  const lastDate = weekDates[weekDates.length - 1];

  if (
    requestedDay &&
    isDateValue(requestedDay) &&
    requestedDay >= firstDate &&
    requestedDay <= lastDate
  ) {
    return requestedDay;
  }

  if (currentDate >= firstDate && currentDate <= lastDate) {
    return currentDate;
  }

  return days.find((day) => day.slots.length > 0)?.date ?? firstDate;
}

function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

export default async function DirectorSchedulePage({
  searchParams,
}: DirectorSchedulePageProps) {
  const params = (await searchParams) ?? {};
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
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === params.instructor,
  );
  const selectedInstructorId = selectedInstructor?.id ?? "";
  const instructorIds = selectedInstructorId
    ? [selectedInstructorId]
    : instructors.map((instructor) => instructor.id);
  const timezone =
    selectedInstructor?.timezone ?? instructors[0]?.timezone ?? "Asia/Irkutsk";
  const currentDate = getLocalDate(timezone);
  const baseDate = isDateValue(params.week) ? params.week! : currentDate;
  const weekStart = getUtcWeekStart(baseDate);
  const weekDates = Array.from({ length: 7 }, (_, index) =>
    formatDateValue(addUtcDays(weekStart, index)),
  );
  const visibleWeekStart = weekDates[0];
  const previousWeek = formatDateValue(addUtcDays(weekStart, -7));
  const nextWeek = formatDateValue(addUtcDays(weekStart, 7));

  const [
    { data: scheduleDayData, error: scheduleDayError },
    { data: lessonTypeData, error: lessonTypeError },
    { data: schoolData, error: schoolError },
  ] = await Promise.all([
    instructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission")
          .in("instructor_id", instructorIds)
          .in("date", weekDates)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("lesson_types")
      .select("id, code, name, color, kind, default_duration_minutes"),
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
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
            "id, slot_id, student_label, student_access_id, created_at, price_amount, paid_amount, is_paid, paid_at, payment_note, lesson_state, completed_at, instructor_note",
          )
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };

  const loadError =
    instructorError ??
    scheduleDayError ??
    lessonTypeError ??
    schoolError ??
    slotError ??
    bookingError;
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const schools = (schoolData ?? []) as School[];
  const bookings = (bookingData ?? []) as Booking[];
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
  const days = weekDates.map((date): CalendarDay => {
    const daySlots = directorSlots.filter(
      (slot) => slot.scheduleDay?.date === date,
    );

    return { date, slots: daySlots };
  });
  const selectedDay = getSelectedDay(
    weekDates,
    params.day,
    currentDate,
    days,
  );
  const selectedDaySlots = directorSlots.filter(
    (slot) => slot.scheduleDay?.date === selectedDay,
  );
  const selectedOccupied = selectedDaySlots.filter((slot) => slot.booking);
  const selectedFree = selectedDaySlots.filter(
    (slot) => slot.status === "available" && !slot.booking,
  );
  const selectedInstructorLabel = selectedInstructor
    ? selectedInstructor.public_name ?? selectedInstructor.name
    : "Все инструкторы";

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Расписание школы
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            {selectedInstructorLabel}. Неделя с {formatDate(visibleWeekStart)}.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <section className="grid gap-2 sm:grid-cols-3">
          <Metric
            label="В выбранный день"
            value={`${selectedDaySlots.length}`}
            description={`${selectedOccupied.length} занято · ${selectedFree.length} свободно`}
          />
          <Metric
            label="Инструктор"
            value={selectedInstructor ? "1" : `${instructors.length}`}
            description={selectedInstructorLabel}
          />
          <Metric
            label="За неделю"
            value={`${directorSlots.length}`}
            description={`${directorSlots.filter((slot) => slot.booking).length} записей`}
          />
        </section>

        <Card id={SCHEDULE_ANCHOR} className="scroll-mt-4">
          <CardHeader className="border-b pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Неделя</CardTitle>
                <CardDescription>
                  Выберите день и при необходимости инструктора.
                </CardDescription>
              </div>
              <nav className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-lg"
                  nativeButton={false}
                  render={
                    <Link
                      href={getScheduleHref({
                        week: previousWeek,
                        day: previousWeek,
                        instructor: selectedInstructorId,
                      })}
                    />
                  }
                  aria-label="Предыдущая неделя"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={getScheduleHref({
                        week: currentDate,
                        day: currentDate,
                        instructor: selectedInstructorId,
                      })}
                    />
                  }
                >
                  Сегодня
                </Button>
                <Button
                  variant="outline"
                  size="icon-lg"
                  nativeButton={false}
                  render={
                    <Link
                      href={getScheduleHref({
                        week: nextWeek,
                        day: nextWeek,
                        instructor: selectedInstructorId,
                      })}
                    />
                  }
                  aria-label="Следующая неделя"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </nav>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              <Link
                href={getScheduleHref({
                  week: visibleWeekStart,
                  day: selectedDay,
                })}
                className={cn(
                  "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold",
                  !selectedInstructorId
                    ? "bg-zinc-950 text-white"
                    : "bg-white text-zinc-700",
                )}
              >
                <UsersRound className="size-4" />
                Все
              </Link>
              {instructors.map((instructor) => (
                <Link
                  key={instructor.id}
                  href={getScheduleHref({
                    week: visibleWeekStart,
                    day: selectedDay,
                    instructor: instructor.id,
                  })}
                  className={cn(
                    "inline-flex shrink-0 rounded-full border px-3 py-2 text-sm font-semibold",
                    selectedInstructorId === instructor.id
                      ? "bg-zinc-950 text-white"
                      : "bg-white text-zinc-700",
                  )}
                >
                  {instructor.public_name ?? instructor.name}
                </Link>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1.5 rounded-[1.75rem] bg-white p-2 shadow-sm ring-1 ring-zinc-200/70 sm:gap-2 sm:p-3">
              {days.map((day) => {
                const occupiedCount = day.slots.filter((slot) => slot.booking)
                  .length;

                return (
                  <Link
                    key={day.date}
                    href={getScheduleHref({
                      week: visibleWeekStart,
                      day: day.date,
                      instructor: selectedInstructorId,
                    })}
                    className={cn(
                      "flex min-h-20 flex-col items-center justify-center rounded-2xl px-1.5 py-2 text-center",
                      selectedDay === day.date
                        ? "bg-zinc-950 text-white shadow-sm"
                        : "border bg-white text-zinc-600",
                    )}
                  >
                    <span className="text-xs font-semibold uppercase">
                      {getCalendarWeekday(day.date)}
                    </span>
                    <span className="mt-1 text-2xl font-bold leading-none tabular-nums">
                      {getCalendarDayNumber(day.date)}
                    </span>
                    <span
                      className={cn(
                        "mt-1 text-[11px]",
                        selectedDay === day.date
                          ? "text-zinc-300"
                          : "text-zinc-500",
                      )}
                    >
                      {day.slots.length > 0
                        ? `${occupiedCount}/${day.slots.length}`
                        : "пусто"}
                    </span>
                  </Link>
                );
              })}
            </div>

            <section className="rounded-[1.75rem] bg-zinc-50 p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold capitalize">
                    {formatDate(selectedDay)}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {selectedInstructorLabel}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                  {selectedDaySlots.length} слотов
                </span>
              </div>
              <div className="space-y-2.5">
                {selectedDaySlots.length > 0 ? (
                  selectedDaySlots.map((slot) => (
                    <DirectorSlotRow
                      key={slot.id}
                      slot={slot}
                      timezone={slot.instructor?.timezone ?? timezone}
                    />
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed bg-white px-4 py-8 text-center text-sm text-zinc-500">
                    На выбранный день слотов нет.
                  </div>
                )}
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
