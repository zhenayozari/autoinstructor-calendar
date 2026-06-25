"use client";

import { useActionState } from "react";
import { RotateCcwKey } from "lucide-react";
import {
  resetEmployeePasswordAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

export function ResetPasswordForm({ memberId }: { memberId: string }) {
  const [state, formAction, isPending] = useActionState(
    resetEmployeePasswordAction,
    INITIAL_STATE,
  );

  return (
    <div>
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="member_id" value={memberId} />
        <Input
          name="password"
          type="password"
          minLength={8}
          maxLength={72}
          autoComplete="new-password"
          placeholder="Новый временный пароль"
          className="sm:w-56"
          required
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={isPending}
        >
          <RotateCcwKey />
          Сбросить пароль
        </Button>
      </form>
      {state.message && (
        <p
          className={`mt-1 max-w-md text-xs ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
