import { CheckCircle2 } from "lucide-react";
import {
  formatDate,
  formatMoney,
  formatTime,
  getTransmissionLabel,
} from "@/lib/formatters";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export type DirectorSlot = Slot & {
  instructor: Instructor | null;
  lessonType: LessonType | null;
  scheduleDay: ScheduleDay | null;
  school: School | null;
  booking: Booking | null;
};

function getSlotStatus(slot: DirectorSlot) {
  if (slot.status === "blocked") return "Закрыт";
  if (slot.booking) return "Занят";
  return "Свободен";
}

function getSlotStatusClassName(slot: DirectorSlot) {
  if (slot.status === "blocked") return "bg-zinc-200 text-zinc-700";
  if (slot.booking) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

export function DirectorSlotRow({
  slot,
  timezone,
  compact = false,
}: {
  slot: DirectorSlot;
  timezone: string;
  compact?: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tabular-nums text-zinc-950">
            {formatTime(slot.start_time, timezone)}
            <span className="mx-1.5 text-zinc-300">-</span>
            {formatTime(slot.end_time, timezone)}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: slot.lessonType?.color ?? "#d4d4d8" }}
            />
            <p className="truncate text-sm font-semibold">
              {slot.lessonType?.name ?? "Тип занятия не найден"}
            </p>
          </div>
        </div>
        <Badge className={getSlotStatusClassName(slot)}>{getSlotStatus(slot)}</Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          {slot.instructor?.public_name ?? slot.instructor?.name ?? "Инструктор"}
        </span>
        {slot.scheduleDay && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {formatDate(slot.scheduleDay.date)}
          </span>
        )}
        {slot.scheduleDay && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {getTransmissionLabel(slot.scheduleDay.transmission)}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          {slot.location_type === "in_car"
            ? "В автомобиле"
            : slot.location_type === "online"
              ? "Онлайн"
              : slot.location_type === "classroom"
                ? "В классе"
                : "Другое"}
        </span>
      </div>

      {slot.booking && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-amber-950">
              {slot.booking.student_label}
            </p>
            {slot.booking.lesson_state === "completed" && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="size-3" />
                Проведено
              </span>
            )}
          </div>
          {!compact &&
            slot.booking.price_amount !== null &&
            slot.booking.price_amount !== undefined && (
              <p className="mt-1 text-xs font-semibold text-amber-900">
                К оплате: {formatMoney(slot.booking.price_amount)}
                {" · "}
                Получено: {formatMoney(slot.booking.paid_amount ?? 0)}
              </p>
            )}
        </div>
      )}
    </div>
  );
}
