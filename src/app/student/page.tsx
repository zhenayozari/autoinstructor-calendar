import Link from "next/link";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LogOut,
} from "lucide-react";
import { studentLogoutAction } from "@/app/student/actions";
import { LessonReviewForm } from "@/components/student/lesson-review-form";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import { requireCurrentStudentAccess } from "@/lib/student-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { StudentBookingButton } from "@/components/student/student-booking-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type StudentPageProps = {
  searchParams?: Promise<{
    week?: string;
    day?: string;
  }>;
};

type Instructor = {
  id: string;
  name: string;
  public_name: string | null;
  timezone: string;
};

type ScheduleSlot = {
  id: string;
  instructor_id: string;
  instructor_name: string;
  timezone: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  lesson_type_id: string;
  school_id: string | null;
  lesson_type_name: string;
  lesson_type_color: string;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked";
  is_booked: boolean;
};

type StudentSource = {
  id: string;
  name: string;
  color: string;
};

type CalendarDay = {
  date: string;
  slots: ScheduleSlot[];
};

type StudentBookingRow = {
  id: string;
  slot_id: string;
  lesson_state: "scheduled" | "completed" | "no_show";
  created_at: string;
};

type StudentLesson = {
  booking: StudentBookingRow;
  slot: ScheduleSlot;
  review: LessonReviewRow | null;
};

type LessonReviewRow = {
  id: string;
  booking_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

const DEFAULT_TIMEZONE = "Asia/Irkutsk";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const SCHEDULE_ANCHOR = "student-schedule";

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function addDaysToDateValue(value: string, days: number) {
  return formatDateValue(addDays(parseDate(value), days));
}

function getCurrentDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getWeekStart(value: string | undefined, timezone: string) {
  const selectedDate =
    value && DATE_PATTERN.test(value)
      ? parseDate(value)
      : parseDate(getCurrentDate(timezone));
  const weekday = selectedDate.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

  return addDays(selectedDate, -daysSinceMonday);
}

function formatWeekRange(start: Date, end: Date) {
  const startLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
  }).format(start);
  const endLabel = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(end);

  return `${startLabel} — ${endLabel}`;
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatCalendarWeekday(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatCalendarDayNumber(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(new Date(value));
}

function getTransmissionLabel(transmission: ScheduleSlot["transmission"]) {
  if (transmission === "automatic") return "АКПП";
  if (transmission === "manual") return "МКПП";
  return null;
}

function getLocationLabel(locationType: ScheduleSlot["location_type"]) {
  if (locationType === "in_car") return "В автомобиле";
  if (locationType === "online") return "Онлайн";
  if (locationType === "classroom") return "В классе";
  return "Другое";
}

function getLessonStateLabel(state: StudentBookingRow["lesson_state"]) {
  if (state === "completed") return "Проведено";
  if (state === "no_show") return "Неявка";
  return "Запланировано";
}

function getLessonStateClassName(state: StudentBookingRow["lesson_state"]) {
  if (state === "completed") return "bg-emerald-100 text-emerald-800";
  if (state === "no_show") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-800";
}

function normalizeLessonState(value: unknown): StudentBookingRow["lesson_state"] {
  if (value === "completed" || value === "no_show" || value === "scheduled") {
    return value;
  }

  return "scheduled";
}

function createCalendarDays(weekStart: Date, slots: ScheduleSlot[]) {
  return Array.from({ length: 7 }, (_, index): CalendarDay => {
    const date = formatDateValue(addDays(weekStart, index));

    return {
      date,
      slots: slots.filter((slot) => slot.date === date),
    };
  });
}

function getSelectedCalendarDay(
  days: CalendarDay[],
  selectedDate: string | undefined,
  currentDate: string,
) {
  const firstDay = days[0]?.date;
  const lastDay = days[days.length - 1]?.date;

  if (!firstDay || !lastDay) {
    return null;
  }

  if (
    selectedDate &&
    DATE_PATTERN.test(selectedDate) &&
    selectedDate >= firstDay &&
    selectedDate <= lastDay
  ) {
    return days.find((day) => day.date === selectedDate) ?? days[0];
  }

  if (currentDate >= firstDay && currentDate <= lastDay) {
    return days.find((day) => day.date === currentDate) ?? days[0];
  }

  return days.find((day) => day.slots.length > 0) ?? days[0];
}

function getScheduleHref(week?: string, day?: string) {
  const params = new URLSearchParams();

  if (week) {
    params.set("week", week);
  }

  if (day) {
    params.set("day", day);
  }

  const query = params.toString();
  const path = query ? `/student?${query}` : "/student";

  return `${path}#${SCHEDULE_ANCHOR}`;
}

function SlotCard({ slot }: { slot: ScheduleSlot }) {
  const transmission = getTransmissionLabel(slot.transmission);
  const dateLabel = formatDayLabel(slot.date);
  const timeLabel = `${formatTime(slot.start_time, slot.timezone)} — ${formatTime(
    slot.end_time,
    slot.timezone,
  )}`;

  return (
    <article
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderLeftColor: slot.lesson_type_color, borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-bold tabular-nums text-zinc-950">{timeLabel}</p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: slot.lesson_type_color }}
            />
            <p className="truncate text-sm font-semibold">
              {slot.lesson_type_name}
            </p>
          </div>
        </div>
        <Badge className="bg-emerald-100 text-emerald-800">Свободно</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
        {transmission && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {transmission}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          {getLocationLabel(slot.location_type)}
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-zinc-500">
          Нажмите, чтобы занять этот слот.
        </p>
        <StudentBookingButton
          slotId={slot.id}
          lessonName={slot.lesson_type_name}
          dateLabel={dateLabel}
          timeLabel={timeLabel}
        />
      </div>
    </article>
  );
}

function EmptyDay() {
  return (
    <div className="rounded-2xl border border-dashed bg-white px-4 py-8 text-center text-sm text-zinc-500">
      На этот день свободных занятий нет.
    </div>
  );
}

function StudentLessonCard({
  lesson,
  timezone,
  compact = false,
}: {
  lesson: StudentLesson;
  timezone: string;
  compact?: boolean;
}) {
  const transmission = getTransmissionLabel(lesson.slot.transmission);
  const timeLabel = `${formatTime(lesson.slot.start_time, timezone)} — ${formatTime(
    lesson.slot.end_time,
    timezone,
  )}`;
  const canReview =
    lesson.booking.lesson_state === "completed" && !lesson.review;

  return (
    <article
      className="rounded-2xl border bg-white p-4 shadow-sm"
      style={{ borderLeftColor: lesson.slot.lesson_type_color, borderLeftWidth: 4 }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold capitalize text-zinc-500">
            {formatDayLabel(lesson.slot.date)}
          </p>
          <p
            className={
              compact
                ? "mt-1 font-bold tabular-nums"
                : "mt-1 text-2xl font-bold tabular-nums"
            }
          >
            {timeLabel}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: lesson.slot.lesson_type_color }}
            />
            <p className="truncate text-sm font-semibold">
              {lesson.slot.lesson_type_name}
            </p>
          </div>
        </div>
        <Badge className={getLessonStateClassName(lesson.booking.lesson_state)}>
          {getLessonStateLabel(lesson.booking.lesson_state)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-600">
        {transmission && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {transmission}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          {getLocationLabel(lesson.slot.location_type)}
        </span>
      </div>

      {lesson.review && (
        <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-semibold">
            Ваша оценка: {"★".repeat(lesson.review.rating)}
            {"☆".repeat(5 - lesson.review.rating)}
          </p>
          {lesson.review.comment && (
            <p className="mt-2 leading-6 text-emerald-800">
              {lesson.review.comment}
            </p>
          )}
        </div>
      )}

      {canReview && <LessonReviewForm bookingId={lesson.booking.id} />}
    </article>
  );
}

function NextLessonSection({
  lesson,
  timezone,
}: {
  lesson: StudentLesson | null;
  timezone: string;
}) {
  return (
    <section className="rounded-[2rem] border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <Clock3 className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Ближайшее занятие
          </p>
          {lesson ? (
            <div className="mt-3">
              <StudentLessonCard lesson={lesson} timezone={timezone} />
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed bg-zinc-50 px-4 py-5">
              <p className="font-semibold">Пока нет ближайшей записи</p>
              <p className="mt-1 text-sm leading-6 text-zinc-500">
                Ниже можно выбрать свободное время из доступного расписания.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function StudentLessonsSection({
  upcomingLessons,
  historyLessons,
  timezone,
}: {
  upcomingLessons: StudentLesson[];
  historyLessons: StudentLesson[];
  timezone: string;
}) {
  return (
    <section className="rounded-[2rem] border bg-white/80 p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-zinc-950 text-white">
          <CalendarCheck className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Мои записи
          </p>
          <h2 className="mt-1 text-xl font-semibold">Запланированные занятия</h2>

          {upcomingLessons.length > 0 ? (
            <div className="mt-4 space-y-3">
              {upcomingLessons.slice(0, 4).map((lesson) => (
                <StudentLessonCard
                  key={lesson.booking.id}
                  lesson={lesson}
                  timezone={timezone}
                  compact
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-dashed bg-white px-4 py-5 text-sm text-zinc-500">
              Активных записей пока нет.
            </div>
          )}

          {historyLessons.length > 0 && (
            <div className="mt-5">
              <p className="text-sm font-semibold">Последние занятия</p>
              <div className="mt-2 space-y-2">
                {historyLessons.slice(0, 5).map((lesson) => (
                  <StudentLessonCard
                    key={lesson.booking.id}
                    lesson={lesson}
                    timezone={timezone}
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

async function getUsedCounts(accessId: string, visibleWeekStart: string) {
  const supabase = createAdminClient();
  const { data: totalBookingData, error: totalBookingError } = await supabase
    .from("bookings")
    .select("id, slot_id")
    .eq("student_access_id", accessId)
    .eq("status", "confirmed");

  if (totalBookingError) {
    throw new Error(totalBookingError.message);
  }

  const totalUsed = totalBookingData?.length ?? 0;
  const slotIds = (totalBookingData ?? []).map((booking) => booking.slot_id);

  if (slotIds.length === 0) {
    return { totalUsed, weekUsed: 0 };
  }

  const { data: slots, error: slotsError } = await supabase
    .from("slots")
    .select("id, schedule_day_id")
    .in("id", slotIds);

  if (slotsError) {
    throw new Error(slotsError.message);
  }

  const dayIds = [...new Set((slots ?? []).map((slot) => slot.schedule_day_id))];

  if (dayIds.length === 0) {
    return { totalUsed, weekUsed: 0 };
  }

  const weekEnd = addDaysToDateValue(visibleWeekStart, 6);
  const { data: days, error: daysError } = await supabase
    .from("schedule_days")
    .select("id")
    .in("id", dayIds)
    .gte("date", visibleWeekStart)
    .lte("date", weekEnd);

  if (daysError) {
    throw new Error(daysError.message);
  }

  const weekDayIds = new Set((days ?? []).map((day) => day.id));
  const weekSlotIds = new Set(
    (slots ?? [])
      .filter((slot) => weekDayIds.has(slot.schedule_day_id))
      .map((slot) => slot.id),
  );
  const weekUsed = (totalBookingData ?? []).filter((booking) =>
    weekSlotIds.has(booking.slot_id),
  ).length;

  return { totalUsed, weekUsed };
}

function formatLimit(used: number, limit: number | null) {
  if (limit === null) {
    return `${used} · без лимита`;
  }

  return `${used} из ${limit}`;
}

function formatRemaining(used: number, limit: number | null) {
  if (limit === null) {
    return "Можно записываться без общего ограничения";
  }

  const remaining = Math.max(limit - used, 0);

  return `Осталось: ${remaining}`;
}

export default async function StudentPage({ searchParams }: StudentPageProps) {
  const access = await requireCurrentStudentAccess();
  const params = searchParams ? await searchParams : {};
  const supabase = createAdminClient();
  await autoCompletePastBookings({
    instructorIds: [access.instructorId],
    studentAccessId: access.id,
  });
  const { data: instructor } = await supabase
    .from("instructors")
    .select("id, name, public_name, timezone")
    .eq("id", access.instructorId)
    .maybeSingle();
  const { data: sourceData } = access.schoolId
    ? await supabase
        .from("schools")
        .select("id, name, color")
        .eq("id", access.schoolId)
        .maybeSingle()
    : { data: null };
  const currentInstructor = instructor as Instructor | null;
  const studentSource = sourceData as StudentSource | null;
  const timezone = currentInstructor?.timezone ?? DEFAULT_TIMEZONE;
  const weekStart = getWeekStart(params.week, timezone);
  const weekEnd = addDays(weekStart, 6);
  const visibleWeekStart = formatDateValue(weekStart);
  const previousWeek = formatDateValue(addDays(weekStart, -7));
  const nextWeek = formatDateValue(addDays(weekStart, 7));
  const {
    data: bookingData,
    error: primaryBookingError,
  } = await supabase
    .from("bookings")
    .select("id, slot_id, lesson_state, created_at")
    .eq("student_access_id", access.id)
    .eq("status", "confirmed");

  let bookingError = primaryBookingError;
  let studentBookings = ((bookingData ?? []) as Partial<StudentBookingRow>[]).map(
    (booking) => ({
      id: booking.id ?? "",
      slot_id: booking.slot_id ?? "",
      lesson_state: normalizeLessonState(booking.lesson_state),
      created_at: booking.created_at ?? "",
    }),
  );

  if (primaryBookingError) {
    const { data: fallbackBookingData, error: fallbackBookingError } =
      await supabase
        .from("bookings")
        .select("id, slot_id, created_at")
        .eq("student_access_id", access.id)
        .eq("status", "confirmed");

    bookingError = fallbackBookingError;
    studentBookings = ((fallbackBookingData ?? []) as {
      id: string;
      slot_id: string;
      created_at: string;
    }[]).map((booking) => ({
      id: booking.id,
      slot_id: booking.slot_id,
      lesson_state: "scheduled",
      created_at: booking.created_at,
    }));
  }

  const bookedSlotIds = studentBookings.map((booking) => booking.slot_id);
  const bookingIds = studentBookings.map((booking) => booking.id);
  const { data: bookedSlotData, error: bookedSlotError } =
    bookedSlotIds.length > 0
      ? await supabase
          .from("public_schedule_slots")
          .select("*")
          .in("id", bookedSlotIds)
      : { data: [], error: null };
  const bookedSlots = (bookedSlotData ?? []) as ScheduleSlot[];
  const { data: reviewData } =
    bookingIds.length > 0
      ? await supabase
          .from("lesson_reviews")
          .select("id, booking_id, rating, comment, created_at")
          .eq("student_access_id", access.id)
          .in("booking_id", bookingIds)
      : { data: [] };
  const reviews = (reviewData ?? []) as LessonReviewRow[];
  const reviewsByBookingId = new Map(
    reviews.map((review) => [review.booking_id, review]),
  );

  let slotsData: unknown[] = [];
  let slotsError: { message: string } | null = null;

  if (access.lessonTypeIds.length > 0) {
    const availableSlotsResult = await supabase
      .from("public_schedule_slots")
      .select("*")
      .eq("instructor_id", access.instructorId)
      .in("lesson_type_id", access.lessonTypeIds)
      .eq("status", "available")
      .eq("is_booked", false)
      .gte("date", visibleWeekStart)
      .lte("date", formatDateValue(weekEnd))
      .order("start_time", { ascending: true });

    slotsData = availableSlotsResult.data ?? [];
    slotsError = availableSlotsResult.error;
  }

  const usage = await getUsedCounts(access.id, visibleWeekStart);
  const bookedSlotsById = new Map(bookedSlots.map((slot) => [slot.id, slot]));
  const studentLessons = studentBookings
    .map((booking): StudentLesson | null => {
      const slot = bookedSlotsById.get(booking.slot_id);
      if (!slot) return null;

      return {
        booking,
        slot,
        review: reviewsByBookingId.get(booking.id) ?? null,
      };
    })
    .filter((lesson): lesson is StudentLesson => Boolean(lesson))
    .sort(
      (first, second) =>
        new Date(first.slot.start_time).getTime() -
        new Date(second.slot.start_time).getTime(),
    );
  const currentDateValue = getCurrentDate(timezone);
  const upcomingLessons = studentLessons.filter(
    (lesson) =>
      lesson.booking.lesson_state === "scheduled" &&
      lesson.slot.date >= currentDateValue,
  );
  const historyLessons = studentLessons
    .filter(
      (lesson) =>
        lesson.booking.lesson_state !== "scheduled" ||
        lesson.slot.date < currentDateValue,
    )
    .sort(
      (first, second) =>
        new Date(second.slot.start_time).getTime() -
        new Date(first.slot.start_time).getTime(),
    );
  const nextLesson = upcomingLessons[0] ?? null;
  const bookingLoadError = bookingError ?? bookedSlotError;
  const slots = (slotsData ?? []) as ScheduleSlot[];
  const days = createCalendarDays(weekStart, slots);
  const selectedDay = getSelectedCalendarDay(
    days,
    params.day,
    currentDateValue,
  );
  const instructorName =
    currentInstructor?.public_name ?? currentInstructor?.name ?? "Инструктор";

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-5 text-zinc-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-5xl space-y-4 sm:space-y-6">
        <header className="rounded-[2rem] bg-zinc-950 p-5 text-white shadow-xl shadow-zinc-950/10 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                Кабинет ученика
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {access.displayLabel}
              </h1>
              <p className="mt-2 text-sm text-zinc-300">
                Инструктор: {instructorName}
              </p>
              {studentSource && (
                <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm text-zinc-100">
                  <span
                    className="size-2.5 shrink-0 rounded-full border border-white/30"
                    style={{ backgroundColor: studentSource.color }}
                  />
                  <span className="truncate">{studentSource.name}</span>
                </div>
              )}
            </div>
            <form action={studentLogoutAction}>
              <Button type="submit" variant="outline" className="bg-white text-zinc-950">
                <LogOut />
                Выйти
              </Button>
            </form>
          </div>
        </header>

        {bookingLoadError ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить ваши записи. Попробуйте обновить страницу.
          </section>
        ) : (
          <>
            <NextLessonSection lesson={nextLesson} timezone={timezone} />
            <StudentLessonsSection
              upcomingLessons={upcomingLessons}
              historyLessons={historyLessons}
              timezone={timezone}
            />
          </>
        )}

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Записано всего</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatLimit(usage.totalUsed, access.totalLessonLimit)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatRemaining(usage.totalUsed, access.totalLessonLimit)}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Записано на этой неделе</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatLimit(usage.weekUsed, access.weeklyLessonLimit)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatRemaining(usage.weekUsed, access.weeklyLessonLimit)}
            </p>
          </div>
        </section>

        <section
          id={SCHEDULE_ANCHOR}
          className="scroll-mt-4 overflow-hidden rounded-[2rem] border bg-white/80 shadow-sm"
        >
          <div className="border-b px-4 py-4 sm:flex sm:items-center sm:justify-between sm:px-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Доступное расписание
              </p>
              <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
                {formatWeekRange(weekStart, weekEnd)}
              </h2>
            </div>
            <nav className="mt-4 flex items-center gap-2 sm:mt-0">
              <Link
                href={getScheduleHref(previousWeek)}
                className="grid size-10 place-items-center rounded-full border bg-white"
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link
                href={getScheduleHref()}
                className="rounded-full border bg-white px-4 py-2 text-sm font-semibold"
              >
                Сегодня
              </Link>
              <Link
                href={getScheduleHref(nextWeek)}
                className="grid size-10 place-items-center rounded-full border bg-white"
                aria-label="Следующая неделя"
              >
                <ChevronRight className="size-4" />
              </Link>
            </nav>
          </div>

          {slotsError ? (
            <div className="px-4 py-10 text-center text-sm text-red-700">
              Не удалось загрузить расписание. Попробуйте обновить страницу.
            </div>
          ) : access.lessonTypeIds.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-zinc-500">
              Для этого доступа пока не выбраны типы занятий.
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              <div className="grid grid-cols-7 gap-1.5 rounded-[1.75rem] bg-white p-2 shadow-sm ring-1 ring-zinc-200/70 sm:gap-2 sm:p-3">
                {days.map((day) => (
                  <Link
                    key={day.date}
                    href={getScheduleHref(visibleWeekStart, day.date)}
                    className={
                      selectedDay?.date === day.date
                        ? "flex min-h-20 flex-col items-center justify-center rounded-2xl bg-zinc-950 px-1.5 py-2 text-center text-white shadow-sm"
                        : "flex min-h-20 flex-col items-center justify-center rounded-2xl border bg-white px-1.5 py-2 text-center text-zinc-600"
                    }
                  >
                    <span className="text-xs font-semibold uppercase">
                      {formatCalendarWeekday(day.date)}
                    </span>
                    <span className="mt-1 text-2xl font-bold leading-none tabular-nums">
                      {formatCalendarDayNumber(day.date)}
                    </span>
                    <span
                      className={
                        selectedDay?.date === day.date
                          ? "mt-1 text-[11px] text-zinc-300"
                          : "mt-1 text-[11px] text-zinc-500"
                      }
                    >
                      {day.slots.length > 0 ? `${day.slots.length} св.` : "пусто"}
                    </span>
                  </Link>
                ))}
              </div>

              {selectedDay && (
                <section className="rounded-[1.75rem] bg-zinc-50 p-3">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold capitalize">
                        {formatDayLabel(selectedDay.date)}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-500">
                        Выберите удобное время для записи.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-500">
                      {selectedDay.slots.length} свобод.
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {selectedDay.slots.length > 0 ? (
                      selectedDay.slots.map((slot) => (
                        <SlotCard key={slot.id} slot={slot} />
                      ))
                    ) : (
                      <EmptyDay />
                    )}
                  </div>
                </section>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
