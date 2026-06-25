"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarPlus, Clock3 } from "lucide-react";
import { createSlotAction, type SlotActionState } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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

const INITIAL_STATE: SlotActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function addMinutes(time: string, minutes: number) {
  const [hours, currentMinutes] = time.split(":").map(Number);
  const total = hours * 60 + currentMinutes + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

export function SlotForm({
  instructors,
  lessonTypes,
  adminEnabled,
  defaultDate,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  adminEnabled: boolean;
  defaultDate?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createSlotAction,
    INITIAL_STATE,
  );
  const [lessonTypeId, setLessonTypeId] = useState(lessonTypes[0]?.id ?? "");
  const [startTime, setStartTime] = useState("10:00");
  const selectedLessonType = useMemo(
    () => lessonTypes.find((lessonType) => lessonType.id === lessonTypeId),
    [lessonTypeId, lessonTypes],
  );
  const endTime = selectedLessonType
    ? addMinutes(startTime, selectedLessonType.default_duration_minutes)
    : null;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="instructor_id">Инструктор</Label>
          <select
            id="instructor_id"
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
          <Label htmlFor="date">Дата</Label>
          <Input
            id="date"
            name="date"
            type="date"
            required
            defaultValue={defaultDate}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="lesson_type_id">Тип занятия</Label>
          <select
            id="lesson_type_id"
            name="lesson_type_id"
            className={selectClassName}
            required
            value={lessonTypeId}
            onChange={(event) => setLessonTypeId(event.target.value)}
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
          {selectedLessonType && (
            <p className="text-muted-foreground text-xs">
              Длительность: {selectedLessonType.default_duration_minutes} мин.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_time">Начало</Label>
          <Input
            id="start_time"
            name="start_time"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          {endTime && (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <Clock3 className="size-3" />
              Окончание автоматически: {endTime}
            </p>
          )}
        </div>

        {selectedLessonType?.kind === "driving" && (
          <div className="space-y-2">
            <Label htmlFor="transmission">Коробка передач</Label>
            <select
              id="transmission"
              name="transmission"
              className={selectClassName}
              required
              defaultValue="automatic"
            >
              <option value="automatic">АКПП</option>
              <option value="manual">МКПП</option>
            </select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="location_type">Формат занятия</Label>
          <select
            id="location_type"
            name="location_type"
            className={selectClassName}
            required
            defaultValue={selectedLessonType?.kind === "theory" ? "online" : "in_car"}
            key={selectedLessonType?.kind}
          >
            <option value="in_car">В автомобиле</option>
            <option value="online">Онлайн</option>
            <option value="classroom">В классе</option>
            <option value="other">Другое</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slot-note">Внутренняя заметка</Label>
        <Textarea
          id="slot-note"
          name="note"
          maxLength={500}
          placeholder="Например: оплата, рассчитали от 22.06, комментарий для себя"
        />
        <p className="text-muted-foreground text-xs">
          Видна только в админке и не показывается ученикам.
        </p>
      </div>

      {state.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      {!adminEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Для создания слотов добавьте серверный ключ{" "}
          <code className="font-semibold">SUPABASE_SECRET_KEY</code> в{" "}
          <code className="font-semibold">.env.local</code>.
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={
          isPending ||
          !adminEnabled ||
          instructors.length === 0 ||
          lessonTypes.length === 0
        }
      >
        <CalendarPlus />
        {isPending ? "Создаём…" : "Создать слот"}
      </Button>
    </form>
  );
}
