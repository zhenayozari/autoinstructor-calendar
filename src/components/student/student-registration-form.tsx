"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import {
  createStudentRegistrationRequestAction,
  type StudentRegistrationActionState,
} from "@/app/student/register/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: StudentRegistrationActionState = {
  status: "idle",
  message: "",
};

export function StudentRegistrationForm({ token }: { token: string }) {
  const [state, formAction, isPending] = useActionState(
    createStudentRegistrationRequestAction,
    INITIAL_STATE,
  );
  const isSuccess = state.status === "success";

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="student-last-name">Фамилия</Label>
          <Input
            id="student-last-name"
            name="last_name"
            placeholder="Иванова"
            maxLength={80}
            disabled={isSuccess}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="student-first-name">Имя</Label>
          <Input
            id="student-first-name"
            name="first_name"
            placeholder="Мария"
            maxLength={80}
            disabled={isSuccess}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-phone">Телефон</Label>
        <Input
          id="student-phone"
          name="student_phone"
          type="tel"
          placeholder="+7 999 123-45-67"
          maxLength={40}
          disabled={isSuccess}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-school">Автошкола</Label>
        <Input
          id="student-school"
          name="school_text"
          placeholder="Как называется ваша автошкола"
          maxLength={120}
          disabled={isSuccess}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="student-register-login">Логин</Label>
          <Input
            id="student-register-login"
            name="login"
            placeholder="maria01"
            autoComplete="username"
            disabled={isSuccess}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="student-register-secret">ПИН-код/пароль</Label>
          <Input
            id="student-register-secret"
            name="secret"
            type="password"
            placeholder="Минимум 4 символа"
            autoComplete="new-password"
            disabled={isSuccess}
            required
          />
        </div>
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
          ? "Отправляем…"
          : isSuccess
            ? "Заявка отправлена"
            : "Отправить заявку"}
      </Button>
    </form>
  );
}
