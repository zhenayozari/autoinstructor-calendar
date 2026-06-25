"use client";

import { useActionState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Power, PowerOff } from "lucide-react";
import {
  createLessonTypeAction,
  moveLessonTypeAction,
  toggleLessonTypeActiveAction,
  updateLessonTypeAction,
  type LessonTypeActionState,
} from "@/app/admin/actions";
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
import { Textarea } from "@/components/ui/textarea";

type LessonType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  kind: "driving" | "theory";
  default_duration_minutes: number;
  tags: string[];
  sort_order: number;
  is_active: boolean;
};

type LessonTypeCategory = "driving" | "theory" | "gift";

const INITIAL_STATE: LessonTypeActionState = {
  status: "idle",
  message: "",
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

const categoryLabels: Record<LessonTypeCategory, string> = {
  driving: "Вождение",
  theory: "Теория",
  gift: "Подарочное",
};

function getLessonTypeCategory(lessonType: LessonType): LessonTypeCategory {
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
  lessonType?: LessonType;
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
          placeholder="Например: Новая автошкола"
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

      <div className="space-y-2 md:col-span-2">
        <Label htmlFor={`${idPrefix}-description`}>Описание</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          defaultValue={lessonType?.description ?? ""}
          placeholder="Необязательное описание для админки"
          maxLength={1000}
        />
      </div>

      <label className="flex items-center gap-2 text-sm font-medium md:col-span-2">
        <input
          type="checkbox"
          name="is_active"
          defaultChecked={lessonType?.is_active ?? true}
          className="size-4"
        />
        Активен и доступен в формах расписания
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
  lessonType: LessonType;
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

export function LessonTypesSettings({
  lessonTypes,
  enabled,
}: {
  lessonTypes: LessonType[];
  enabled: boolean;
}) {
  return (
    <Card id="lesson-types-settings">
      <CardHeader className="pb-3">
        <CardTitle>Настройки → Типы занятий</CardTitle>
        <CardDescription>
          Управляемый справочник для автошкол, дополнительных занятий, подарков
          и теории. Активные типы появляются в формах создания расписания.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!enabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Для управления типами занятий нужен серверный ключ{" "}
            <code className="font-semibold">SUPABASE_SECRET_KEY</code>.
          </div>
        )}

        <details className="rounded-2xl border border-zinc-300 bg-zinc-50 p-4 shadow-sm open:border-zinc-500 open:bg-white open:shadow-md" open>
          <summary className="cursor-pointer font-semibold">
            + Добавить тип занятия
          </summary>
          <div className="mt-4">
            <CreateLessonTypeForm enabled={enabled} />
          </div>
        </details>

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
                          {lessonType.is_active ? "Активен" : "Отключён"}
                        </Badge>

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
                            disabled={!enabled || index === 0}
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
                          <input type="hidden" name="direction" value="down" />
                          <Button
                            type="submit"
                            variant="outline"
                            size="icon-sm"
                            disabled={!enabled || index === lessonTypes.length - 1}
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
                            disabled={!enabled}
                          >
                            {lessonType.is_active ? <PowerOff /> : <Power />}
                            {lessonType.is_active ? "Отключить" : "Включить"}
                          </Button>
                        </form>
                      </div>
                    </div>
                  </summary>

                  <div className="mt-4 border-t pt-4">
                    <EditLessonTypeForm
                      lessonType={lessonType}
                      enabled={enabled}
                    />
                  </div>
                </details>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
