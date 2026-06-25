"use client";

import { useActionState, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound } from "lucide-react";
import {
  saveBookingAccessCodeAction,
  type AccessCodeActionState,
} from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Instructor = {
  id: string;
  name: string;
  timezone: string;
};

type InstructorSetting = {
  instructor_id: string;
  booking_access_code: string | null;
  booking_access_code_updated_at: string | null;
};

type AccessCodeHistoryItem = {
  id: string;
  instructor_id: string;
  access_code: string;
  created_at: string;
};

const INITIAL_STATE: AccessCodeActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function formatUpdatedAt(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function AccessCodeForm({
  instructors,
  settings,
  history,
  enabled,
  saltConfigured,
  initialInstructorId,
}: {
  instructors: Instructor[];
  settings: InstructorSetting[];
  history: AccessCodeHistoryItem[];
  enabled: boolean;
  saltConfigured: boolean;
  initialInstructorId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    saveBookingAccessCodeAction,
    INITIAL_STATE,
  );
  const [instructorId, setInstructorId] = useState(initialInstructorId);
  const [isHistoryVisible, setIsHistoryVisible] = useState(false);
  const selectedInstructor = useMemo(
    () => instructors.find((instructor) => instructor.id === instructorId),
    [instructorId, instructors],
  );
  const selectedSetting = useMemo(
    () => settings.find((setting) => setting.instructor_id === instructorId),
    [instructorId, settings],
  );
  const selectedHistory = useMemo(
    () =>
      history
        .filter((item) => item.instructor_id === instructorId)
        .slice(0, 5),
    [history, instructorId],
  );
  const updatedAt =
    selectedSetting?.booking_access_code_updated_at && selectedInstructor
      ? formatUpdatedAt(
          selectedSetting.booking_access_code_updated_at,
          selectedInstructor.timezone,
        )
      : null;

  return (
    <details className="group rounded-2xl border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <div className="min-w-0">
          <p className="font-semibold">Настройки записи</p>
          <p className="text-muted-foreground mt-1 truncate text-sm">
            Кодовое слово:{" "}
            <span className="font-medium text-zinc-900">
              {selectedSetting?.booking_access_code ?? "не настроено"}
            </span>
          </p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {updatedAt ? `Изменено: ${updatedAt}` : "Изменений ещё не было"}
          </p>
        </div>
        <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" />
      </summary>

      <form action={formAction} className="space-y-4 border-t px-4 py-5 sm:px-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="access-code-instructor">Инструктор</Label>
            <select
              id="access-code-instructor"
              name="instructor_id"
              className={selectClassName}
              value={instructorId}
              onChange={(event) => {
                setInstructorId(event.target.value);
                setIsHistoryVisible(false);
              }}
              required
            >
              <option value="" disabled>
                Выберите инструктора
              </option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_code">Новое кодовое слово</Label>
            <Input
              key={`${instructorId}-${selectedSetting?.booking_access_code_updated_at ?? "empty"}`}
              id="access_code"
              name="access_code"
              type="text"
              defaultValue={selectedSetting?.booking_access_code ?? ""}
              minLength={1}
              maxLength={100}
              autoComplete="off"
              required
              disabled={!instructorId}
            />
          </div>
        </div>

        {selectedHistory.length > 0 && selectedInstructor && (
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={isHistoryVisible}
              onClick={() => setIsHistoryVisible((visible) => !visible)}
            >
              {isHistoryVisible ? <ChevronUp /> : <ChevronDown />}
              {isHistoryVisible ? "Скрыть историю" : "Показать историю"}
            </Button>

            {isHistoryVisible && (
              <div className="rounded-lg border">
                <div className="border-b px-3 py-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    История кодовых слов
                  </p>
                  <p className="mt-1 text-xs text-zinc-400">
                    Показаны последние 5 изменений
                  </p>
                </div>
                <div className="divide-y">
                  {selectedHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <code className="font-semibold text-zinc-900">
                        {item.access_code}
                      </code>
                      <span className="text-xs text-zinc-500">
                        {formatUpdatedAt(
                          item.created_at,
                          selectedInstructor.timezone,
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

        {!saltConfigured && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Добавьте <code className="font-semibold">BOOKING_CODE_SALT</code>{" "}
            в <code className="font-semibold">.env.local</code>.
          </div>
        )}

        <Button
          type="submit"
          className="h-10"
          disabled={
            isPending ||
            !enabled ||
            !saltConfigured ||
            !instructorId ||
            instructors.length === 0
          }
        >
          <KeyRound />
          {isPending ? "Сохраняем…" : "Сохранить кодовое слово"}
        </Button>
      </form>
    </details>
  );
}
