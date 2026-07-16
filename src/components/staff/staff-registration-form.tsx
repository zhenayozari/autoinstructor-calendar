"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import {
  submitStaffRegistrationAction,
  type StaffRegistrationActionState,
} from "@/app/staff/register/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: StaffRegistrationActionState = {
  status: "idle",
  message: "",
};

export function StaffRegistrationForm({
  token,
  defaultName,
  defaultEmail,
  defaultPhone,
}: {
  token: string;
  defaultName?: string | null;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    submitStaffRegistrationAction,
    INITIAL_STATE,
  );
  const isSuccess = state.status === "success";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="space-y-2">
        <Label htmlFor="staff-name">Имя и фамилия</Label>
        <Input
          id="staff-name"
          name="name"
          placeholder="Например: Анна Петрова"
          defaultValue={defaultName ?? ""}
          maxLength={160}
          disabled={isSuccess}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="staff-phone">Телефон</Label>
        <Input
          id="staff-phone"
          name="phone"
          type="tel"
          placeholder="+7 999 123-45-67"
          defaultValue={defaultPhone ?? ""}
          maxLength={40}
          disabled={isSuccess}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="staff-email">Эл. почта для входа</Label>
        <Input
          id="staff-email"
          name="email"
          type="email"
          placeholder="instructor@mail.ru"
          defaultValue={defaultEmail ?? ""}
          autoComplete="username"
          maxLength={254}
          disabled={isSuccess}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="staff-password">Пароль</Label>
        <Input
          id="staff-password"
          name="password"
          type="password"
          placeholder="Минимум 8 символов"
          autoComplete="new-password"
          disabled={isSuccess}
          required
        />
      </div>

      {state.message && (
        <div
          className={`rounded-xl px-3 py-2 text-sm ${
            isSuccess
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      <Button
        type="submit"
        className="h-11 w-full"
        disabled={isPending || isSuccess}
      >
        <Send />
        {isPending
          ? "Отправляем..."
          : isSuccess
            ? "Заявка отправлена"
            : "Отправить заявку"}
      </Button>
    </form>
  );
}
