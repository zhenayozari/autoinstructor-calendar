"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarCheck, Eye, EyeOff } from "lucide-react";
import {
  updateDayPublicationAction,
  updateWeekPublicationAction,
  type PublicationActionState,
} from "@/app/admin/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Instructor = {
  id: string;
  name: string;
  timezone: string;
};

type ScheduleDay = {
  id: string;
  instructor_id: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  published_at: string | null;
  slot_count: number;
};

const INITIAL_STATE: PublicationActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(value: string) {
  const date = parseDate(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function getWeekDates(value: string) {
  const monday = getWeekStart(value);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(monday.getUTCDate() + index);
    return formatDate(date);
  });
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function formatPublishedAt(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function DayPublicationAction({
  day,
  timezone,
}: {
  day: ScheduleDay;
  timezone: string;
}) {
  const [state, formAction, isPending] = useActionState(
    updateDayPublicationAction,
    INITIAL_STATE,
  );
  const [mode, setMode] = useState("now");

  return (
    <form action={formAction} className="mt-3 space-y-2 border-t pt-3">
      <input type="hidden" name="schedule_day_id" value={day.id} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <select
          name="publication_mode"
          className={selectClassName}
          value={mode}
          onChange={(event) => setMode(event.target.value)}
        >
          <option value="now">Опубликовать день</option>
          <option value="hidden">Скрыть день</option>
          <option value="scheduled">Запланировать</option>
        </select>

        {mode === "scheduled" ? (
          <Input name="publication_at" type="datetime-local" required />
        ) : (
          <div />
        )}

        <Button type="submit" className="h-9" disabled={isPending}>
          <CalendarCheck />
          Применить
        </Button>
      </div>

      {state.message && (
        <p
          className={`text-xs ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}

      {day.published_at && (
        <p className="text-muted-foreground text-xs">
          Публикация: {formatPublishedAt(day.published_at, timezone)}
        </p>
      )}
    </form>
  );
}

export function SchedulePublicationPanel({
  instructors,
  scheduleDays,
  instructorId,
  weekDate,
}: {
  instructors: Instructor[];
  scheduleDays: ScheduleDay[];
  instructorId: string;
  weekDate: string;
}) {
  const [weekState, weekAction, isWeekPending] = useActionState(
    updateWeekPublicationAction,
    INITIAL_STATE,
  );
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === instructorId,
  );
  const weekDates = useMemo(() => getWeekDates(weekDate), [weekDate]);
  const daysByDate = useMemo(
    () =>
      new Map(
        scheduleDays
          .filter((day) => day.instructor_id === instructorId)
          .map((day) => [day.date, day]),
      ),
    [instructorId, scheduleDays],
  );

  return (
    <div className="space-y-4">
      <form action={weekAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="instructor_id" value={instructorId} />
        <input type="hidden" name="week_date" value={weekDate} />
        <Button
          type="submit"
          name="operation"
          value="publish"
          className="h-10"
          disabled={isWeekPending || !instructorId}
        >
          <Eye />
          Опубликовать неделю
        </Button>
        <Button
          type="submit"
          name="operation"
          value="hide"
          variant="outline"
          className="h-10"
          disabled={isWeekPending || !instructorId}
        >
          <EyeOff />
          Скрыть неделю
        </Button>
        {weekState.message && (
          <span
            className={`text-sm ${
              weekState.status === "success"
                ? "text-emerald-700"
                : "text-red-600"
            }`}
          >
            {weekState.message}
          </span>
        )}
      </form>

      <div className="grid gap-2">
        {weekDates.map((date) => {
          const day = daysByDate.get(date);
          const isPublished =
            day?.published_at && new Date(day.published_at) <= new Date();
          const isScheduled =
            day?.published_at && new Date(day.published_at) > new Date();

          return (
            <div key={date} className="rounded-xl border bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold capitalize">
                    {formatDay(date)}
                  </p>
                  <p className="text-muted-foreground text-xs">{date}</p>
                </div>

                {day ? (
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">Слотов: {day.slot_count}</Badge>
                    <Badge
                      className={
                        isPublished
                          ? "bg-emerald-100 text-emerald-800"
                          : isScheduled
                            ? "bg-blue-100 text-blue-800"
                            : "bg-zinc-100 text-zinc-600"
                      }
                    >
                      {isPublished
                        ? "Опубликован"
                        : isScheduled
                          ? "Запланирован"
                          : "Скрыт"}
                    </Badge>
                  </div>
                ) : (
                  <Badge variant="outline">Нет расписания</Badge>
                )}
              </div>

              {day && selectedInstructor && (
                <DayPublicationAction
                  day={day}
                  timezone={selectedInstructor.timezone}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
