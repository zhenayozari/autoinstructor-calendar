"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Clock3, UserRound } from "lucide-react";
import { BookingDialog } from "@/components/calendar/booking-dialog";

type ScheduleSlot = {
  id: string;
  instructor_id: string;
  instructor_name: string;
  instructor_slug: string;
  timezone: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  lesson_type_id: string;
  lesson_type_code: string;
  lesson_type_name: string;
  lesson_type_description: string | null;
  lesson_type_color: string;
  lesson_kind: "driving" | "theory";
  lesson_type_tags: string[];
  lesson_type_sort_order: number;
  start_time: string;
  end_time: string;
  location_type: "in_car" | "online" | "classroom" | "other";
  status: "available" | "blocked";
  is_booked: boolean;
};

type CalendarDay = {
  date: string;
  slots: ScheduleSlot[];
};

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDayLabel(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatDayNumber(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatFullDate(date: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parseDate(date));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function getLocationLabel(locationType: ScheduleSlot["location_type"]) {
  const labels = {
    in_car: "В автомобиле",
    online: "Онлайн",
    classroom: "В классе",
    other: "Другое",
  };

  return labels[locationType];
}

function getTransmissionLabel(transmission: ScheduleSlot["transmission"]) {
  if (transmission === "automatic") return "АКПП";
  if (transmission === "manual") return "МКПП";
  return null;
}

function isAvailable(slot: ScheduleSlot) {
  return slot.status === "available" && !slot.is_booked;
}

function MobileSlotCard({
  slot,
  showInstructorName,
}: {
  slot: ScheduleSlot;
  showInstructorName: boolean;
}) {
  const available = isAvailable(slot);
  const transmission = getTransmissionLabel(slot.transmission);
  const timeLabel = `${formatTime(slot.start_time, slot.timezone)} — ${formatTime(
    slot.end_time,
    slot.timezone,
  )}`;
  const dateLabel = `${formatFullDate(slot.date)}`;

  const content = (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-sm ${
        available
          ? "border-zinc-200 active:scale-[0.99]"
          : "border-zinc-100 opacity-60"
      }`}
      style={{ borderLeftColor: slot.lesson_type_color, borderLeftWidth: 4 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-lg font-bold text-zinc-950">
            <Clock3 className="size-4 text-zinc-400" />
            {timeLabel}
          </p>
          <p className="mt-2 text-sm font-semibold leading-5 text-zinc-800">
            {slot.lesson_type_name}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            available
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {available
            ? "Свободно"
            : slot.is_booked
              ? "Занято"
              : "Недоступно"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {transmission && (
          <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
            {transmission}
          </span>
        )}
        <span className="rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
          {getLocationLabel(slot.location_type)}
        </span>
        {showInstructorName && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-600">
            <UserRound className="size-3" />
            <span className="truncate">{slot.instructor_name}</span>
          </span>
        )}
      </div>

      {available && (
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-3 py-2 text-xs font-semibold text-white">
          <CalendarCheck className="size-3.5" />
          Записаться
        </div>
      )}
    </div>
  );

  if (!available) {
    return content;
  }

  return (
    <BookingDialog
      slotId={slot.id}
      lessonName={slot.lesson_type_name}
      dateLabel={dateLabel}
      timeLabel={timeLabel}
      color={slot.lesson_type_color}
    >
      {content}
    </BookingDialog>
  );
}

export function PublicCalendarMobile({
  days,
  today,
  showInstructorName,
}: {
  days: CalendarDay[];
  today: string;
  showInstructorName: boolean;
}) {
  const initialDate = useMemo(() => {
    const todayInWeek = days.find((day) => day.date === today);
    const firstWithFreeSlots = days.find((day) =>
      day.slots.some((slot) => isAvailable(slot)),
    );

    return (todayInWeek ?? firstWithFreeSlots ?? days[0])?.date ?? "";
  }, [days, today]);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const selectedDay =
    days.find((day) => day.date === selectedDate) ?? days[0] ?? null;
  const availableSlots =
    selectedDay?.slots.filter((slot) => isAvailable(slot)) ?? [];
  const unavailableSlots =
    selectedDay?.slots.filter((slot) => !isAvailable(slot)) ?? [];

  if (!selectedDay) {
    return null;
  }

  return (
    <div className="lg:hidden">
      <div className="border-b border-zinc-200/80 px-4 py-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {days.map((day) => {
            const isSelected = day.date === selectedDay.date;
            const isToday = day.date === today;
            const freeCount = day.slots.filter((slot) =>
              isAvailable(slot),
            ).length;

            return (
              <button
                key={day.date}
                type="button"
                className={`min-w-[76px] rounded-2xl border px-3 py-2 text-left transition ${
                  isSelected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "border-zinc-200 bg-white text-zinc-700"
                }`}
                onClick={() => setSelectedDate(day.date)}
              >
                <span className="block text-[11px] font-semibold uppercase">
                  {formatDayLabel(day.date)}
                </span>
                <span className="mt-0.5 block text-sm font-bold">
                  {formatDayNumber(day.date)}
                </span>
                <span
                  className={`mt-1 block text-[10px] ${
                    isSelected ? "text-zinc-300" : "text-zinc-400"
                  }`}
                >
                  {isToday ? "Сегодня · " : ""}
                  {freeCount} своб.
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-4 px-4 py-5">
        <div>
          <h3 className="text-xl font-semibold capitalize text-zinc-950">
            {formatFullDate(selectedDay.date)}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            {availableSlots.length > 0
              ? `Свободных слотов: ${availableSlots.length}`
              : "Свободных слотов на этот день нет"}
          </p>
        </div>

        {availableSlots.length > 0 ? (
          <div className="space-y-2.5">
            {availableSlots.map((slot) => (
              <MobileSlotCard
                key={slot.id}
                slot={slot}
                showInstructorName={showInstructorName}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            Выберите другой день — свободные занятия подсвечены в табах сверху.
          </div>
        )}

        {unavailableSlots.length > 0 && (
          <details className="rounded-2xl border bg-zinc-50">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-600">
              Занятые и недоступные слоты · {unavailableSlots.length}
            </summary>
            <div className="space-y-2 border-t p-3">
              {unavailableSlots.map((slot) => (
                <MobileSlotCard
                  key={slot.id}
                  slot={slot}
                  showInstructorName={showInstructorName}
                />
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
