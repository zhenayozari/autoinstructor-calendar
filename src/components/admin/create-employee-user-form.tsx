"use client";

import { useActionState, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import {
  createEmployeeUserAction,
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

export function CreateEmployeeUserForm({
  instructors,
  currentRole,
}: {
  instructors: Instructor[];
  currentRole: "owner" | "admin";
}) {
  const [state, formAction, isPending] = useActionState(
    createEmployeeUserAction,
    INITIAL_STATE,
  );
  const [role, setRole] = useState<"admin" | "instructor">("instructor");

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Пароль показывается только в момент создания или сброса. Сохраните его и
        передайте сотруднику вручную.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="new-user-email">Email</Label>
          <Input
            id="new-user-email"
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-user-password">Временный пароль</Label>
          <Input
            id="new-user-password"
            name="password"
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="new-user-role">Роль</Label>
          <select
            id="new-user-role"
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
          <Label htmlFor="new-user-instructor">Инструктор</Label>
          <select
            id="new-user-instructor"
            name="instructor_id"
            className={selectClassName}
            required={role === "instructor"}
            defaultValue=""
          >
            <option value="">
              {role === "instructor" ? "Выберите инструктора" : "Не выбран"}
            </option>
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.public_name ?? instructor.name}
              </option>
            ))}
          </select>
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
        <UserRoundPlus />
        {isPending ? "Создаём…" : "Создать пользователя"}
      </Button>
    </form>
  );
}
