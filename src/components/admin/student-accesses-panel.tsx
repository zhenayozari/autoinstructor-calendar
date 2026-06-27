"use client";

import { useMemo, useState, useActionState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
} from "lucide-react";
import {
  createStudentAccessAction,
  toggleStudentAccessAction,
  updateStudentAccessAction,
  type StudentAccessActionState,
} from "@/app/admin/students/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
};

type LessonType = {
  id: string;
  code: string;
  name: string;
  color: string;
  kind: "driving" | "theory";
  tags: string[];
};

type StudentAccess = {
  id: string;
  instructor_id: string;
  display_label: string;
  login: string;
  total_lesson_limit: number | null;
  weekly_lesson_limit: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  lesson_type_ids: string[];
};

const INITIAL_STATE: StudentAccessActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function getInstructorLabel(instructor: Instructor) {
  return instructor.public_name ?? instructor.name;
}

function makeLogin() {
  return `u${Math.floor(100000 + Math.random() * 900000)}`;
}

function makePin() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function StateMessage({ state }: { state: StudentAccessActionState }) {
  if (!state.message) {
    return null;
  }

  return (
    <div
      className={`rounded-xl px-3 py-2 text-sm ${
        state.status === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </div>
  );
}

function LessonTypeCheckboxes({
  lessonTypes,
  selectedIds = [],
}: {
  lessonTypes: LessonType[];
  selectedIds?: string[];
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {lessonTypes.map((lessonType) => (
        <label
          key={lessonType.id}
          className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium"
        >
          <input
            type="checkbox"
            name="lesson_type_ids"
            value={lessonType.id}
            defaultChecked={selectedIds.includes(lessonType.id)}
            className="size-4"
          />
          <span
            className="size-3 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: lessonType.color }}
          />
          <span className="min-w-0 truncate">{lessonType.name}</span>
        </label>
      ))}
    </div>
  );
}

function CopyAccessButton({
  label,
  login,
  secret,
}: {
  label: string;
  login: string;
  secret?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyAccess() {
    const baseUrl = window.location.origin;
    const text = [
      `${label || "Здравствуйте"}, доступ для записи на занятия:`,
      `${baseUrl}/student/login`,
      `Логин: ${login}`,
      secret ? `PIN/пароль: ${secret}` : "PIN/пароль: укажите новый PIN в админке",
    ].join("\n");

    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={copyAccess}
      disabled={!login}
    >
      {copied ? <Check /> : <Copy />}
      {copied ? "Скопировано" : "Скопировать доступ"}
    </Button>
  );
}

function CreateStudentAccessForm({
  instructors,
  lessonTypes,
  selectedInstructorId,
  canSelectInstructor,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  selectedInstructorId: string;
  canSelectInstructor: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    createStudentAccessAction,
    INITIAL_STATE,
  );
  const [label, setLabel] = useState("");
  const [login, setLogin] = useState(makeLogin());
  const [secret, setSecret] = useState(makePin());

  return (
    <details className="rounded-2xl border border-zinc-300 bg-white shadow-sm open:border-zinc-500 open:shadow-md" open>
      <summary className="cursor-pointer list-none px-4 py-4 font-semibold sm:px-5">
        + Создать учебный доступ
      </summary>

      <form action={formAction} className="space-y-5 border-t px-4 py-5 sm:px-5">
        <div className="grid gap-4 md:grid-cols-2">
          {canSelectInstructor ? (
            <div className="space-y-2">
              <Label htmlFor="student-access-instructor">Инструктор</Label>
              <select
                id="student-access-instructor"
                name="instructor_id"
                className={selectClassName}
                defaultValue={selectedInstructorId}
                required
              >
                {instructors.map((instructor) => (
                  <option key={instructor.id} value={instructor.id}>
                    {getInstructorLabel(instructor)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <input type="hidden" name="instructor_id" value={selectedInstructorId} />
          )}

          <div className="space-y-2">
            <Label htmlFor="student-access-label">Метка ученика</Label>
            <Input
              id="student-access-label"
              name="display_label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Например: Маша, ГД-07, Ученик 12"
              maxLength={80}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-access-login">Логин</Label>
            <div className="flex gap-2">
              <Input
                id="student-access-login"
                name="login"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="masha-01"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={() => setLogin(makeLogin())}
                aria-label="Сгенерировать логин"
              >
                <RefreshCw />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-access-secret">PIN/пароль</Label>
            <div className="flex gap-2">
              <Input
                id="student-access-secret"
                name="secret"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder="Например: 7392"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={() => setSecret(makePin())}
                aria-label="Сгенерировать PIN"
              >
                <RefreshCw />
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-access-total-limit">
              Лимит всего занятий
            </Label>
            <Input
              id="student-access-total-limit"
              name="total_lesson_limit"
              type="number"
              min={1}
              max={500}
              placeholder="Например: 10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="student-access-weekly-limit">
              Лимит в неделю
            </Label>
            <Input
              id="student-access-weekly-limit"
              name="weekly_lesson_limit"
              type="number"
              min={1}
              max={50}
              placeholder="Например: 2"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Какие слоты показывать ученику</Label>
          <LessonTypeCheckboxes lessonTypes={lessonTypes} />
          <p className="text-muted-foreground text-xs">
            Можно выбрать автошколу, допы, подарочные занятия или теорию.
          </p>
        </div>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked
            className="size-4"
          />
          Доступ активен
        </label>

        <StateMessage state={state} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={isPending}>
            <Plus />
            {isPending ? "Создаём…" : "Создать доступ"}
          </Button>
          <CopyAccessButton label={label} login={login} secret={secret} />
        </div>
      </form>
    </details>
  );
}

function StudentAccessCard({
  access,
  instructor,
  lessonTypes,
}: {
  access: StudentAccess;
  instructor: Instructor | undefined;
  lessonTypes: LessonType[];
}) {
  const [updateState, updateAction, isUpdatePending] = useActionState(
    updateStudentAccessAction,
    INITIAL_STATE,
  );
  const [toggleState, toggleAction, isTogglePending] = useActionState(
    toggleStudentAccessAction,
    INITIAL_STATE,
  );
  const allowedTypes = lessonTypes.filter((lessonType) =>
    access.lesson_type_ids.includes(lessonType.id),
  );

  return (
    <details className="rounded-2xl border border-zinc-200 bg-white shadow-sm transition open:border-zinc-500 open:bg-zinc-50/70 open:shadow-md">
      <summary className="cursor-pointer list-none px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-zinc-500" />
              <p className="truncate font-semibold">{access.display_label}</p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Логин: <span className="font-semibold">{access.login}</span>
              {instructor ? ` · ${getInstructorLabel(instructor)}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                access.is_active
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-zinc-200 text-zinc-700"
              }
            >
              {access.is_active ? "Активен" : "Отключён"}
            </Badge>
            <form action={toggleAction}>
              <input
                type="hidden"
                name="student_access_id"
                value={access.id}
              />
              <input
                type="hidden"
                name="is_active"
                value={access.is_active ? "false" : "true"}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={isTogglePending}
              >
                {access.is_active ? <PowerOff /> : <Power />}
                {access.is_active ? "Отключить" : "Включить"}
              </Button>
            </form>
          </div>
        </div>
      </summary>

      <div className="space-y-5 border-t px-4 py-5 sm:px-5">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Лимит всего</p>
            <p className="font-semibold">
              {access.total_lesson_limit ?? "Без лимита"}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Лимит в неделю</p>
            <p className="font-semibold">
              {access.weekly_lesson_limit ?? "Без лимита"}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Создан</p>
            <p className="font-semibold">{formatDate(access.created_at)}</p>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">Разрешённые типы</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {allowedTypes.length > 0 ? (
              allowedTypes.map((lessonType) => (
                <span
                  key={lessonType.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold"
                >
                  <span
                    className="size-2 rounded-full border border-black/10"
                    style={{ backgroundColor: lessonType.color }}
                  />
                  {lessonType.name}
                </span>
              ))
            ) : (
              <span className="text-sm text-zinc-500">
                Типы занятий не выбраны
              </span>
            )}
          </div>
        </div>

        <form action={updateAction} className="space-y-4">
          <input type="hidden" name="student_access_id" value={access.id} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`label-${access.id}`}>Метка ученика</Label>
              <Input
                id={`label-${access.id}`}
                name="display_label"
                defaultValue={access.display_label}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`new-secret-${access.id}`}>
                Новый PIN/пароль
              </Label>
              <Input
                id={`new-secret-${access.id}`}
                name="new_secret"
                placeholder="Оставьте пустым, если не меняете"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`total-limit-${access.id}`}>
                Лимит всего занятий
              </Label>
              <Input
                id={`total-limit-${access.id}`}
                name="total_lesson_limit"
                type="number"
                min={1}
                max={500}
                defaultValue={access.total_lesson_limit ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`weekly-limit-${access.id}`}>
                Лимит в неделю
              </Label>
              <Input
                id={`weekly-limit-${access.id}`}
                name="weekly_lesson_limit"
                type="number"
                min={1}
                max={50}
                defaultValue={access.weekly_lesson_limit ?? ""}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Какие слоты показывать ученику</Label>
            <LessonTypeCheckboxes
              lessonTypes={lessonTypes}
              selectedIds={access.lesson_type_ids}
            />
          </div>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={access.is_active}
              className="size-4"
            />
            Доступ активен
          </label>

          <StateMessage state={updateState} />
          <StateMessage state={toggleState} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="outline" disabled={isUpdatePending}>
              <Pencil />
              {isUpdatePending ? "Сохраняем…" : "Сохранить изменения"}
            </Button>
            <CopyAccessButton label={access.display_label} login={access.login} />
          </div>
        </form>
      </div>
    </details>
  );
}

export function StudentAccessesPanel({
  instructors,
  lessonTypes,
  accesses,
  selectedInstructorId,
  canSelectInstructor,
  adminEnabled,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  accesses: StudentAccess[];
  selectedInstructorId: string;
  canSelectInstructor: boolean;
  adminEnabled: boolean;
}) {
  const instructorsById = useMemo(
    () => new Map(instructors.map((instructor) => [instructor.id, instructor])),
    [instructors],
  );

  if (!adminEnabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        Для управления учебными доступами нужен серверный ключ{" "}
        <code className="font-semibold">SUPABASE_SECRET_KEY</code>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CreateStudentAccessForm
        instructors={instructors}
        lessonTypes={lessonTypes}
        selectedInstructorId={selectedInstructorId}
        canSelectInstructor={canSelectInstructor}
      />

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Учебные доступы</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Это не регистрация учеников, а контролируемый доступ к нужным слотам.
          </p>
        </div>

        {accesses.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
            Пока нет учебных доступов. Создайте первый доступ и передайте ученику
            ссылку, логин и PIN.
          </div>
        ) : (
          <div className="space-y-3">
            {accesses.map((access) => (
              <StudentAccessCard
                key={access.id}
                access={access}
                instructor={instructorsById.get(access.instructor_id)}
                lessonTypes={lessonTypes}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
