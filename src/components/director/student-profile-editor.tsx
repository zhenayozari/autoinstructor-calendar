"use client";

import { useActionState } from "react";
import { Pencil } from "lucide-react";
import { updateStudentProfileAction } from "@/app/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { StudentAccess } from "@/lib/types";

const INITIAL_STATE = {
  status: "idle" as const,
  message: "",
};

export function StudentProfileEditor({
  student,
}: {
  student: Pick<
    StudentAccess,
    "id" | "first_name" | "last_name" | "student_phone"
  >;
}) {
  const [state, formAction, isPending] = useActionState(
    updateStudentProfileAction,
    INITIAL_STATE,
  );

  return (
    <details className="mt-4 rounded-xl border border-sky-100 bg-sky-50/50">
      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-sky-950">
        Редактировать данные ученика
      </summary>
      <form action={formAction} className="space-y-4 border-t border-sky-100 p-3">
        <input type="hidden" name="student_access_id" value={student.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`director-last-name-${student.id}`}>
              Фамилия
            </Label>
            <Input
              id={`director-last-name-${student.id}`}
              name="last_name"
              defaultValue={student.last_name ?? ""}
              placeholder="Иванова"
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`director-first-name-${student.id}`}>Имя</Label>
            <Input
              id={`director-first-name-${student.id}`}
              name="first_name"
              defaultValue={student.first_name ?? ""}
              placeholder="Анна"
              maxLength={80}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`director-phone-${student.id}`}>Способ связи</Label>
          <Input
            id={`director-phone-${student.id}`}
            name="student_phone"
            defaultValue={student.student_phone ?? ""}
            placeholder="Телефон или мессенджер"
            maxLength={200}
          />
        </div>
        {state.message && (
          <p
            className={
              state.status === "error"
                ? "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                : "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
            }
          >
            {state.message}
          </p>
        )}
        <Button type="submit" variant="outline" disabled={isPending}>
          <Pencil />
          {isPending ? "Сохраняем…" : "Сохранить данные ученика"}
        </Button>
      </form>
    </details>
  );
}
