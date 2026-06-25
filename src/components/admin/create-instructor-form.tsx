"use client";

import { useActionState } from "react";
import { UserRoundPlus } from "lucide-react";
import {
  createInstructorAction,
  type CreateInstructorActionState,
} from "@/app/admin/team/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: CreateInstructorActionState = {
  status: "idle",
  message: "",
};

export function CreateInstructorForm() {
  const [state, formAction, isPending] = useActionState(
    createInstructorAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Внутреннее имя</Label>
          <Input
            id="name"
            name="name"
            placeholder="Например, Анна Петрова"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug</Label>
          <Input
            id="slug"
            name="slug"
            placeholder="anna-petrova"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
          <p className="text-muted-foreground text-xs">
            Используется в публичном URL.
          </p>
        </div>

        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="public_name">Публичное имя</Label>
          <Input
            id="public_name"
            name="public_name"
            placeholder="Анна, инструктор по вождению"
            required
          />
        </div>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Направления</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border p-4">
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
          <label className="flex items-start gap-3 rounded-xl border p-4">
            <input type="checkbox" name="theory" className="mt-0.5 size-4" />
            <span>
              <span className="block text-sm font-medium">Теория</span>
              <span className="text-muted-foreground mt-1 block text-xs">
                Индивидуальные занятия по ПДД.
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl border p-4">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block text-sm font-medium">Активен</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              Можно создавать расписание и слоты.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border p-4">
          <input
            type="checkbox"
            name="public_is_visible"
            defaultChecked
            className="mt-0.5 size-4"
          />
          <span>
            <span className="block text-sm font-medium">Публичный профиль</span>
            <span className="text-muted-foreground mt-1 block text-xs">
              Показывать в каталоге инструкторов.
            </span>
          </span>
        </label>
      </div>

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
        {isPending ? "Создаём…" : "Добавить инструктора"}
      </Button>
    </form>
  );
}
