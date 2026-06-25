"use client";

import { useActionState } from "react";
import { UserRoundX } from "lucide-react";
import {
  removeMemberAccessAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

export function RemoveMemberAccessAction({ memberId }: { memberId: string }) {
  const [state, formAction, isPending] = useActionState(
    removeMemberAccessAction,
    INITIAL_STATE,
  );

  return (
    <div>
      <form
        action={formAction}
        onSubmit={(event) => {
          if (
            !window.confirm(
              "Удалить связь сотрудника с платформой? Auth-пользователь и профиль инструктора сохранятся.",
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="member_id" value={memberId} />
        <Button
          type="submit"
          size="sm"
          variant="destructive"
          disabled={isPending}
        >
          <UserRoundX />
          Удалить доступ
        </Button>
      </form>
      {state.message && (
        <p
          className={`mt-1 max-w-80 text-xs ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
