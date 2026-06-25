"use client";

import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CalendarSync,
  X,
} from "lucide-react";
import {
  CopyDayForm,
  CopyWeekForm,
} from "@/components/admin/copy-schedule-forms";
import { QuickCreateDayForm } from "@/components/admin/quick-create-day-form";
import { SlotForm } from "@/components/admin/slot-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Instructor = {
  id: string;
  name: string;
};

type LessonType = {
  id: string;
  name: string;
  kind: "driving" | "theory";
  default_duration_minutes: number;
};

type ActionType = "slot" | "day" | "copy-day" | "copy-week";

const actions: Array<{
  id: ActionType;
  label: string;
  hint: string;
  icon: typeof CalendarPlus;
}> = [
  {
    id: "slot",
    label: "Один слот",
    hint: "Точечно добавить занятие",
    icon: CalendarPlus,
  },
  {
    id: "day",
    label: "Быстрый день",
    hint: "Собрать день по интервалам",
    icon: CalendarRange,
  },
  {
    id: "copy-day",
    label: "Копировать день",
    hint: "Повторить расписание дня",
    icon: CalendarClock,
  },
  {
    id: "copy-week",
    label: "Копировать неделю",
    hint: "Перенести всю неделю",
    icon: CalendarSync,
  },
];

const titles: Record<ActionType, string> = {
  slot: "Создать один слот",
  day: "Быстро создать день",
  "copy-day": "Скопировать день",
  "copy-week": "Скопировать неделю",
};

export function AdminQuickActions({
  instructors,
  lessonTypes,
  selectedInstructorId,
  adminEnabled,
  slotDefaultDate,
  slotRequestKey,
  activeAction,
  onActiveActionChange,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  selectedInstructorId: string;
  adminEnabled: boolean;
  slotDefaultDate?: string | null;
  slotRequestKey?: number;
  activeAction?: ActionType | null;
  onActiveActionChange?: (action: ActionType | null) => void;
}) {
  const [localActiveAction, setLocalActiveAction] =
    useState<ActionType | null>(null);
  const currentActiveAction = activeAction ?? localActiveAction;
  const setCurrentActiveAction = onActiveActionChange ?? setLocalActiveAction;
  const orderedInstructors = useMemo(
    () => [
      ...instructors.filter(
        (instructor) => instructor.id === selectedInstructorId,
      ),
      ...instructors.filter(
        (instructor) => instructor.id !== selectedInstructorId,
      ),
    ],
    [instructors, selectedInstructorId],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Создание расписания</CardTitle>
        <CardDescription>
          Выберите действие. На экране одновременно открывается только одна
          форма.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {actions.map((action) => {
            const Icon = action.icon;
            const isActive = currentActiveAction === action.id;

            return (
              <Button
                key={action.id}
                type="button"
                variant={isActive ? "default" : "outline"}
                className="h-auto min-h-12 justify-start px-3 py-2 text-left"
                onClick={() =>
                  setCurrentActiveAction(
                    currentActiveAction === action.id ? null : action.id,
                  )
                }
              >
                <Icon className="shrink-0" />
                <span className="min-w-0">
                  <span className="block font-semibold leading-5">
                    {action.label}
                  </span>
                  <span className="hidden truncate text-xs opacity-70 sm:block">
                    {action.hint}
                  </span>
                </span>
              </Button>
            );
          })}
        </div>

        {currentActiveAction && (
          <div className="rounded-2xl border-2 border-zinc-300 bg-zinc-50/80 p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {titles[currentActiveAction]}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Форма относится к выбранному инструктору.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Закрыть форму"
                onClick={() => setCurrentActiveAction(null)}
              >
                <X />
              </Button>
            </div>

            <div key={`${currentActiveAction}-${selectedInstructorId}`}>
              {currentActiveAction === "slot" && (
                <SlotForm
                  key={`${selectedInstructorId}-${slotDefaultDate ?? "empty"}-${slotRequestKey ?? 0}`}
                  instructors={orderedInstructors}
                  lessonTypes={lessonTypes}
                  adminEnabled={adminEnabled}
                  defaultDate={slotDefaultDate ?? undefined}
                />
              )}
              {currentActiveAction === "day" && (
                <QuickCreateDayForm
                  instructors={orderedInstructors}
                  lessonTypes={lessonTypes}
                  adminEnabled={adminEnabled}
                />
              )}
              {currentActiveAction === "copy-day" && (
                <CopyDayForm
                  instructors={orderedInstructors}
                  adminEnabled={adminEnabled}
                />
              )}
              {currentActiveAction === "copy-week" && (
                <CopyWeekForm
                  instructors={orderedInstructors}
                  adminEnabled={adminEnabled}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
