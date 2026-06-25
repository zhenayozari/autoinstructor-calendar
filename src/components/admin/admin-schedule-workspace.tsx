"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { AdminQuickActions } from "@/components/admin/admin-quick-actions";
import { AdminWeekCalendar } from "@/components/admin/admin-week-calendar";
import { SchedulePublicationPanel } from "@/components/admin/schedule-publication-panel";
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
  slug: string;
  public_name: string | null;
  timezone: string;
};

type LessonType = {
  id: string;
  name: string;
  color: string;
  kind: "driving" | "theory";
  default_duration_minutes: number;
  is_active: boolean;
};

type ScheduleDay = {
  id: string;
  instructor_id: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  published_at: string | null;
  slot_count: number;
};

type Slot = {
  id: string;
  instructor_id: string;
  schedule_day_id: string;
  lesson_type_id: string;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked" | "cancelled";
  note: string | null;
};

type Booking = {
  id: string;
  slot_id: string;
  student_label: string;
  created_at: string;
};

export function AdminScheduleWorkspace({
  instructors,
  lessonTypes,
  scheduleDays,
  slots,
  bookings,
  defaultWeekDate,
  initialInstructorId,
  canSelectInstructor,
  adminEnabled,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  scheduleDays: ScheduleDay[];
  slots: Slot[];
  bookings: Booking[];
  defaultWeekDate: string;
  initialInstructorId: string;
  canSelectInstructor: boolean;
  adminEnabled: boolean;
}) {
  const [instructorId, setInstructorId] = useState(initialInstructorId);
  const [weekDate, setWeekDate] = useState(defaultWeekDate);
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === instructorId,
  );

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle>Недельный календарь</CardTitle>
              <CardDescription>
                Сначала обзор недели и записей. Действия со слотами открываются
                в отдельной панели.
              </CardDescription>
            </div>
            <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
              {selectedInstructor
                ? `${selectedInstructor.public_name ?? selectedInstructor.name} / ${selectedInstructor.slug}`
                : "Инструктор не выбран"}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <AdminWeekCalendar
            instructors={instructors}
            lessonTypes={lessonTypes.map(({ id, name, color }) => ({
              id,
              name,
              color,
            }))}
            scheduleDays={scheduleDays}
            slots={slots}
            bookings={bookings}
            weekDate={weekDate}
            currentWeekDate={defaultWeekDate}
            instructorId={instructorId}
            onWeekDateChange={setWeekDate}
            onInstructorChange={setInstructorId}
            canSelectInstructor={canSelectInstructor}
            adminEnabled={adminEnabled}
          />
        </CardContent>
      </Card>

      {instructorId ? (
        <>
          <AdminQuickActions
            instructors={instructors.map(({ id, name }) => ({ id, name }))}
            lessonTypes={lessonTypes
              .filter((lessonType) => lessonType.is_active)
              .map(({ id, name, kind, default_duration_minutes }) => ({
                id,
                name,
                kind,
                default_duration_minutes,
              }))}
            selectedInstructorId={instructorId}
            adminEnabled={adminEnabled}
          />

          <details className="group rounded-2xl border bg-white shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-6">
              <div>
                <p className="font-semibold">Публикация расписания</p>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  Открыть, скрыть или запланировать публикацию дней недели.
                </p>
              </div>
              <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t p-4 sm:p-6">
              <SchedulePublicationPanel
                instructors={instructors}
                scheduleDays={scheduleDays}
                instructorId={instructorId}
                weekDate={weekDate}
              />
            </div>
          </details>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed bg-white px-5 py-10 text-center text-sm text-zinc-600">
          Выберите инструктора в календаре, чтобы открыть создание, копирование
          и публикацию расписания.
        </div>
      )}
    </div>
  );
}
