"use client";

import { useEffect, useState } from "react";
import { AdminQuickActions } from "@/components/admin/admin-quick-actions";
import { AdminWeekCalendar } from "@/components/admin/admin-week-calendar";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type QuickActionType = "slot" | "day" | "copy-day" | "copy-week";

export function AdminScheduleWorkspace({
  instructors,
  lessonTypes,
  schools,
  scheduleDays,
  slots,
  bookings,
  defaultWeekDate,
  initialInstructorId,
  canSelectInstructor,
  adminEnabled,
  initialSlotDate,
  initialOpenSlotForm = false,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  schools: School[];
  scheduleDays: ScheduleDay[];
  slots: Slot[];
  bookings: Booking[];
  defaultWeekDate: string;
  initialInstructorId: string;
  canSelectInstructor: boolean;
  adminEnabled: boolean;
  initialSlotDate?: string;
  initialOpenSlotForm?: boolean;
}) {
  const [instructorId, setInstructorId] = useState(initialInstructorId);
  const [weekDate, setWeekDate] = useState(defaultWeekDate);
  const [slotDefaultDate, setSlotDefaultDate] = useState<string | null>(
    initialSlotDate ?? null,
  );
  const [slotRequestKey, setSlotRequestKey] = useState(
    initialOpenSlotForm ? 1 : 0,
  );
  const [activeQuickAction, setActiveQuickAction] =
    useState<QuickActionType | null>(initialOpenSlotForm ? "slot" : null);

  useEffect(() => {
    if (!initialOpenSlotForm) return;

    const timeout = window.setTimeout(() => {
      document
        .getElementById("schedule-quick-actions")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [initialOpenSlotForm]);

  function handleCreateSlotForDate(date: string) {
    setSlotDefaultDate(date);
    setSlotRequestKey((current) => current + 1);
    setActiveQuickAction("slot");

    window.setTimeout(() => {
      document
        .getElementById("schedule-quick-actions")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div>
            <CardTitle>Недельный календарь</CardTitle>
            <CardDescription>
              Основной обзор: дни недели, занятые занятия и свободные окна.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <AdminWeekCalendar
            instructors={instructors}
            lessonTypes={lessonTypes}
            schools={schools}
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
            onCreateSlotForDate={handleCreateSlotForDate}
          />
        </CardContent>
      </Card>

      {instructorId ? (
        <>
          <div id="schedule-quick-actions" className="scroll-mt-4">
            <AdminQuickActions
              instructors={instructors}
              lessonTypes={lessonTypes.filter((lessonType) => lessonType.is_active)}
              schools={schools}
              scheduleDays={scheduleDays}
              slots={slots}
              bookings={bookings}
              selectedInstructorId={instructorId}
              adminEnabled={adminEnabled}
              slotDefaultDate={slotDefaultDate}
              slotFallbackDate={defaultWeekDate}
              slotRequestKey={slotRequestKey}
              activeAction={activeQuickAction}
              onActiveActionChange={setActiveQuickAction}
            />
          </div>
        </>
      ) : (
        <div className="rounded-2xl border border-dashed bg-white px-5 py-10 text-center text-sm text-zinc-600">
          Расписание пока не привязано к вашему профилю.
        </div>
      )}
    </div>
  );
}
