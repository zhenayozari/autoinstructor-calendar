"use client";

import { useActionState } from "react";
import { Send } from "lucide-react";
import {
  createStudentRegistrationRequestAction,
  type StudentRegistrationActionState,
} from "@/app/student/register/actions";
import { STUDENT_SECRET_MIN_LENGTH } from "@/lib/student-secret-policy";
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

      <div className="space-y-2">
        <Label htmlFor="student-display-name">Как вас подписать</Label>
        <Input
          id="student-display-name"
          name="first_name"
          placeholder="Например: Маша, Мария или ученик из ОМГ"
          maxLength={80}
          disabled={isSuccess}
        />
        <p className="text-xs leading-5 text-zinc-500">
          Можно указать имя, короткую метку или оставить поле пустым.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-contact">Способ связи</Label>
        <Input
          id="student-contact"
          name="student_phone"
          type="text"
          placeholder="Телефон, Telegram, VK или другой удобный способ"
          maxLength={200}
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
            placeholder={`Минимум ${STUDENT_SECRET_MIN_LENGTH} символов`}
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
          ? "Отправляем..."
          : isSuccess
            ? "Заявка отправлена"
            : "Отправить заявку"}
      </Button>
    </form>
  );
}
