import Link from "next/link";
import { BookingDialog } from "@/components/calendar/booking-dialog";
import { PublicCalendarMobile } from "@/components/calendar/public-calendar-mobile";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

type ScheduleSlot = {
  id: string;
  instructor_id: string;
  instructor_name: string;
  instructor_slug: string;
  timezone: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  lesson_type_id: string;
  lesson_type_code: string;
  lesson_type_name: string;
  lesson_type_description: string | null;
  lesson_type_color: string;
  lesson_kind: "driving" | "theory";
  lesson_type_tags: string[];
  lesson_type_sort_order: number;
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function getCurrentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getWeekStart(value?: string) {
  const selectedDate =
    value && DATE_PATTERN.test(value)
      ? parseDate(value)
      : parseDate(getCurrentDate());
  const weekday = selectedDate.getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;

  return addDays(selectedDate, -daysSinceMonday);
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatDayNumber(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseDate(date));
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

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function getLocationLabel(locationType: ScheduleSlot["location_type"]) {
  const labels = {
    in_car: "В автомобиле",
    online: "Онлайн",
    classroom: "В классе",
    other: "Другое",
  };

  return labels[locationType];
}

function getTransmissionLabel(transmission: ScheduleSlot["transmission"]) {
  if (transmission === "automatic") return "АКПП";
  if (transmission === "manual") return "МКПП";
  return null;
}

function createCalendarDays(weekStart: Date, slots: ScheduleSlot[]) {
  return Array.from({ length: 7 }, (_, index): CalendarDay => {
    const date = formatDate(addDays(weekStart, index));

    return {
      date,
      slots: slots.filter((slot) => slot.date === date),
    };
  });
}

function getWeekHref(basePath: string, date?: string) {
  return date ? `${basePath}?week=${date}` : basePath;
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className="size-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
      />
    </svg>
  );
}

function EmptyWeek() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">
      <div className="grid size-16 place-items-center rounded-2xl bg-amber-100 text-amber-700">
        <svg
          aria-hidden="true"
          className="size-8"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 3v2.25M17.25 3v2.25M3.75 9h16.5m-15 11.25h13.5a1.5 1.5 0 0 0 1.5-1.5V6.75a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5Z"
          />
        </svg>
      </div>
      <h2 className="mt-5 text-xl font-semibold text-zinc-900">
        Расписание ещё не опубликовано
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        На этой неделе пока нет доступных занятий. Попробуйте посмотреть
        соседнюю неделю немного позже.
      </p>
    </div>
  );
}

function LoadError() {
  return (
    <div className="mx-auto max-w-md px-6 py-16 text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-red-50 text-red-600">
        <span className="text-xl font-semibold">!</span>
      </div>
      <h2 className="mt-5 text-xl font-semibold text-zinc-900">
        Не удалось загрузить расписание
      </h2>
      <p className="mt-2 text-sm leading-6 text-zinc-500">
        Обновите страницу или попробуйте ещё раз через несколько минут.
      </p>
    </div>
  );
}

function SlotCard({
  slot,
  showInstructorName,
}: {
  slot: ScheduleSlot;
  showInstructorName: boolean;
}) {
  const isUnavailable = slot.is_booked || slot.status === "blocked";
  const transmission = getTransmissionLabel(slot.transmission);

  const card = (
    <div
      className={`rounded-2xl border bg-white p-3.5 shadow-sm transition ${
        isUnavailable
          ? "border-zinc-200 opacity-65"
          : "cursor-pointer border-zinc-200 hover:-translate-y-0.5 hover:shadow-md"
      }`}
      style={{ borderTopColor: slot.lesson_type_color, borderTopWidth: 3 }}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-base font-semibold tracking-tight text-zinc-950">
          {formatTime(slot.start_time, slot.timezone)}
          <span className="mx-1 text-zinc-300">—</span>
          {formatTime(slot.end_time, slot.timezone)}
        </p>
        <span
          className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
            isUnavailable
              ? "bg-zinc-100 text-zinc-500"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {slot.is_booked
            ? "Занято"
            : slot.status === "blocked"
              ? "Недоступно"
              : "Свободно"}
        </span>
      </div>

      <h3 className="mt-3 text-sm font-semibold leading-5 text-zinc-800">
        {slot.lesson_type_name}
      </h3>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {transmission && (
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
            {transmission}
          </span>
        )}
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
          {getLocationLabel(slot.location_type)}
        </span>
      </div>

      {showInstructorName && (
        <p className="mt-3 truncate text-xs text-zinc-400">
          {slot.instructor_name}
        </p>
      )}
    </div>
  );

  if (isUnavailable) {
    return card;
  }

  const timeLabel = `${formatTime(slot.start_time, slot.timezone)} — ${formatTime(
    slot.end_time,
    slot.timezone,
  )}`;

  return (
    <BookingDialog
      slotId={slot.id}
      lessonName={slot.lesson_type_name}
      dateLabel={`${formatDayLabel(slot.date)}, ${formatDayNumber(slot.date)}`}
      timeLabel={timeLabel}
      color={slot.lesson_type_color}
    >
      {card}
    </BookingDialog>
  );
}

export async function PublicCalendar({
  week,
  basePath,
  instructorId,
  showInstructorName = true,
  className,
}: {
  week?: string;
  basePath: string;
  instructorId?: string;
  showInstructorName?: boolean;
  className?: string;
}) {
  const weekStart = getWeekStart(week);
  const weekEnd = addDays(weekStart, 6);
  const previousWeek = formatDate(addDays(weekStart, -7));
  const nextWeek = formatDate(addDays(weekStart, 7));
  const today = getCurrentDate();

  const supabase = await createClient();
  let query = supabase
    .from("public_schedule_slots")
    .select("*")
    .gte("date", formatDate(weekStart))
    .lte("date", formatDate(weekEnd))
    .order("start_time", { ascending: true });

  if (instructorId) {
    query = query.eq("instructor_id", instructorId);
  }

  const { data, error } = await query;
  const slots = (data ?? []) as ScheduleSlot[];
  const days = createCalendarDays(weekStart, slots);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-[2rem] border border-black/5 bg-white/80 shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-zinc-200/80 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            Неделя
          </p>
          <h2 className="mt-1 text-xl font-semibold capitalize tracking-tight text-zinc-950 sm:text-2xl">
            {formatWeekRange(weekStart, weekEnd)}
          </h2>
        </div>

        <nav
          aria-label="Навигация по неделям"
          className="flex items-center gap-2"
        >
          <Link
            href={getWeekHref(basePath, previousWeek)}
            aria-label="Предыдущая неделя"
            className="grid size-10 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ArrowIcon direction="left" />
          </Link>
          <Link
            href={getWeekHref(basePath)}
            className="rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            Сегодня
          </Link>
          <Link
            href={getWeekHref(basePath, nextWeek)}
            aria-label="Следующая неделя"
            className="grid size-10 place-items-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
          >
            <ArrowIcon direction="right" />
          </Link>
        </nav>
      </div>

      {error ? (
        <LoadError />
      ) : slots.length === 0 ? (
        <EmptyWeek />
      ) : (
        <>
          <PublicCalendarMobile
            days={days}
            today={today}
            showInstructorName={showInstructorName}
          />

          <div className="hidden overflow-x-auto lg:block">
            <div className="grid min-w-[1120px] grid-cols-7 divide-x divide-zinc-200/80">
              {days.map((day) => {
                const isToday = day.date === today;

                return (
                  <section key={day.date} className="min-h-[430px] bg-white/60">
                    <div
                      className={`border-b border-zinc-200/80 px-4 py-4 ${
                        isToday ? "bg-amber-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold capitalize text-zinc-500">
                            {formatDayLabel(day.date)}
                          </p>
                          <p className="mt-1 text-lg font-semibold text-zinc-950">
                            {formatDayNumber(day.date)}
                          </p>
                        </div>
                        {isToday && (
                          <span className="rounded-full bg-amber-200 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-900">
                            Сегодня
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3 p-3">
                      {day.slots.length > 0 ? (
                        day.slots.map((slot) => (
                          <SlotCard
                            key={slot.id}
                            slot={slot}
                            showInstructorName={showInstructorName}
                          />
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-zinc-200 px-3 py-8 text-center text-xs text-zinc-400">
                          Нет занятий
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
