"use client";

import { useActionState } from "react";
import { Eraser } from "lucide-react";
import {
  cleanupDemoProfilesAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

export function CleanupDemoProfilesAction() {
  const [state, formAction, isPending] = useActionState(
    cleanupDemoProfilesAction,
    INITIAL_STATE,
  );

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="font-semibold text-amber-950">Очистка тестовых данных</p>
      <p className="mt-1 text-sm leading-6 text-amber-800">
        Удаляет расписание и отключает профили `ivanov-ivan`,
        `anna-petrova`, `demo-excel-import`. Основной owner не затрагивается.
      </p>
      <form
        action={formAction}
        className="mt-3"
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Очистить расписание тестовых профилей, скрыть их и отключить доступ?",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isPending}
        >
          <Eraser />
          {isPending ? "Очищаем…" : "Очистить demo-данные"}
        </Button>
      </form>
      {state.message && (
        <p
          className={`mt-2 text-xs ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
