"use client";

import { useActionState } from "react";
import { Power, PowerOff } from "lucide-react";
import {
  updateMemberStatusAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

export function MemberStatusAction({
  memberId,
  isActive,
}: {
  memberId: string;
  isActive: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateMemberStatusAction,
    INITIAL_STATE,
  );

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="member_id" value={memberId} />
        <input
          type="hidden"
          name="is_active"
          value={isActive ? "false" : "true"}
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isActive ? <PowerOff /> : <Power />}
          {isActive ? "Отключить доступ" : "Включить доступ"}
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
