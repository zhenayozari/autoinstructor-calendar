"use client";

import { useActionState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import {
  createLessonTypeAction,
  deleteLessonTypeAction,
  moveLessonTypeAction,
  toggleLessonTypeActiveAction,
  updateLessonTypeAction,
  type LessonTypeActionState,
} from "@/app/admin/actions";
import { formatMoney, selectClassName } from "@/lib/formatters";
import type { LessonType } from "@/lib/types";
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

type EditableLessonType = LessonType &
  Required<
    Pick<
      LessonType,
      | "code"
      | "description"
      | "kind"
      | "default_duration_minutes"
      | "default_price_amount"
      | "tags"
      | "sort_order"
      | "is_active"
    >
  >;

type LessonTypeCategory = "driving" | "theory" | "gift";

const INITIAL_STATE: LessonTypeActionState = {
  status: "idle",
  message: "",
};

const categoryLabels: Record<LessonTypeCategory, string> = {
  driving: "Вождение",
  theory: "Теория",
  gift: "Подарочное",
};

function getLessonTypeCategory(lessonType: EditableLessonType): LessonTypeCategory {
  if (lessonType.kind === "theory") {
    return "theory";
  }

  if (lessonType.tags.includes("gift")) {
    return "gift";
  }

  return "driving";
}

function LessonTypeStateMessage({ state }: { state: LessonTypeActionState }) {
  if (!state.message) {
    return null;
  }

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

function LessonTypeFields({
  lessonType,
  idPrefix,
}: {
  lessonType?: EditableLessonType;
  idPrefix: string;
}) {
  const category = lessonType ? getLessonTypeCategory(lessonType) : "driving";

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {lessonType && (
        <input type="hidden" name="lesson_type_id" value={lessonType.id} />
      )}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-name`}>Название</Label>
        <Input
          id={`${idPrefix}-name`}
          name="name"
          defaultValue={lessonType?.name ?? ""}
          placeholder="Например: Вождение, Доп занятие, Теория"
          maxLength={120}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-category`}>Категория</Label>
        <select
          id={`${idPrefix}-category`}
          name="category"
          className={selectClassName}
          defaultValue={category}
          required
        >
          <option value="driving">Вождение</option>
          <option value="theory">Теория</option>
          <option value="gift">Подарочное</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-color`}>Цвет</Label>
        <Input
          id={`${idPrefix}-color`}
          name="color"
          type="color"
          defaultValue={lessonType?.color ?? "#F59E0B"}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-duration`}>
          Длительность по умолчанию, мин.
        </Label>
        <Input
          id={`${idPrefix}-duration`}
          name="default_duration_minutes"
          type="number"
          min={15}
          max={480}
          step={5}
          defaultValue={lessonType?.default_duration_minutes ?? 90}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-price`}>Цена типа, ₽</Label>
        <Input
          id={`${idPrefix}-price`}
          name="default_price_amount"
          type="number"
          min={0}
          max={10000000}
          step={1}
          defaultValue={lessonType?.default_price_amount ?? ""}
          placeholder="Например: 1500"
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={lessonType?.is_active ?? true}
          className="size-4"
        />
        Показывать в расписании и учениках
      </label>
    </div>
  );
}

function CreateLessonTypeForm({ enabled }: { enabled: boolean }) {
  const [state, formAction, isPending] = useActionState(
    createLessonTypeAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <LessonTypeFields idPrefix="new-lesson-type" />
      <LessonTypeStateMessage state={state} />
      <Button type="submit" disabled={isPending || !enabled}>
        <Plus />
        {isPending ? "Создаём…" : "Добавить тип занятия"}
      </Button>
    </form>
  );
}

function EditLessonTypeForm({
  lessonType,
  enabled,
}: {
  lessonType: EditableLessonType;
  enabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateLessonTypeAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="space-y-4">
      <LessonTypeFields
        lessonType={lessonType}
        idPrefix={`lesson-type-${lessonType.id}`}
      />
      <LessonTypeStateMessage state={state} />
      <Button type="submit" variant="outline" disabled={isPending || !enabled}>
        <Pencil />
        {isPending ? "Сохраняем…" : "Сохранить изменения"}
      </Button>
    </form>
  );
}

function DeleteLessonTypeForm({
  lessonType,
  enabled,
}: {
  lessonType: EditableLessonType;
  enabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    deleteLessonTypeAction,
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col items-start gap-1"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Удалить тип занятия «${lessonType.name}» навсегда? Если он уже есть в расписании, система не даст стереть историю.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="lesson_type_id" value={lessonType.id} />
      <Button
        type="submit"
        variant="destructive"
        size="sm"
        disabled={!enabled || isPending}
      >
        <Trash2 />
        {isPending ? "Удаляем…" : "Удалить"}
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

export function LessonTypesSettings({
  lessonTypes,
  adminEnabled,
  canManage,
}: {
  lessonTypes: EditableLessonType[];
  adminEnabled: boolean;
  canManage: boolean;
}) {
  return (
    <Card id="lesson-types-settings">
      <CardHeader className="pb-3">
        <CardTitle>Типы занятий и цены</CardTitle>
        <CardDescription>
          Тип занятия отвечает на вопрос, что именно проводится: вождение,
          теория, доп занятие, подарок или другой формат.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {canManage && !adminEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Сейчас управление типами занятий недоступно. Проверьте серверные
            настройки проекта.
          </div>
        )}

        {!canManage && (
          <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Это школьный список типов занятий. Выбирайте их при создании
            слотов и доступов учеников; добавлять и менять типы может только
            руководитель.
          </div>
        )}

        {canManage && (
          <details className="rounded-2xl border border-zinc-300 bg-zinc-50 p-4 shadow-sm open:border-zinc-500 open:bg-white open:shadow-md">
            <summary className="cursor-pointer font-semibold">
              + Добавить тип занятия
            </summary>
            <div className="mt-4">
              <CreateLessonTypeForm enabled={adminEnabled} />
            </div>
          </details>
        )}

        <div className="space-y-3">
          {lessonTypes.length === 0 ? (
            <div className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-zinc-500">
              Типов занятий пока нет.
            </div>
          ) : (
            lessonTypes.map((lessonType, index) => {
              const category = getLessonTypeCategory(lessonType);

              return (
                <details
                  key={lessonType.id}
                  className="rounded-2xl border border-zinc-200 bg-white p-4 transition open:border-zinc-500 open:bg-zinc-50/70 open:shadow-md"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="size-4 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: lessonType.color }}
                        />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {lessonType.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {lessonType.code} ·{" "}
                            {categoryLabels[category]} ·{" "}
                            {lessonType.default_duration_minutes} мин.
                            {lessonType.default_price_amount !== null
                              ? ` · ${formatMoney(lessonType.default_price_amount)}`
                              : ""}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          className={
                            lessonType.is_active
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-zinc-200 text-zinc-700"
                          }
                        >
                          {lessonType.is_active ? "Показывается" : "Скрыт"}
                        </Badge>

                        {canManage && (
                          <>
                            <form action={moveLessonTypeAction}>
                              <input
                                type="hidden"
                                name="lesson_type_id"
                                value={lessonType.id}
                              />
                              <input type="hidden" name="direction" value="up" />
                              <Button
                                type="submit"
                                variant="outline"
                                size="icon-sm"
                                disabled={!adminEnabled || index === 0}
                                aria-label="Поднять выше"
                              >
                                <ArrowUp />
                              </Button>
                            </form>

                            <form action={moveLessonTypeAction}>
                              <input
                                type="hidden"
                                name="lesson_type_id"
                                value={lessonType.id}
                              />
                              <input
                                type="hidden"
                                name="direction"
                                value="down"
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="icon-sm"
                                disabled={
                                  !adminEnabled ||
                                  index === lessonTypes.length - 1
                                }
                                aria-label="Опустить ниже"
                              >
                                <ArrowDown />
                              </Button>
                            </form>

                            <form action={toggleLessonTypeActiveAction}>
                              <input
                                type="hidden"
                                name="lesson_type_id"
                                value={lessonType.id}
                              />
                              <input
                                type="hidden"
                                name="is_active"
                                value={lessonType.is_active ? "false" : "true"}
                              />
                              <Button
                                type="submit"
                                variant="outline"
                                size="sm"
                                disabled={!adminEnabled}
                              >
                                {lessonType.is_active ? <PowerOff /> : <Power />}
                                {lessonType.is_active ? "Скрыть" : "Показать"}
                              </Button>
                            </form>
                            <DeleteLessonTypeForm
                              lessonType={lessonType}
                              enabled={adminEnabled}
                            />
                          </>
                        )}
                      </div>
                    </div>
                  </summary>

                  {canManage && (
                    <div className="mt-4 border-t pt-4">
                      <EditLessonTypeForm
                        lessonType={lessonType}
                        enabled={adminEnabled}
                      />
                    </div>
                  )}
                </details>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
