"use client";

import { useActionState } from "react";
import { Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import {
  createSchoolAction,
  deleteSchoolAction,
  toggleSchoolActiveAction,
  updateSchoolAction,
  type SchoolActionState,
} from "@/app/admin/settings/school-actions";
import type { School } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: SchoolActionState = {
  status: "idle",
  message: "",
};

function StateMessage({ state }: { state: SchoolActionState }) {
  if (!state.message) return null;

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        state.status === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </div>
  );
}

function SchoolFields({
  school,
  idPrefix,
}: {
  school?: School;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {school && <input type="hidden" name="school_id" value={school.id} />}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Название источника</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={school?.name ?? ""}
          placeholder="Например: ОМГ, Главная дорога, Частные ученики"
          maxLength={80}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-color`}>Цвет</Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${idPrefix}-color`}
            name="color"
            type="color"
            defaultValue={school?.color ?? "#6b7280"}
            className="h-10 w-16 cursor-pointer rounded-lg border p-1"
            required
          />
          <span className="text-sm text-zinc-500">
            Используется в карточках учеников и отчётах.
          </span>
        </div>
      </div>

      <div className="flex items-end">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="is_active"
            defaultChecked={school?.is_active ?? true}
            className="size-4"
          />
          Показывать в карточках учеников
        </label>
      </div>
    </div>
  );
}

function CreateSchoolForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, isPending] = useActionState(
    createSchoolAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <SchoolFields idPrefix="new-school" />
      <StateMessage state={state} />
      <Button type="submit" disabled={isPending || !enabled}>
        <Plus />
        {isPending ? "Добавляем..." : "Добавить источник"}
      </Button>
    </form>
  );
}

function EditSchoolForm({
  school,
  enabled,
}: {
  school: School;
  enabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSchoolAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <SchoolFields school={school} idPrefix={`school-${school.id}`} />
      <StateMessage state={state} />
      <Button type="submit" variant="outline" disabled={isPending || !enabled}>
        <Pencil />
        {isPending ? "Сохраняем..." : "Сохранить изменения"}
      </Button>
    </form>
  );
}

function DeleteSchoolForm({
  school,
  enabled,
}: {
  school: School;
  enabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteSchoolAction,
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-1"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Удалить источник «${school.name}» навсегда? В связанных старых записях источник станет пустым.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="school_id" value={school.id} />
      <Button
        type="submit"
        variant="destructive"
        size="sm"
        disabled={!enabled || isPending}
      >
        <Trash2 />
        {isPending ? "Удаляем..." : "Удалить"}
      </Button>
      {state.message && (
        <span
          className={
            state.status === "success"
              ? "text-xs font-medium text-emerald-700"
              : "text-xs font-medium text-red-700"
          }
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function SchoolsSettings({
  schools,
  adminEnabled,
  canManage,
}: {
  schools: School[];
  adminEnabled: boolean;
  canManage: boolean;
}) {
  return (
    <Card id="schools-settings">
      <CardHeader className="pb-3">
        <CardTitle>Автошколы и источники</CardTitle>
        <CardDescription>
          Источник отвечает на вопрос, откуда пришёл ученик: автошкола,
          частный ученик, подарок или рекомендация. Цена записи берётся из типа
          занятия или указывается вручную в самой записи.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canManage && !adminEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Сейчас управление источниками недоступно. Проверьте серверные
            настройки проекта.
          </div>
        )}

        {!canManage && (
          <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Это школьный список источников. Выбирайте их в карточках учеников;
            добавлять и менять источники может только руководитель.
          </div>
        )}

        {canManage && (
          <details className="rounded-2xl border border-zinc-300 bg-zinc-50 p-4 shadow-sm open:border-zinc-500 open:bg-white open:shadow-md">
            <summary className="cursor-pointer font-semibold">
              + Добавить источник
            </summary>
            <div className="mt-4">
              <CreateSchoolForm enabled={adminEnabled} />
            </div>
          </details>
        )}

        <div className="space-y-3">
          {schools.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-zinc-500">
              Источников пока нет. Добавьте автошколу, рекомендацию или
              частных учеников.
            </div>
          ) : (
            schools.map((school) => (
              <details
                key={school.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 transition open:border-zinc-500 open:bg-zinc-50/70 open:shadow-md"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="size-4 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: school.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{school.name}</p>
                        <p className="text-muted-foreground text-xs">
                          Источник ученика
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={
                          school.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-zinc-200 text-zinc-700"
                        }
                      >
                        {school.is_active ? "Показывается" : "Скрыт"}
                      </Badge>

                      {canManage && (
                        <>
                          <form action={toggleSchoolActiveAction}>
                            <input
                              type="hidden"
                              name="school_id"
                              value={school.id}
                            />
                            <input
                              type="hidden"
                              name="is_active"
                              value={school.is_active ? "false" : "true"}
                            />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              disabled={!adminEnabled}
                            >
                              {school.is_active ? <PowerOff /> : <Power />}
                              {school.is_active ? "Скрыть" : "Показать"}
                            </Button>
                          </form>
                          <DeleteSchoolForm
                            school={school}
                            enabled={adminEnabled}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </summary>

                {canManage && (
                  <div className="mt-4 border-t pt-4">
                    <EditSchoolForm school={school} enabled={adminEnabled} />
                  </div>
                )}
              </details>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
