"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarCheck, Eye, EyeOff } from "lucide-react";
import {
  updateDayPublicationAction,
  updateWeekPublicationAction,
  type PublicationActionState,
} from "@/app/admin/actions";
import {
  formatPrettyDateTime,
  formatShortDay,
  getUtcWeekDates,
  selectClassName,
} from "@/lib/formatters";
import type { Instructor, ScheduleDay } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL_STATE: PublicationActionState = {
  status: "idle",
  message: "",
};

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
          Публикация: {formatPrettyDateTime(day.published_at, timezone)}
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
  const weekDates = useMemo(() => getUtcWeekDates(weekDate), [weekDate]);
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
                    {formatShortDay(date)}
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
