"use client";

import { useActionState } from "react";
import { Power, PowerOff, Trash2 } from "lucide-react";
import {
  deleteInstructorProfileAction,
  updateInstructorStatusAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

export function InstructorProfileActions({
  instructorId,
  isActive,
  protectedProfile,
}: {
  instructorId: string;
  isActive: boolean;
  protectedProfile: boolean;
}) {
  const [statusState, statusAction, statusPending] = useActionState(
    updateInstructorStatusAction,
    INITIAL_STATE,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteInstructorProfileAction,
    INITIAL_STATE,
  );

  if (protectedProfile) {
    return (
      <p className="text-muted-foreground text-xs">
        Основной профиль owner защищён от деактивации и удаления.
      </p>
    );
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex flex-wrap gap-2">
        <form action={statusAction}>
          <input type="hidden" name="instructor_id" value={instructorId} />
          <input
            type="hidden"
            name="is_active"
            value={isActive ? "false" : "true"}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={statusPending}
          >
            {isActive ? <PowerOff /> : <Power />}
            {isActive ? "Деактивировать профиль" : "Активировать профиль"}
          </Button>
        </form>

        <form
          action={deleteAction}
          onSubmit={(event) => {
            if (
              !window.confirm(
                "Удалить профиль и расписание? Будут удалены schedule_days, slots, bookings, settings и capabilities. Это действие нельзя отменить.",
              )
            ) {
              event.preventDefault();
            }
          }}
        >
          <input type="hidden" name="instructor_id" value={instructorId} />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={deletePending}
          >
            <Trash2 />
            Удалить профиль и расписание
          </Button>
        </form>
      </div>
      {(statusState.message || deleteState.message) && (
        <p
          className={`text-xs ${
            statusState.status === "error" || deleteState.status === "error"
              ? "text-red-600"
              : "text-emerald-700"
          }`}
        >
          {deleteState.message || statusState.message}
        </p>
      )}
    </div>
  );
}
