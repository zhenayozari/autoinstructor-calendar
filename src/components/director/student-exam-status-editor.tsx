"use client";

import { useActionState, useRef, useState } from "react";
import { updateStudentExamStatusAction } from "@/app/admin/students/actions";
import { Button } from "@/components/ui/button";
import type { StudentAccessActionState } from "@/app/admin/students/actions";
import type { StudentAccess, StudentExamStatus } from "@/lib/types";

const INITIAL_STATE: StudentAccessActionState = {
  status: "idle",
  message: "",
};

export function StudentExamStatusEditor({
  student,
}: {
  student: Pick<StudentAccess, "id" | "passed_exam" | "exam_status">;
}) {
  const [state, action, isPending] = useActionState(
    updateStudentExamStatusAction,
    INITIAL_STATE,
  );
  const [examStatus, setExamStatus] = useState<StudentExamStatus>(
    student.exam_status ?? (student.passed_exam ? "passed" : "training"),
  );
  const statusInputRef = useRef<HTMLInputElement>(null);

  function selectStatus(status: StudentExamStatus, checked: boolean) {
    const nextStatus = checked ? status : "training";
    setExamStatus(nextStatus);
    if (statusInputRef.current) {
      statusInputRef.current.value = nextStatus;
    }
  }

  return (
    <form
      action={action}
      className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-3"
    >
      <input type="hidden" name="student_access_id" value={student.id} />
      <input
        ref={statusInputRef}
        type="hidden"
        name="exam_status"
        defaultValue={examStatus}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-sm font-medium">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={examStatus === "passed"}
              onChange={(event) =>
                selectStatus("passed", event.currentTarget.checked)
              }
              className="size-4"
            />
            Сдал в ГАИ
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={examStatus === "failed"}
              onChange={(event) =>
                selectStatus("failed", event.currentTarget.checked)
              }
              className="size-4"
            />
            Не сдал в ГАИ
          </label>
          {examStatus === "training" && (
            <span className="text-xs font-normal text-zinc-500">
              Обучается
            </span>
          )}
        </div>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? "Сохраняем…" : "Сохранить отметку"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Если обе отметки сняты, ученик считается обучающимся. Занятия и оплаты
        не изменяются.
      </p>
      {state.message && (
        <p
          className={`mt-2 text-xs ${
            state.status === "error" ? "text-red-700" : "text-emerald-700"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
