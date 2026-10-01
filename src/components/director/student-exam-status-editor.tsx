"use client";

import { useActionState } from "react";
import { updateStudentExamStatusAction } from "@/app/admin/students/actions";
import { Button } from "@/components/ui/button";
import type { StudentAccessActionState } from "@/app/admin/students/actions";
import type { StudentAccess } from "@/lib/types";

const INITIAL_STATE: StudentAccessActionState = {
  status: "idle",
  message: "",
};

export function StudentExamStatusEditor({
  student,
}: {
  student: Pick<StudentAccess, "id" | "passed_exam">;
}) {
  const [state, action, isPending] = useActionState(
    updateStudentExamStatusAction,
    INITIAL_STATE,
  );

  return (
    <form
      action={action}
      className="mt-3 rounded-xl border border-violet-100 bg-violet-50/50 px-3 py-3"
    >
      <input type="hidden" name="student_access_id" value={student.id} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="passed_exam"
            value="true"
            defaultChecked={student.passed_exam}
            className="size-4"
          />
          Сдал в ГАИ
        </label>
        <Button type="submit" variant="outline" size="sm" disabled={isPending}>
          {isPending ? "Сохраняем…" : "Сохранить отметку"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Только для наглядности. Занятия и оплаты не изменяются.
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
