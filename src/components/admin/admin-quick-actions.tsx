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
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  selectedInstructorId: string;
  adminEnabled: boolean;
}) {
  const [activeAction, setActiveAction] = useState<ActionType | null>(null);
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
            const isActive = activeAction === action.id;

            return (
              <Button
                key={action.id}
                type="button"
                variant={isActive ? "default" : "outline"}
                className="h-auto min-h-12 justify-start px-3 py-2 text-left"
                onClick={() =>
                  setActiveAction((current) =>
                    current === action.id ? null : action.id,
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

        {activeAction && (
          <div className="rounded-2xl border-2 border-zinc-300 bg-zinc-50/80 p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{titles[activeAction]}</h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Форма относится к выбранному инструктору.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Закрыть форму"
                onClick={() => setActiveAction(null)}
              >
                <X />
              </Button>
            </div>

            <div key={`${activeAction}-${selectedInstructorId}`}>
              {activeAction === "slot" && (
                <SlotForm
                  instructors={orderedInstructors}
                  lessonTypes={lessonTypes}
                  adminEnabled={adminEnabled}
                />
              )}
              {activeAction === "day" && (
                <QuickCreateDayForm
                  instructors={orderedInstructors}
                  lessonTypes={lessonTypes}
                  adminEnabled={adminEnabled}
                />
              )}
              {activeAction === "copy-day" && (
                <CopyDayForm
                  instructors={orderedInstructors}
                  adminEnabled={adminEnabled}
                />
              )}
              {activeAction === "copy-week" && (
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
