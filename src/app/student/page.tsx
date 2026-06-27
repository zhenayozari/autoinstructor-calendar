import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, LogOut } from "lucide-react";
import { studentLogoutAction } from "@/app/student/actions";
import { requireCurrentStudentAccess } from "@/lib/student-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { StudentBookingButton } from "@/components/student/student-booking-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

type StudentPageProps = {
  searchParams?: Promise<{
    week?: string;
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
  lesson_type_name: string;
  lesson_type_color: string;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked";
  is_booked: boolean;
};

type CalendarDay = {
  date: string;
  slots: ScheduleSlot[];
};

const DEFAULT_TIMEZONE = "Asia/Irkutsk";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function formatShortDay(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
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

function createCalendarDays(weekStart: Date, slots: ScheduleSlot[]) {
  return Array.from({ length: 7 }, (_, index): CalendarDay => {
    const date = formatDateValue(addDays(weekStart, index));

    return {
      date,
      slots: slots.filter((slot) => slot.date === date),
    };
  });
}

function getWeekHref(date?: string) {
  return date ? `/student?week=${date}` : "/student";
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
  const { data: instructor } = await supabase
    .from("instructors")
    .select("id, name, public_name, timezone")
    .eq("id", access.instructorId)
    .maybeSingle();
  const currentInstructor = instructor as Instructor | null;
  const timezone = currentInstructor?.timezone ?? DEFAULT_TIMEZONE;
  const weekStart = getWeekStart(params.week, timezone);
  const weekEnd = addDays(weekStart, 6);
  const visibleWeekStart = formatDateValue(weekStart);
  const previousWeek = formatDateValue(addDays(weekStart, -7));
  const nextWeek = formatDateValue(addDays(weekStart, 7));

  const { data: slotsData, error: slotsError } =
    access.lessonTypeIds.length > 0
      ? await supabase
          .from("public_schedule_slots")
          .select("*")
          .eq("instructor_id", access.instructorId)
          .in("lesson_type_id", access.lessonTypeIds)
          .eq("status", "available")
          .eq("is_booked", false)
          .gte("date", visibleWeekStart)
          .lte("date", formatDateValue(weekEnd))
          .order("start_time", { ascending: true })
      : { data: [], error: null };
  const usage = await getUsedCounts(access.id, visibleWeekStart);
  const slots = (slotsData ?? []) as ScheduleSlot[];
  const days = createCalendarDays(weekStart, slots);
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
            </div>
            <form action={studentLogoutAction}>
              <Button type="submit" variant="outline" className="bg-white text-zinc-950">
                <LogOut />
                Выйти
              </Button>
            </form>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Использовано всего</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatLimit(usage.totalUsed, access.totalLessonLimit)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatRemaining(usage.totalUsed, access.totalLessonLimit)}
            </p>
          </div>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-500">Использовано на этой неделе</p>
            <p className="mt-1 text-2xl font-semibold">
              {formatLimit(usage.weekUsed, access.weeklyLessonLimit)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              {formatRemaining(usage.weekUsed, access.weeklyLessonLimit)}
            </p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[2rem] border bg-white/80 shadow-sm">
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
                href={getWeekHref(previousWeek)}
                className="grid size-10 place-items-center rounded-full border bg-white"
                aria-label="Предыдущая неделя"
              >
                <ChevronLeft className="size-4" />
              </Link>
              <Link
                href={getWeekHref()}
                className="rounded-full border bg-white px-4 py-2 text-sm font-semibold"
              >
                Сегодня
              </Link>
              <Link
                href={getWeekHref(nextWeek)}
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
          ) : slots.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center px-6 py-14 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
                <CalendarDays className="size-7" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">
                Свободных слотов нет
              </h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Попробуйте соседнюю неделю или уточните расписание у инструктора.
              </p>
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-5">
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:hidden">
                {days.map((day) => (
                  <a
                    key={day.date}
                    href={`#day-${day.date}`}
                    className="min-w-[86px] rounded-2xl border bg-white px-3 py-2 text-left"
                  >
                    <span className="block text-xs font-semibold capitalize">
                      {formatShortDay(day.date)}
                    </span>
                    <span className="mt-1 block text-[11px] text-zinc-500">
                      {day.slots.length} свобод.
                    </span>
                  </a>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {days.map((day) => (
                  <section
                    key={day.date}
                    id={`day-${day.date}`}
                    className="scroll-mt-4 rounded-2xl border bg-zinc-50/70 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <h3 className="font-semibold capitalize">
                        {formatDayLabel(day.date)}
                      </h3>
                      <span className="text-xs font-medium text-zinc-500">
                        {day.slots.length} свобод.
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {day.slots.length > 0 ? (
                        day.slots.map((slot) => (
                          <SlotCard key={slot.id} slot={slot} />
                        ))
                      ) : (
                        <EmptyDay />
                      )}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
