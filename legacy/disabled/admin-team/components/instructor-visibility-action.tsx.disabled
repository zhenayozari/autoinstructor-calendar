"use client";

import { useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
import {
  updateInstructorVisibilityAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

export function InstructorVisibilityAction({
  instructorId,
  isVisible,
}: {
  instructorId: string;
  isVisible: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateInstructorVisibilityAction,
    INITIAL_STATE,
  );

  return (
    <div>
      <form action={formAction}>
        <input type="hidden" name="instructor_id" value={instructorId} />
        <input
          type="hidden"
          name="public_is_visible"
          value={isVisible ? "false" : "true"}
        />
        <Button type="submit" size="sm" variant="outline" disabled={isPending}>
          {isVisible ? <EyeOff /> : <Eye />}
          {isVisible ? "Скрыть публично" : "Показать публично"}
        </Button>
      </form>
      {state.message && (
        <p
          className={`mt-1 max-w-72 text-xs ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}
    </div>
  );
}
