"use client";

import { useActionState, useState } from "react";
import { UserRoundPlus } from "lucide-react";
import {
  createTeamMemberAction,
  type CreateTeamMemberActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: CreateTeamMemberActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function CreateTeamMemberForm({
  currentRole,
}: {
  currentRole: "owner" | "admin";
}) {
  const [state, formAction, isPending] = useActionState(
    createTeamMemberAction,
    INITIAL_STATE,
  );
  const [role, setRole] = useState<"admin" | "instructor">("instructor");
  const [adminAlsoTeaches, setAdminAlsoTeaches] = useState(false);
  const needsInstructorProfile =
    role === "instructor" || (role === "admin" && adminAlsoTeaches);

  return (
    <form action={formAction} className="space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Пароль показывается только сейчас. Сохраните его и передайте сотруднику
        вручную.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="team-member-role">Роль</Label>
          <select
            id="team-member-role"
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
            {currentRole === "owner" && <option value="admin">Admin</option>}
            <option value="instructor">Instructor</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="team-member-email">Email для входа</Label>
          <Input
            id="team-member-email"
            name="email"
            type="email"
            autoComplete="off"
            required
          />
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="team-member-password">Временный пароль</Label>
          <Input
            id="team-member-password"
            name="temporary_password"
            type="password"
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
            required
          />
        </div>
      </div>

      {role === "admin" && (
        <label className="flex items-start gap-3 rounded-2xl border p-4">
          <input
            type="checkbox"
            name="admin_also_teaches"
            checked={adminAlsoTeaches}
            onChange={(event) => setAdminAlsoTeaches(event.target.checked)}
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block text-sm font-semibold">
              Также ведёт занятия
            </span>
            <span className="text-muted-foreground mt-1 block text-xs">
              Создать администратору публичный профиль и расписание инструктора.
            </span>
          </span>
        </label>
      )}

      {needsInstructorProfile && (
        <div className="space-y-5 rounded-2xl border bg-zinc-50/70 p-4 sm:p-5">
          <div>
            <h3 className="font-semibold">Профиль специалиста</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              Эти данные используются в расписании и публичном каталоге.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="team-member-internal-name">Внутреннее имя</Label>
              <Input
                id="team-member-internal-name"
                name="internal_name"
                placeholder="Например, Анна Петрова"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-member-public-name">Публичное имя</Label>
              <Input
                id="team-member-public-name"
                name="public_name"
                placeholder="Анна, инструктор по вождению"
                required
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="team-member-slug">Slug</Label>
              <Input
                id="team-member-slug"
                name="slug"
                placeholder="anna-petrova"
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
              />
              <p className="text-muted-foreground text-xs">
                Адрес публичного профиля: /instructors/anna-petrova
              </p>
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Направления</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
                <input
                  type="checkbox"
                  name="driving"
                  defaultChecked
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="block text-sm font-medium">Вождение</span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    Практические занятия на автомобиле.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
                <input
                  type="checkbox"
                  name="theory"
                  className="mt-0.5 size-4"
                />
                <span>
                  <span className="block text-sm font-medium">Теория</span>
                  <span className="text-muted-foreground mt-1 block text-xs">
                    Индивидуальные занятия по ПДД.
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <label className="flex items-start gap-3 rounded-xl border bg-white p-4">
            <input
              type="checkbox"
              name="public_is_visible"
              defaultChecked
              className="mt-0.5 size-4"
            />
            <span>
              <span className="block text-sm font-medium">
                Показывать профиль публично
              </span>
              <span className="text-muted-foreground mt-1 block text-xs">
                Профиль появится в каталоге, если сотрудник активен.
              </span>
            </span>
          </label>
        </div>
      )}

      <label className="flex items-start gap-3 rounded-2xl border p-4">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked
          className="mt-0.5 size-4"
        />
        <span>
          <span className="block text-sm font-semibold">Доступ активен</span>
          <span className="text-muted-foreground mt-1 block text-xs">
            Сотрудник сможет войти в административную часть.
          </span>
        </span>
      </label>

      {state.message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
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
        {isPending ? "Создаём сотрудника…" : "Добавить сотрудника"}
      </Button>
    </form>
  );
}
