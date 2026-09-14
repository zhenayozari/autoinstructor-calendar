"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, KeyRound, Save } from "lucide-react";
import {
  updateAccountCredentialsAction,
  type AccountCredentialsActionState,
} from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: AccountCredentialsActionState = {
  status: "idle",
  message: "",
};

function PasswordInput({
  id,
  name,
  label,
  autoComplete,
  placeholder,
  required,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          minLength={required ? 1 : undefined}
          maxLength={72}
          className="pr-11"
          required={required}
        />
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-11 place-items-center"
          aria-label={isVisible ? "Скрыть пароль" : "Показать пароль"}
          onClick={() => setIsVisible((current) => !current)}
        >
          {isVisible ? (
            <EyeOff className="size-4" />
          ) : (
            <Eye className="size-4" />
          )}
        </button>
      </div>
    </div>
  );
}

export function AccountCredentialsForm({
  email,
  canManageCredentials,
}: {
  email: string;
  canManageCredentials: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateAccountCredentialsAction,
    INITIAL_STATE,
  );

  if (!canManageCredentials) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
        Сейчас проект работает через Supabase Auth. Эта форма начнёт менять
        логин и пароль после переключения на PostgreSQL-режим.
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="rounded-xl border bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700">
        Эл. почта ниже — это логин для входа сотрудника. Для сохранения любого
        изменения нужен текущий пароль.
      </div>

      <div className="space-y-2">
        <Label htmlFor="account-email">Эл. почта для входа</Label>
        <Input
          id="account-email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={email}
          maxLength={254}
          required
        />
      </div>

      <PasswordInput
        id="account-current-password"
        name="current_password"
        label="Текущий пароль"
        autoComplete="current-password"
        required
      />

      <div className="grid gap-4 md:grid-cols-2">
        <PasswordInput
          id="account-new-password"
          name="new_password"
          label="Новый пароль"
          autoComplete="new-password"
          placeholder="Можно оставить пустым"
        />
        <PasswordInput
          id="account-new-password-repeat"
          name="new_password_repeat"
          label="Повтор нового пароля"
          autoComplete="new-password"
          placeholder="Если меняете пароль"
        />
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
        {isPending ? <KeyRound /> : <Save />}
        {isPending ? "Сохраняем..." : "Сохранить вход"}
      </Button>
    </form>
  );
}
