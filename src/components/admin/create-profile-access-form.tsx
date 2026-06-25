"use client";

import { useActionState, useState } from "react";
import { KeyRound, X } from "lucide-react";
import {
  createAccessForInstructorAction,
  type MemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: MemberActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function CreateProfileAccessForm({
  instructorId,
  currentRole,
}: {
  instructorId: string;
  currentRole: "owner" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<"admin" | "instructor">("instructor");
  const [adminAlsoTeaches, setAdminAlsoTeaches] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createAccessForInstructorAction,
    INITIAL_STATE,
  );

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <KeyRound />
        Создать доступ
      </Button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-3 rounded-xl border bg-zinc-50 p-3">
      <input type="hidden" name="instructor_id" value={instructorId} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">Создать доступ к профилю</p>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Закрыть форму"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`access-email-${instructorId}`}>Email</Label>
          <Input
            id={`access-email-${instructorId}`}
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`access-password-${instructorId}`}>
            Временный пароль
          </Label>
          <Input
            id={`access-password-${instructorId}`}
            name="password"
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`access-role-${instructorId}`}>Роль</Label>
          <select
            id={`access-role-${instructorId}`}
            name="role"
            className={selectClassName}
            value={role}
            onChange={(event) => {
              const nextRole = event.target.value as "admin" | "instructor";
              setRole(nextRole);
              if (nextRole === "instructor") {
                setAdminAlsoTeaches(false);
              }
            }}
          >
            <option value="instructor">Instructor</option>
            {currentRole === "owner" && <option value="admin">Admin</option>}
          </select>
        </div>
        <label className="flex items-center gap-2 self-end rounded-lg border bg-white px-3 py-2">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked
            className="size-4"
          />
          <span className="text-sm font-medium">Доступ активен</span>
        </label>
      </div>
      {role === "admin" && (
        <label className="flex items-start gap-2 rounded-lg border bg-white px-3 py-2">
          <input
            type="checkbox"
            name="admin_also_teaches"
            checked={adminAlsoTeaches}
            onChange={(event) => setAdminAlsoTeaches(event.target.checked)}
            className="mt-0.5 size-4"
          />
          <span className="text-sm">
            <span className="block font-medium">Также ведёт занятия</span>
            <span className="text-muted-foreground block text-xs">
              Только в этом случае admin будет связан с данным профилем.
            </span>
          </span>
        </label>
      )}
      {state.message && (
        <p
          className={`text-xs ${
            state.status === "success" ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {state.message}
        </p>
      )}
      <Button type="submit" size="sm" disabled={isPending}>
        <KeyRound />
        {isPending
          ? "Создаём…"
          : role === "admin" && !adminAlsoTeaches
            ? "Создать admin без профиля"
            : "Создать доступ"}
      </Button>
    </form>
  );
}
