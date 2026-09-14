"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, ExternalLink, LogOut, Save } from "lucide-react";
import {
  completeStudentProfileAction,
  studentLogoutAction,
  type StudentProfileActionState,
} from "@/app/student/actions";
import {
  hasRequiredStudentLegalDocuments,
  LegalConsentCheckboxes,
} from "@/components/student/legal-consent-checkboxes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LegalDocumentType } from "@/lib/types";

const INITIAL_STATE: StudentProfileActionState = {
  status: "idle",
  message: "",
};

type PublishedLegalDocumentLink = {
  id: string;
  title: string;
  href: string;
  documentType: LegalDocumentType;
};

export function StudentProfileCompletionForm({
  displayLabel,
  defaultFirstName,
  defaultLastName,
  defaultStudentPhone,
  documents,
}: {
  displayLabel: string;
  defaultFirstName?: string;
  defaultLastName?: string;
  defaultStudentPhone?: string;
  documents: PublishedLegalDocumentLink[];
}) {
  const [state, formAction, isPending] = useActionState(
    completeStudentProfileAction,
    INITIAL_STATE,
  );
  const requiredDocumentTypes = documents.map(
    (document) => document.documentType,
  );
  const hasRequiredDocuments = hasRequiredStudentLegalDocuments(
    documents,
    requiredDocumentTypes,
  );

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-5 text-zinc-950 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="rounded-[2rem] bg-zinc-950 p-5 text-white shadow-xl shadow-zinc-950/10 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                Первый вход
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Заполните профиль
              </h1>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                Доступ {displayLabel} уже создан. Расписание откроется после
                заполнения данных и подтверждения согласия.
              </p>
            </div>
            <form action={studentLogoutAction}>
              <Button
                type="submit"
                variant="outline"
                className="bg-white text-zinc-950"
              >
                <LogOut />
                Выйти
              </Button>
            </form>
          </div>
        </header>

        <form action={formAction} className="space-y-4 rounded-[2rem] border bg-white p-5 shadow-sm sm:p-7">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
            По закону о персональных данных ученик сам подтверждает согласие и
            заполняет свои данные. До этого кабинет и запись на занятия
            недоступны.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="student-last-name">Фамилия</Label>
              <Input
                id="student-last-name"
                name="last_name"
                defaultValue={defaultLastName ?? ""}
                autoComplete="family-name"
                maxLength={80}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-first-name">Имя</Label>
              <Input
                id="student-first-name"
                name="first_name"
                defaultValue={defaultFirstName ?? ""}
                autoComplete="given-name"
                maxLength={80}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-phone">Номер телефона или способ связи</Label>
            <Input
              id="student-phone"
              name="student_phone"
              type="text"
              defaultValue={defaultStudentPhone ?? ""}
              autoComplete="tel"
              placeholder="+7..."
              maxLength={200}
              required
            />
          </div>

          <section className="rounded-2xl border bg-zinc-50 p-4">
            <p className="text-sm font-semibold">Документы</p>
            {documents.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {documents.map((document) => (
                  <Link
                    key={document.id}
                    href={document.href}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:text-zinc-950"
                  >
                    {document.title}
                    <ExternalLink className="size-3.5" />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Документы ещё не опубликованы. Обратитесь к инструктору.
              </p>
            )}
          </section>

          <LegalConsentCheckboxes
            documents={documents}
            requiredDocumentTypes={requiredDocumentTypes}
          />

          {state.message && (
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                state.status === "success"
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
            disabled={isPending || !hasRequiredDocuments}
          >
            {isPending ? <Check /> : <Save />}
            {isPending ? "Сохраняем..." : "Сохранить и открыть кабинет"}
          </Button>
        </form>
      </div>
    </main>
  );
}
