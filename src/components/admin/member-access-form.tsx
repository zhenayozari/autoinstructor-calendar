"use client";

import { useActionState, useState } from "react";
import { KeyRound } from "lucide-react";
import {
  saveOrganizationMemberAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Instructor = {
  id: string;
  name: string;
  public_name: string | null;
};

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function MemberAccessForm({
  instructors,
  currentRole,
}: {
  instructors: Instructor[];
  currentRole: "owner" | "admin";
}) {
  const [state, formAction, isPending] = useActionState(
    saveOrganizationMemberAction,
    INITIAL_STATE,
  );
  const [role, setRole] = useState<"admin" | "instructor">("instructor");

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="member-email">Email пользователя</Label>
          <Input
            id="member-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="member-user-id">Auth user ID / UID</Label>
          <Input
            id="member-user-id"
            name="user_id"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="member-role">Роль</Label>
          <select
            id="member-role"
            name="role"
            className={selectClassName}
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "admin" | "instructor")
            }
          >
            {currentRole === "owner" && <option value="admin">Admin</option>}
            <option value="instructor">Instructor</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="member-instructor">Связанный инструктор</Label>
          <select
            id="member-instructor"
            name="instructor_id"
            className={selectClassName}
            required={role === "instructor"}
            defaultValue=""
          >
            <option value="">
              {role === "instructor"
                ? "Выберите инструктора"
                : "Без профиля инструктора"}
            </option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.public_name ?? instructor.name}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Для instructor профиль обязателен, для admin — необязателен.
          </p>
        </div>
      </div>

      <label className="flex w-fit items-center gap-3 rounded-xl border px-4 py-3">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked
          className="size-4"
        />
        <span className="text-sm font-medium">Доступ активен</span>
      </label>

      {state.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      <Button type="submit" size="lg" disabled={isPending}>
        <KeyRound />
        {isPending ? "Сохраняем…" : "Привязать существующего пользователя"}
      </Button>
    </form>
  );
}
