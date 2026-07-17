"use client";

import { useEffect, useState, useActionState } from "react";
import {
  Archive,
  Check,
  Copy,
  KeyRound,
  Pencil,
  Plus,
  Power,
  PowerOff,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  approveStudentRegistrationRequestAction,
  archiveStudentAccessAction,
  createStudentAccessAction,
  deleteStudentAccessAction,
  refreshStudentRegistrationLinkAction,
  rejectStudentRegistrationRequestAction,
  toggleStudentAccessAction,
  updateStudentAccessAction,
  type StudentAccessActionState,
} from "@/app/admin/students/actions";
import { formatLocalDateTime, formatMoney, selectClassName } from "@/lib/formatters";
import {
  STUDENT_SECRET_ALPHABET,
  STUDENT_SECRET_MIN_LENGTH,
} from "@/lib/student-secret-policy";
import type {
  Instructor,
  LessonType,
  School,
  StudentAccess,
  StudentRegistrationRequest,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: StudentAccessActionState = {
  status: "idle",
  message: "",
};

export type StudentAccessCrmSummary = {
  plannedCount: number;
  completedCount: number;
  noShowCount: number;
  paidCount: number;
  unpaidCompletedCount: number;
  debtAmount: number;
  lastLessons: {
    id: string;
    startsAt: string;
    lessonTypeName: string;
    lessonState: "scheduled" | "completed" | "no_show";
    isPaid: boolean;
    priceAmount: number | null;
    paidAmount: number;
  }[];
};

export type StudentAccessCrm = StudentAccess & {
  school?: School | null;
  crm?: StudentAccessCrmSummary;
};

function getInstructorLabel(instructor: Instructor) {
  return instructor.public_name ?? instructor.name;
}

function getRequestDisplayName(request: StudentRegistrationRequest) {
  const label = [request.last_name, request.first_name]
    .filter(Boolean)
    .join(" ")
    .trim();

  return label || request.login;
}

function getRandomIndex(max: number) {
  if (globalThis.crypto?.getRandomValues) {
    const values = new Uint32Array(1);
    globalThis.crypto.getRandomValues(values);
    return values[0] % max;
  }

  return Math.floor(Math.random() * max);
}

function makeLogin() {
  const digits = Array.from({ length: 6 }, () => getRandomIndex(10)).join("");
  return `u${digits}`;
}

function makePin() {
  return Array.from(
    { length: STUDENT_SECRET_MIN_LENGTH },
    () => STUDENT_SECRET_ALPHABET[getRandomIndex(STUDENT_SECRET_ALPHABET.length)],
  ).join("");
}

function getActiveLessonTypes(lessonTypes: LessonType[]) {
  return lessonTypes.filter((lessonType) => lessonType.is_active !== false);
}

function getEditableLessonTypes(
  lessonTypes: LessonType[],
  selectedIds: string[],
) {
  return lessonTypes.filter(
    (lessonType) =>
      lessonType.is_active !== false || selectedIds.includes(lessonType.id),
  );
}

function getActiveSchools(schools: School[]) {
  return schools.filter((school) => school.is_active !== false);
}

function getEditableSchools(schools: School[], selectedId: string | null) {
  return schools.filter(
    (school) => school.is_active !== false || school.id === selectedId,
  );
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
          <span className="min-w-0 truncate">
            {lessonType.name}
            {lessonType.is_active === false ? " · скрыт" : ""}
          </span>
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
      secret ? `ПИН-код/пароль: ${secret}` : "ПИН-код/пароль: укажите новый ПИН-код в кабинете инструктора",
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
      {copied ? "Скопировано" : "Скопировать логин и ПИН-код"}
    </Button>
  );
}

function StudentRegistrationLinkCard({
  selectedInstructorId,
  registrationLink,
  registrationLinkUpdatedAt,
}: {
  selectedInstructorId: string;
  registrationLink: string | null;
  registrationLinkUpdatedAt: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [state, formAction, isPending] = useActionState(
    refreshStudentRegistrationLinkAction,
    INITIAL_STATE,
  );

  async function copyLink() {
    if (!registrationLink) return;

    await navigator.clipboard.writeText(registrationLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Ссылка регистрации ученика</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Отправьте её ученику. Заявка появится во вкладке “Заявки”, а доступ
            включится только после подтверждения.
          </p>
          {registrationLinkUpdatedAt && (
            <p className="text-muted-foreground mt-1 text-xs">
              Обновлена: {formatLocalDateTime(registrationLinkUpdatedAt)}
            </p>
          )}
        </div>
        <form action={formAction}>
          <input
            type="hidden"
            name="instructor_id"
            value={selectedInstructorId}
          />
          <Button type="submit" variant="outline" disabled={isPending}>
            <RefreshCw />
            {isPending
              ? "Обновляем..."
              : registrationLink
                ? "Обновить ссылку"
                : "Создать ссылку"}
          </Button>
        </form>
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <Input
          value={registrationLink ?? "Ссылка пока не создана"}
          readOnly
          className="h-10 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={copyLink}
          disabled={!registrationLink}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Скопировано" : "Скопировать"}
        </Button>
      </div>

      <StateMessage state={state} />
    </section>
  );
}

function StudentLoginLinkCard() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const loginLink = `${window.location.origin}/student/login`;

    await navigator.clipboard.writeText(loginLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Вход ученика</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Эту ссылку можно отправить ученику повторно, если он потерял вход в
            личный кабинет. Логин и ПИН-код отправляются отдельно из карточки
            ученика.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={copyLink}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Скопировано" : "Скопировать ссылку"}
        </Button>
      </div>
      <Input
        value="/student/login"
        readOnly
        className="mt-4 h-10 text-sm"
      />
    </section>
  );
}

function CreateStudentAccessForm({
  instructors,
  lessonTypes,
  schools,
  selectedInstructorId,
  canSelectInstructor,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  schools: School[];
  selectedInstructorId: string;
  canSelectInstructor: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    createStudentAccessAction,
    INITIAL_STATE,
  );
  const [label, setLabel] = useState("");
  const [login, setLogin] = useState("");
  const [secret, setSecret] = useState("");
  const activeLessonTypes = getActiveLessonTypes(lessonTypes);
  const activeSchools = getActiveSchools(schools);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setLogin(makeLogin());
      setSecret(makePin());
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <details className="rounded-2xl border border-zinc-300 bg-white shadow-sm open:border-zinc-500 open:shadow-md">
      <summary className="cursor-pointer list-none px-4 py-4 font-semibold sm:px-5">
        + Добавить ученика
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
            <Label htmlFor="student-access-label">Имя или метка ученика</Label>
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
            <Label htmlFor="student-access-phone">Способ связи</Label>
            <Input
              id="student-access-phone"
              name="student_phone"
              type="text"
              placeholder="Телефон, Telegram, VK или другой контакт"
              maxLength={200}
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
            <Label htmlFor="student-access-secret">ПИН-код/пароль</Label>
            <div className="flex gap-2">
              <Input
                id="student-access-secret"
                name="secret"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={`Минимум ${STUDENT_SECRET_MIN_LENGTH} символов`}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon-lg"
                onClick={() => setSecret(makePin())}
                aria-label="Сгенерировать ПИН-код"
              >
                <RefreshCw />
              </Button>
            </div>
          </div>

        </div>

        <div className="rounded-xl border bg-zinc-50 px-3 py-4">
          <div className="space-y-2">
            <Label htmlFor="student-access-school">Автошкола / источник</Label>
            <select
              id="student-access-school"
              name="school_id"
              className={selectClassName}
              defaultValue=""
            >
              <option value="">Частный ученик / без автошколы</option>
              {activeSchools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <details className="rounded-xl border bg-zinc-50">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold">
            Типы занятий
          </summary>
          <div className="space-y-2 border-t px-3 py-4">
            <LessonTypeCheckboxes lessonTypes={activeLessonTypes} />
            <p className="text-muted-foreground text-xs">
              Ученик увидит только выбранные типы слотов.
            </p>
          </div>
        </details>

        <details className="rounded-xl border bg-zinc-50">
          <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold">
            Дополнительно
          </summary>
          <div className="grid gap-4 border-t px-3 py-4 md:grid-cols-2">
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

            <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked
                className="size-4"
              />
              Доступ активен
            </label>
          </div>
        </details>

        <StateMessage state={state} />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" disabled={isPending}>
            <Plus />
            {isPending ? "Добавляем…" : "Добавить ученика"}
          </Button>
          <CopyAccessButton label={label} login={login} secret={secret} />
        </div>
      </form>
    </details>
  );
}

function StudentAccessCard({
  access,
  lessonTypes,
  schools,
  canDeleteStudents,
}: {
  access: StudentAccessCrm;
  lessonTypes: LessonType[];
  schools: School[];
  canDeleteStudents: boolean;
}) {
  const [updateState, updateAction, isUpdatePending] = useActionState(
    updateStudentAccessAction,
    INITIAL_STATE,
  );
  const [, toggleAction, isTogglePending] = useActionState(
    toggleStudentAccessAction,
    INITIAL_STATE,
  );
  const allowedTypes = lessonTypes.filter((lessonType) =>
    access.lesson_type_ids.includes(lessonType.id),
  );
  const editableLessonTypes = getEditableLessonTypes(
    lessonTypes,
    access.lesson_type_ids,
  );
  const editableSchools = getEditableSchools(schools, access.school_id);

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
            </p>
            {access.student_phone && (
              <p className="text-muted-foreground mt-1 text-xs">
                Способ связи:{" "}
                <span className="font-semibold">{access.student_phone}</span>
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="rounded-full bg-zinc-100 px-2 py-1 font-semibold text-zinc-700">
                План {access.crm?.plannedCount ?? 0}
              </span>
              <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                Проведено {access.crm?.completedCount ?? 0}
              </span>
              {(access.crm?.debtAmount ?? 0) > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">
                  Долг {formatMoney(access.crm?.debtAmount ?? 0)}
                </span>
              )}
            </div>
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
            <p className="font-semibold">{formatLocalDateTime(access.created_at)}</p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Источник</p>
            <p className="truncate font-semibold">
              {access.school?.name ?? "Частный ученик"}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">План / проведено</p>
            <p className="font-semibold">
              {access.crm?.plannedCount ?? 0} / {access.crm?.completedCount ?? 0}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Оплачено</p>
            <p className="font-semibold">
              {access.crm?.paidCount ?? 0} занятий
            </p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-700">Долг</p>
            <p className="font-semibold text-amber-950">
              {formatMoney(access.crm?.debtAmount ?? 0)}
            </p>
          </div>
        </div>

        {access.crm && access.crm.lastLessons.length > 0 && (
          <div>
            <p className="text-sm font-semibold">История занятий</p>
            <div className="mt-2 divide-y rounded-xl border bg-white">
              {access.crm.lastLessons.map((lesson) => (
                <div
                  key={lesson.id}
                  className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{lesson.lessonTypeName}</p>
                    <p className="text-xs text-zinc-500">
                      {formatLocalDateTime(lesson.startsAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-zinc-100 px-2 py-1 font-semibold">
                      {lesson.lessonState === "completed"
                        ? "Проведено"
                        : lesson.lessonState === "no_show"
                          ? "Неявка"
                          : "План"}
                    </span>
                    {lesson.priceAmount !== null && (
                      <>
                        <span className="font-semibold">
                          {formatMoney(lesson.paidAmount)} /{" "}
                          {formatMoney(lesson.priceAmount)}
                        </span>
                        {lesson.paidAmount >= lesson.priceAmount ? (
                          <span className="rounded-full bg-emerald-100 px-2 py-1 font-semibold text-emerald-800">
                            Долга нет
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-1 font-semibold text-amber-800">
                            Долг{" "}
                            {formatMoney(lesson.priceAmount - lesson.paidAmount)}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
                Новый ПИН-код/пароль
              </Label>
              <Input
                id={`new-secret-${access.id}`}
                name="new_secret"
                placeholder={`Оставьте пустым, если не меняете. Новый минимум ${STUDENT_SECRET_MIN_LENGTH} символов`}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`login-${access.id}`}>Логин</Label>
              <Input
                id={`login-${access.id}`}
                name="login"
                defaultValue={access.login}
                placeholder="masha-01"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`phone-${access.id}`}>Способ связи</Label>
              <Input
                id={`phone-${access.id}`}
                name="student_phone"
                type="text"
                defaultValue={access.student_phone ?? ""}
                placeholder="Телефон, Telegram, VK или другой контакт"
                maxLength={200}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`school-${access.id}`}>Автошкола / источник</Label>
              <select
                id={`school-${access.id}`}
                name="school_id"
                className={selectClassName}
                defaultValue={access.school_id ?? ""}
              >
                <option value="">Частный ученик / без автошколы</option>
                {editableSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                    {school.is_active === false ? " · скрыт" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Какие слоты показывать ученику</Label>
            <LessonTypeCheckboxes
              lessonTypes={editableLessonTypes}
              selectedIds={access.lesson_type_ids}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
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

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="outline" disabled={isUpdatePending}>
              <Pencil />
              {isUpdatePending ? "Сохраняем…" : "Сохранить изменения"}
            </Button>
            <CopyAccessButton label={access.display_label} login={access.login} />
          </div>
        </form>

        <div className="space-y-3 border-t pt-4">
          <ArchiveStudentAccessForm accessId={access.id} />
          {canDeleteStudents && (
            <DeleteStudentAccessForm
              accessId={access.id}
              label={access.display_label}
            />
          )}
        </div>
      </div>
    </details>
  );
}

function ArchiveStudentAccessForm({ accessId }: { accessId: string }) {
  const [state, formAction, isPending] = useActionState(
    archiveStudentAccessAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="student_access_id" value={accessId} />
      <StateMessage state={state} />
      <Button
        type="submit"
        variant="outline"
        className="text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
        disabled={isPending}
      >
        <Archive className="size-4" />
        {isPending ? "Перемещаем…" : "В архив"}
      </Button>
    </form>
  );
}

function DeleteStudentAccessForm({
  accessId,
  label,
}: {
  accessId: string;
  label: string;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteStudentAccessAction,
    INITIAL_STATE,
  );

  return (
    <details className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
      <summary className="cursor-pointer list-none text-sm font-semibold text-red-700">
        Удалить навсегда
      </summary>
      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="student_access_id" value={accessId} />
        <label className="flex items-start gap-2 text-xs text-red-800">
          <input
            type="checkbox"
            name="confirm_delete"
            value="yes"
            required
            className="mt-0.5 size-4 shrink-0"
          />
          <span>
            Удалить ученика «{label}» вместе с его записями. Это действие
            нельзя отменить.
          </span>
        </label>
        <StateMessage state={state} />
        <Button
          type="submit"
          variant="outline"
          className="border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
          disabled={isPending}
        >
          <Trash2 className="size-4" />
          {isPending ? "Удаляем..." : "Удалить ученика"}
        </Button>
      </form>
    </details>
  );
}

function StudentRegistrationRequestCard({
  request,
  lessonTypes,
  schools,
}: {
  request: StudentRegistrationRequest;
  lessonTypes: LessonType[];
  schools: School[];
}) {
  const [approveState, approveAction, isApprovePending] = useActionState(
    approveStudentRegistrationRequestAction,
    INITIAL_STATE,
  );
  const [rejectState, rejectAction, isRejectPending] = useActionState(
    rejectStudentRegistrationRequestAction,
    INITIAL_STATE,
  );
  const displayName = getRequestDisplayName(request);
  const activeLessonTypes = getActiveLessonTypes(lessonTypes);
  const activeSchools = getActiveSchools(schools);

  return (
    <details className="rounded-2xl border border-amber-200 bg-amber-50/70 shadow-sm open:border-amber-400 open:shadow-md">
      <summary className="cursor-pointer list-none px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-amber-700" />
              <p className="truncate font-semibold">{displayName}</p>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Логин: <span className="font-semibold">{request.login}</span>
              {" · "}
              Заявка: {formatLocalDateTime(request.created_at)}
            </p>
            {request.student_phone && (
              <p className="text-muted-foreground mt-1 text-xs">
                Способ связи:{" "}
                <span className="font-semibold">{request.student_phone}</span>
              </p>
            )}
            {request.school_text && (
              <p className="text-muted-foreground mt-1 text-xs">
                Автошкола из заявки:{" "}
                <span className="font-semibold">{request.school_text}</span>
              </p>
            )}
          </div>
          <Badge className="shrink-0 bg-amber-100 text-amber-800">
            Подтвердите ученика
          </Badge>
        </div>
      </summary>

      <div className="space-y-4 border-t border-amber-200 px-4 py-5 sm:px-5">
        <form action={approveAction} className="space-y-4">
          <input type="hidden" name="request_id" value={request.id} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`request-label-${request.id}`}>
                Имя или метка ученика
              </Label>
              <Input
                id={`request-label-${request.id}`}
                name="display_label"
                defaultValue={displayName}
                maxLength={80}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`request-phone-${request.id}`}>Способ связи</Label>
              <Input
                id={`request-phone-${request.id}`}
                name="student_phone"
                type="text"
                defaultValue={request.student_phone ?? ""}
                placeholder="Телефон, Telegram, VK или другой контакт"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`request-login-${request.id}`}>Логин</Label>
              <Input
                id={`request-login-${request.id}`}
                name="login"
                defaultValue={request.login}
                placeholder="masha-01"
                required
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor={`request-school-${request.id}`}>
                Автошкола / источник
              </Label>
              <select
                id={`request-school-${request.id}`}
                name="school_id"
                className={selectClassName}
                defaultValue=""
              >
                <option value="">Частный ученик / без автошколы</option>
                {activeSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <details className="rounded-xl border bg-white">
            <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold">
              Типы занятий
            </summary>
            <div className="space-y-2 border-t px-3 py-4">
              <LessonTypeCheckboxes lessonTypes={activeLessonTypes} />
            </div>
          </details>

          <details className="rounded-xl border bg-white">
            <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold">
              Дополнительно
            </summary>
            <div className="grid gap-4 border-t px-3 py-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`request-total-limit-${request.id}`}>
                  Лимит всего занятий
                </Label>
                <Input
                  id={`request-total-limit-${request.id}`}
                  name="total_lesson_limit"
                  type="number"
                  min={1}
                  max={500}
                  placeholder="Например: 10"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`request-weekly-limit-${request.id}`}>
                  Лимит в неделю
                </Label>
                <Input
                  id={`request-weekly-limit-${request.id}`}
                  name="weekly_lesson_limit"
                  type="number"
                  min={1}
                  max={50}
                  placeholder="Например: 2"
                />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked
                  className="size-4"
                />
                Доступ активен
              </label>
            </div>
          </details>

          <StateMessage state={approveState} />

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={isApprovePending}>
              <Check />
              {isApprovePending ? "Подтверждаем…" : "Подтвердить ученика"}
            </Button>
          </div>
        </form>

        <form action={rejectAction} className="border-t border-amber-200 pt-4">
          <input type="hidden" name="request_id" value={request.id} />
          <StateMessage state={rejectState} />
          <Button
            type="submit"
            variant="outline"
            className="mt-2 text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
            disabled={isRejectPending}
          >
            <Archive />
            {isRejectPending ? "Отклоняем…" : "Отклонить заявку"}
          </Button>
        </form>
      </div>
    </details>
  );
}

function ArchivedAccessCard({
  access,
  lessonTypes,
  canDeleteStudents,
}: {
  access: StudentAccessCrm;
  lessonTypes: LessonType[];
  canDeleteStudents: boolean;
}) {
  const allowedTypes = lessonTypes.filter((lt) =>
    access.lesson_type_ids.includes(lt.id),
  );

  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Archive className="size-4 text-zinc-400" />
            <p className="truncate font-semibold text-zinc-600">
              {access.display_label}
            </p>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Логин: <span className="font-semibold">{access.login}</span>
            {access.archived_at
              ? ` · В архиве с ${formatLocalDateTime(access.archived_at)}`
              : ""}
          </p>
          {access.student_phone && (
            <p className="text-muted-foreground mt-1 text-xs">
              Способ связи:{" "}
              <span className="font-semibold">{access.student_phone}</span>
            </p>
          )}
        </div>
        <Badge className="shrink-0 bg-zinc-200 text-zinc-600">Архив</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-sm text-zinc-500">
        <span>
          Лимит всего:{" "}
          <span className="font-medium text-zinc-700">
            {access.total_lesson_limit ?? "—"}
          </span>
        </span>
        <span>
          В неделю:{" "}
          <span className="font-medium text-zinc-700">
            {access.weekly_lesson_limit ?? "—"}
          </span>
        </span>
      </div>

      {allowedTypes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {allowedTypes.map((lt) => (
            <span
              key={lt.id}
              className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-600"
            >
              <span
                className="size-2 rounded-full border border-black/10"
                style={{ backgroundColor: lt.color }}
              />
              {lt.name}
            </span>
          ))}
        </div>
      )}

      {canDeleteStudents && (
        <div className="mt-4">
          <DeleteStudentAccessForm
            accessId={access.id}
            label={access.display_label}
          />
        </div>
      )}
    </div>
  );
}

export function StudentAccessesPanel({
  instructors,
  lessonTypes,
  schools,
  accesses,
  archivedAccesses = [],
  pendingRequests = [],
  selectedInstructorId,
  canSelectInstructor,
  adminEnabled,
  registrationLink,
  registrationLinkUpdatedAt,
  canDeleteStudents = false,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  schools: School[];
  accesses: StudentAccessCrm[];
  archivedAccesses?: StudentAccessCrm[];
  pendingRequests?: StudentRegistrationRequest[];
  selectedInstructorId: string;
  canSelectInstructor: boolean;
  adminEnabled: boolean;
  registrationLink: string | null;
  registrationLinkUpdatedAt: string | null;
  canDeleteStudents?: boolean;
}) {
  const [tab, setTab] = useState<"active" | "pending" | "archive">(() =>
    pendingRequests.length > 0 ? "pending" : "active",
  );

  if (!adminEnabled) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
        Управление учениками сейчас недоступно. Проверьте настройки проекта.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <StudentRegistrationLinkCard
        selectedInstructorId={selectedInstructorId}
        registrationLink={registrationLink}
        registrationLinkUpdatedAt={registrationLinkUpdatedAt}
      />
      <StudentLoginLinkCard />

      {tab === "active" && (
        <CreateStudentAccessForm
          instructors={instructors}
          lessonTypes={lessonTypes}
          schools={schools}
          selectedInstructorId={selectedInstructorId}
          canSelectInstructor={canSelectInstructor}
        />
      )}

      <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Ученики</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Активные ученики, прогресс, оплата и архив.
            </p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl border bg-zinc-100 p-1">
            <button
              type="button"
              onClick={() => setTab("active")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "active"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Активные · {accesses.length}
            </button>
            <button
              type="button"
              onClick={() => setTab("pending")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "pending"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Заявки · {pendingRequests.length}
            </button>
            <button
              type="button"
              onClick={() => setTab("archive")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === "archive"
                  ? "bg-white text-zinc-950 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700"
              }`}
            >
              Архив · {archivedAccesses.length}
            </button>
          </div>
        </div>

        {tab === "active" ? (
          accesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
              Пока нет учеников. Добавьте первого ученика и передайте ему ссылку,
              логин и ПИН-код.
            </div>
          ) : (
            <div className="space-y-3">
              {accesses.map((access) => (
                <StudentAccessCard
                  key={access.id}
                  access={access}
                  lessonTypes={lessonTypes}
                  schools={schools}
                  canDeleteStudents={canDeleteStudents}
                />
              ))}
            </div>
          )
        ) : tab === "pending" ? (
          pendingRequests.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
              Новых заявок пока нет.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <StudentRegistrationRequestCard
                  key={request.id}
                  request={request}
                  lessonTypes={lessonTypes}
                  schools={schools}
                />
              ))}
            </div>
          )
        ) : (
          archivedAccesses.length === 0 ? (
            <div className="rounded-2xl border border-dashed px-4 py-10 text-center text-sm text-zinc-500">
              Архив пуст. Архивированные ученики появятся здесь.
            </div>
          ) : (
            <div className="space-y-3">
              {archivedAccesses.map((access) => (
                <ArchivedAccessCard
                  key={access.id}
                  access={access}
                  lessonTypes={lessonTypes}
                  canDeleteStudents={canDeleteStudents}
                />
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}
