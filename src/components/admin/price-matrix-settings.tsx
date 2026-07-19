"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";
import {
  updateSchoolLessonTypePricesAction,
  type PriceMatrixActionState,
} from "@/app/admin/settings/price-actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { LessonType, School, SchoolLessonTypePrice } from "@/lib/types";

type EditableLessonType = LessonType &
  Required<Pick<LessonType, "default_duration_minutes" | "is_active">>;

const INITIAL_STATE: PriceMatrixActionState = {
  status: "idle",
  message: "",
};

function StateMessage({ state }: { state: PriceMatrixActionState }) {
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

function PriceRowForm({
  school,
  lessonTypes,
  pricesByKey,
  enabled,
  compact = false,
}: {
  school: School;
  lessonTypes: EditableLessonType[];
  pricesByKey: Map<string, SchoolLessonTypePrice>;
  enabled: boolean;
  compact?: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSchoolLessonTypePricesAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className={compact ? "space-y-3" : "contents"}>
      <input type="hidden" name="school_id" value={school.id} />
      {lessonTypes.map((lessonType) => (
        <input
          key={`${school.id}-${lessonType.id}-hidden`}
          type="hidden"
          name="lesson_type_id"
          value={lessonType.id}
        />
      ))}

      {compact ? (
        <>
          <div className="flex items-center gap-2">
            <span
              className="size-3 rounded-full border border-black/10"
              style={{ backgroundColor: school.color }}
            />
            <p className="font-semibold">{school.name}</p>
          </div>
          <div className="grid gap-3">
            {lessonTypes.map((lessonType) => {
              const price = pricesByKey.get(`${school.id}:${lessonType.id}`);

              return (
                <label
                  key={lessonType.id}
                  className="grid gap-1 text-sm font-medium"
                >
                  {lessonType.name}
                  <Input
                    name={`price_amount_${lessonType.id}`}
                    type="number"
                    min={0}
                    max={10000000}
                    step={1}
                    defaultValue={price?.price_amount ?? ""}
                    placeholder="Пусто"
                    disabled={!enabled || isPending}
                  />
                </label>
              );
            })}
          </div>
          <StateMessage state={state} />
          <Button type="submit" disabled={!enabled || isPending} className="w-full">
            <Save />
            {isPending ? "Сохраняем..." : "Сохранить цены"}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b px-3 py-2">
            <span
              className="size-3 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: school.color }}
            />
            <span className="font-medium">{school.name}</span>
          </div>
          {lessonTypes.map((lessonType) => {
            const price = pricesByKey.get(`${school.id}:${lessonType.id}`);

            return (
              <div key={lessonType.id} className="border-b px-2 py-2">
                <Input
                  name={`price_amount_${lessonType.id}`}
                  type="number"
                  min={0}
                  max={10000000}
                  step={1}
                  defaultValue={price?.price_amount ?? ""}
                  placeholder="Пусто"
                  disabled={!enabled || isPending}
                  className="h-9"
                  aria-label={`${school.name}: ${lessonType.name}`}
                />
              </div>
            );
          })}
          <div className="border-b px-2 py-2">
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!enabled || isPending}
              className="w-full"
            >
              <Save />
              {isPending ? "..." : "Сохранить"}
            </Button>
            <StateMessage state={state} />
          </div>
        </>
      )}
    </form>
  );
}

export function PriceMatrixSettings({
  schools,
  lessonTypes,
  prices,
  adminEnabled,
  canManage,
}: {
  schools: School[];
  lessonTypes: EditableLessonType[];
  prices: SchoolLessonTypePrice[];
  adminEnabled: boolean;
  canManage: boolean;
}) {
  const activeSchools = schools.filter((school) => school.is_active !== false);
  const activeLessonTypes = lessonTypes.filter(
    (lessonType) => lessonType.is_active !== false,
  );
  const pricesByKey = new Map(
    prices.map((price) => [`${price.school_id}:${price.lesson_type_id}`, price]),
  );

  return (
    <Card id="price-matrix-settings">
      <CardHeader className="pb-3">
        <CardTitle>Цены по источникам</CardTitle>
        <CardDescription>
          Цена зависит от источника ученика и типа занятия. При записи она
          автоматически попадёт в поле “К оплате”, но её всё равно можно
          изменить в конкретной записи.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canManage && (
          <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            Цены задаёт руководитель. Инструкторы видят итоговую сумму уже в
            карточке записи.
          </div>
        )}

        {canManage && !adminEnabled && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Сейчас управление ценами недоступно. Проверьте серверные настройки
            проекта.
          </div>
        )}

        {activeSchools.length === 0 || activeLessonTypes.length === 0 ? (
          <div className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-zinc-500">
            Чтобы заполнить цены, добавьте хотя бы один источник и один тип
            занятия.
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              Пустая ячейка означает, что цена не задана. Ноль означает
              бесплатное занятие.
            </div>

            <div className="space-y-3 md:hidden">
              {activeSchools.map((school) => (
                <div key={school.id} className="rounded-2xl border bg-white p-4">
                  <PriceRowForm
                    school={school}
                    lessonTypes={activeLessonTypes}
                    pricesByKey={pricesByKey}
                    enabled={adminEnabled && canManage}
                    compact
                  />
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto rounded-2xl border bg-white md:block">
              <div
                className="grid min-w-[760px]"
                style={{
                  gridTemplateColumns: `minmax(180px, 1.2fr) repeat(${activeLessonTypes.length}, minmax(140px, 1fr)) 130px`,
                }}
              >
                <div className="border-b bg-zinc-50 px-3 py-2 text-sm font-semibold">
                  Источник
                </div>
                {activeLessonTypes.map((lessonType) => (
                  <div
                    key={lessonType.id}
                    className="border-b bg-zinc-50 px-3 py-2 text-sm font-semibold"
                  >
                    {lessonType.name}
                  </div>
                ))}
                <div className="border-b bg-zinc-50 px-3 py-2 text-sm font-semibold">
                  Действие
                </div>

                {activeSchools.map((school) => (
                  <PriceRowForm
                    key={school.id}
                    school={school}
                    lessonTypes={activeLessonTypes}
                    pricesByKey={pricesByKey}
                    enabled={adminEnabled && canManage}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
