"use client";

import { useActionState } from "react";
import { CalendarClock, CalendarSync } from "lucide-react";
import {
  copyDayAction,
  copyWeekAction,
  type CopyScheduleActionState,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicationOptions } from "@/components/admin/publication-options";

type Instructor = {
  id: string;
  name: string;
};

const INITIAL_STATE: CopyScheduleActionState = {
  status: "idle",
  message: "",
  createdCount: 0,
  conflicts: [],
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function ActionResult({ state }: { state: CopyScheduleActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm ${
        state.status === "success"
          ? "bg-emerald-50 text-emerald-800"
          : "bg-red-50 text-red-700"
      }`}
    >
      <p>{state.message}</p>
      {state.conflicts.length > 0 && (
        <div className="mt-3">
          <p className="font-semibold">Не скопированы:</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {state.conflicts.map((conflict, index) => (
              <li key={`${conflict}-${index}`}>{conflict}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CopyDayForm({
  instructors,
  adminEnabled,
}: {
  instructors: Instructor[];
  adminEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    copyDayAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="copy-day-instructor">Инструктор</Label>
          <select
            id="copy-day-instructor"
            name="instructor_id"
            className={selectClassName}
            defaultValue={instructors[0]?.id}
            required
          >
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="copy-source-date">Дата-источник</Label>
          <Input
            id="copy-source-date"
            name="source_date"
            type="date"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="copy-target-date">Дата-назначение</Label>
          <Input
            id="copy-target-date"
            name="target_date"
            type="date"
            required
          />
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-xl border p-4">
        <input
          type="checkbox"
          name="preserve_transmission"
          defaultChecked
          className="mt-0.5 size-4"
        />
        <span>
          <span className="block text-sm font-medium">
            Сохранить коробку передач
          </span>
          <span className="text-muted-foreground mt-1 block text-xs">
            Для дня с практическими занятиями настройку нужно сохранить.
          </span>
        </span>
      </label>

      <PublicationOptions idPrefix="copy-day" />

      <ActionResult state={state} />

      <Button
        type="submit"
        disabled={isPending || !adminEnabled || instructors.length === 0}
      >
        <CalendarClock />
        {isPending ? "Копируем день…" : "Скопировать день"}
      </Button>
    </form>
  );
}

export function CopyWeekForm({
  instructors,
  adminEnabled,
}: {
  instructors: Instructor[];
  adminEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    copyWeekAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="copy-week-instructor">Инструктор</Label>
          <select
            id="copy-week-instructor"
            name="instructor_id"
            className={selectClassName}
            defaultValue={instructors[0]?.id}
            required
          >
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="copy-source-week">Неделя-источник</Label>
          <Input
            id="copy-source-week"
            name="source_week"
            type="date"
            required
          />
          <p className="text-muted-foreground text-xs">
            Можно выбрать любую дату нужной недели.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="copy-target-week">Неделя-назначение</Label>
          <Input
            id="copy-target-week"
            name="target_week"
            type="date"
            required
          />
          <p className="text-muted-foreground text-xs">
            Расписание переносится с понедельника по воскресенье.
          </p>
        </div>
      </div>

      <PublicationOptions idPrefix="copy-week" />

      <ActionResult state={state} />

      <Button
        type="submit"
        disabled={isPending || !adminEnabled || instructors.length === 0}
      >
        <CalendarSync />
        {isPending ? "Копируем неделю…" : "Скопировать неделю"}
      </Button>
    </form>
  );
}
