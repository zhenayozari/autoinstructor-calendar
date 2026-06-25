import Link from "next/link";
import { ArrowRight, CalendarDays, Clock3, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

type PreviewSlot = {
  id: string;
  instructor_name: string;
  instructor_slug: string;
  timezone: string;
  date: string;
  lesson_type_name: string;
  lesson_type_color: string;
  start_time: string;
  status: "available" | "blocked";
  is_booked: boolean;
};

const DEFAULT_TIMEZONE = "Asia/Irkutsk";

function getCurrentDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(parseDate(value));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export async function SchedulePreview() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("public_schedule_slots")
    .select(
      "id, instructor_name, instructor_slug, timezone, date, lesson_type_name, lesson_type_color, start_time, status, is_booked",
    )
    .gte("date", getCurrentDate())
    .gte("start_time", new Date().toISOString())
    .eq("status", "available")
    .eq("is_booked", false)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(4);

  const slots = (data ?? []) as PreviewSlot[];

  return (
    <section className="rounded-[2rem] bg-zinc-950 p-5 text-white shadow-xl shadow-zinc-950/10 sm:p-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
            Ближайшее время
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Общее расписание
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
            Посмотрите ближайшие свободные занятия или откройте полную
            недельную сетку.
          </p>
        </div>
        <Link
          href="/schedule"
          className="inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
        >
          <CalendarDays className="size-4" />
          Открыть расписание
        </Link>
      </div>

      {error ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-zinc-300">
          Сейчас не удалось загрузить ближайшие слоты. Полное расписание
          доступно по кнопке выше.
        </div>
      ) : slots.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-7 text-center text-sm text-zinc-400">
          Ближайших свободных слотов пока нет.
        </div>
      ) : (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {slots.map((slot) => (
            <Link
              key={slot.id}
              href={`/instructors/${slot.instructor_slug}#booking`}
              className="group rounded-2xl border border-white/10 bg-white/[0.06] p-4 transition hover:bg-white/10"
              style={{
                borderLeftColor: slot.lesson_type_color,
                borderLeftWidth: 3,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-400">
                    <span className="capitalize">{formatDate(slot.date)}</span>
                    <span className="inline-flex items-center gap-1 text-white">
                      <Clock3 className="size-3.5" />
                      {formatTime(slot.start_time, slot.timezone)}
                    </span>
                  </div>
                  <p className="mt-2 font-semibold">{slot.lesson_type_name}</p>
                  <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-zinc-400">
                    <UserRound className="size-3.5" />
                    {slot.instructor_name}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-300">
                  Свободно
                </span>
              </div>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-amber-300">
                Перейти к записи
                <ArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
