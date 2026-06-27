"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";
import {
  studentLoginAction,
  type StudentLoginActionState,
} from "@/app/student/login/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: StudentLoginActionState = {
  status: "idle",
  message: "",
};

export function StudentLoginForm() {
  const [state, formAction, isPending] = useActionState(
    studentLoginAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="student-login">Логин</Label>
        <Input
          id="student-login"
          name="login"
          placeholder="Например: u123456"
          autoComplete="username"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-secret">PIN/пароль</Label>
        <Input
          id="student-secret"
          name="secret"
          type="password"
          placeholder="Код, который дал инструктор"
          autoComplete="current-password"
          required
        />
      </div>

      {state.status === "error" && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.message}
        </div>
      )}

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        <LogIn />
        {isPending ? "Входим…" : "Войти"}
      </Button>
    </form>
  );
}
