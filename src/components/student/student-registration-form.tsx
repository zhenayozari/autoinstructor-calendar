"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ExternalLink, Send } from "lucide-react";
import {
  createStudentRegistrationRequestAction,
  type StudentRegistrationActionState,
} from "@/app/student/register/actions";
import {
  hasRequiredStudentLegalDocuments,
  LegalConsentCheckboxes,
} from "@/components/student/legal-consent-checkboxes";
import { STUDENT_SECRET_MIN_LENGTH } from "@/lib/student-secret-policy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: StudentRegistrationActionState = {
  status: "idle",
  message: "",
};

type PublishedLegalDocumentLink = {
  id: string;
  title: string;
  href: string;
  documentType: string;
};

export function StudentRegistrationForm({
  token,
  documents = [],
  requiresConsent = false,
}: {
  token: string;
  documents?: PublishedLegalDocumentLink[];
  requiresConsent?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    createStudentRegistrationRequestAction,
    INITIAL_STATE,
  );
  const isSuccess = state.status === "success";
  const hasRequiredDocuments = hasRequiredStudentLegalDocuments(documents);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="student-last-name">Фамилия</Label>
          <Input
            id="student-last-name"
            name="last_name"
            autoComplete="family-name"
            maxLength={80}
            disabled={isSuccess}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="student-first-name">Имя</Label>
          <Input
            id="student-first-name"
            name="first_name"
            autoComplete="given-name"
            maxLength={80}
            disabled={isSuccess}
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="student-contact">Способ связи</Label>
        <Input
          id="student-contact"
          name="student_phone"
          type="text"
          placeholder="+7..."
          autoComplete="tel"
          maxLength={200}
          disabled={isSuccess}
          required
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

      {documents.length > 0 && (
        <section className="rounded-2xl border bg-zinc-50 p-3">
          <p className="text-sm font-semibold">Документы</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {documents.map((document) => (
              <Link
                key={document.id}
                href={document.href}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-zinc-700"
              >
                {document.title}
                <ExternalLink className="size-3.5" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <LegalConsentCheckboxes
        documents={documents}
        disabled={isSuccess}
        required={requiresConsent}
      />

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
        disabled={
          isPending || isSuccess || (requiresConsent && !hasRequiredDocuments)
        }
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
