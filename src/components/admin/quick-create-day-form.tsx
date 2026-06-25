"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarRange } from "lucide-react";
import {
  quickCreateDayAction,
  type QuickCreateDayActionState,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PublicationOptions } from "@/components/admin/publication-options";

type Instructor = {
  id: string;
  name: string;
};

type LessonType = {
  id: string;
  name: string;
  kind: "driving" | "theory";
  default_duration_minutes: number;
};

const INITIAL_STATE: QuickCreateDayActionState = {
  status: "idle",
  message: "",
  createdCount: 0,
  conflicts: [],
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function QuickCreateDayForm({
  instructors,
  lessonTypes,
  adminEnabled,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  adminEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    quickCreateDayAction,
    INITIAL_STATE,
  );
  const [lessonTypeId, setLessonTypeId] = useState(lessonTypes[0]?.id ?? "");
  const selectedLessonType = useMemo(
    () => lessonTypes.find((lessonType) => lessonType.id === lessonTypeId),
    [lessonTypeId, lessonTypes],
  );
  const [durationMinutes, setDurationMinutes] = useState(
    selectedLessonType?.default_duration_minutes ?? 60,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="quick-instructor-id">Инструктор</Label>
          <select
            id="quick-instructor-id"
            name="instructor_id"
            className={selectClassName}
            required
            defaultValue={instructors[0]?.id}
          >
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-date">Дата</Label>
          <Input id="quick-date" name="date" type="date" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-lesson-type">Тип занятия</Label>
          <select
            id="quick-lesson-type"
            name="lesson_type_id"
            className={selectClassName}
            required
            value={lessonTypeId}
            onChange={(event) => {
              const nextLessonTypeId = event.target.value;
              const nextLessonType = lessonTypes.find(
                (lessonType) => lessonType.id === nextLessonTypeId,
              );
              setLessonTypeId(nextLessonTypeId);

              if (nextLessonType) {
                setDurationMinutes(nextLessonType.default_duration_minutes);
              }
            }}
          >
            {lessonTypes.length > 0 && (
              <option disabled value="">
                ── Активные типы из справочника ──
              </option>
            )}
            {lessonTypes.map((lessonType) => (
              <option key={lessonType.id} value={lessonType.id}>
                {lessonType.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a
              href="#lesson-types-settings"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              + Добавить свой
            </a>
            <span className="text-muted-foreground">·</span>
            <a
              href="#lesson-types-settings"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Управление типами
            </a>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-transmission">Коробка передач</Label>
          <select
            id="quick-transmission"
            name="transmission"
            className={selectClassName}
            required={selectedLessonType?.kind === "driving"}
            disabled={selectedLessonType?.kind === "theory"}
            defaultValue="automatic"
          >
            <option value="automatic">АКПП</option>
            <option value="manual">МКПП</option>
          </select>
          {selectedLessonType?.kind === "theory" && (
            <p className="text-muted-foreground text-xs">
              Для теории коробка передач не применяется.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-work-start">Начало рабочего дня</Label>
          <Input
            id="quick-work-start"
            name="work_start_time"
            type="time"
            defaultValue="09:00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-work-end">Окончание рабочего дня</Label>
          <Input
            id="quick-work-end"
            name="work_end_time"
            type="time"
            defaultValue="18:00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-duration">Длительность занятия, минут</Label>
          <Input
            id="quick-duration"
            name="duration_minutes"
            type="number"
            min={15}
            max={480}
            step={5}
            value={durationMinutes}
            onChange={(event) =>
              setDurationMinutes(Number(event.target.value))
            }
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="quick-break">Перерыв между занятиями, минут</Label>
          <Input
            id="quick-break"
            name="break_minutes"
            type="number"
            min={0}
            max={240}
            step={5}
            defaultValue={15}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="quick-day-note">Внутренняя заметка</Label>
        <Textarea
          id="quick-day-note"
          name="note"
          maxLength={500}
          placeholder="Например: оплата, рассчитали от 22.06, комментарий для себя"
        />
        <p className="text-muted-foreground text-xs">
          Если заполнено, заметка будет добавлена ко всем созданным слотам.
        </p>
      </div>

      <PublicationOptions idPrefix="quick-day" />

      {state.message && (
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
              <p className="font-semibold">Не созданы:</p>
              <ul className="mt-1 list-inside list-disc">
                {state.conflicts.map((conflict) => (
                  <li key={conflict}>{conflict}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!adminEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Для создания слотов добавьте серверный ключ{" "}
          <code className="font-semibold">SUPABASE_SECRET_KEY</code>.
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        disabled={
          isPending ||
          !adminEnabled ||
          instructors.length === 0 ||
          lessonTypes.length === 0
        }
      >
        <CalendarRange />
        {isPending ? "Создаём день…" : "Создать слоты на день"}
      </Button>
    </form>
  );
}
