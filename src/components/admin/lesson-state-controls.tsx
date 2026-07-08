"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Save, UserX } from "lucide-react";
import {
  saveBookingInstructorNoteAction,
  updateBookingLessonStateAction,
} from "@/app/admin/actions";
import type { LessonState } from "@/lib/types";
import { cn } from "@/lib/utils";

type LessonStateControlsProps = {
  bookingId: string;
  lessonState: LessonState;
  instructorNote?: string | null;
  disabled?: boolean;
};

const stateOptions = [
  {
    value: "scheduled",
    label: "План",
    icon: Circle,
    className: "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
    activeClassName: "border-zinc-400 bg-zinc-900 text-white",
  },
  {
    value: "completed",
    label: "Проведено",
    icon: CheckCircle2,
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100",
    activeClassName: "border-emerald-500 bg-emerald-600 text-white",
  },
  {
    value: "no_show",
    label: "Неявка",
    icon: UserX,
    className: "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100",
    activeClassName: "border-rose-500 bg-rose-600 text-white",
  },
] as const;

export function getLessonStateLabel(lessonState: LessonState) {
  if (lessonState === "completed") return "Проведено";
  if (lessonState === "no_show") return "Неявка";
  return "План";
}

export function LessonStateControls({
  bookingId,
  lessonState,
  instructorNote,
  disabled = false,
}: LessonStateControlsProps) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState(instructorNote ?? "");
  const isDisabled = disabled || isPending;

  function updateState(nextState: LessonState) {
    const formData = new FormData();
    formData.set("booking_id", bookingId);
    formData.set("lesson_state", nextState);
    startTransition(async () => {
      await updateBookingLessonStateAction(formData);
    });
  }

  function saveNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      await saveBookingInstructorNoteAction(formData);
    });
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-1.5">
        {stateOptions.map(({ value, label, icon: Icon, className, activeClassName }) => {
          const isActive = lessonState === value;

          return (
            <button
              key={value}
              type="button"
              disabled={isDisabled || isActive}
              onClick={() => updateState(value)}
              className={cn(
                "flex min-h-9 items-center justify-center gap-1 rounded-lg border px-1.5 text-[11px] font-semibold transition-colors sm:text-xs",
                isActive ? activeClassName : className,
                isDisabled && "cursor-not-allowed opacity-60",
              )}
              aria-pressed={isActive}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      <form onSubmit={saveNote} className="flex gap-1.5">
        <input type="hidden" name="booking_id" value={bookingId} />
        <input
          name="instructor_note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={1000}
          disabled={isDisabled}
          placeholder="Заметка после занятия"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 min-w-0 flex-1 rounded-lg border px-2.5 text-xs outline-none focus-visible:ring-2"
        />
        <button
          type="submit"
          disabled={isDisabled}
          className="grid size-9 shrink-0 place-items-center rounded-lg border bg-white text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Сохранить заметку"
        >
          <Save className="size-3.5" />
        </button>
      </form>
    </div>
  );
}
