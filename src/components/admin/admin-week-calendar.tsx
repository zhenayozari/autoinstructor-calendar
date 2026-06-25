"use client";

import { useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleX,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  cancelBookingAction,
  deleteSlotAction,
} from "@/app/admin/actions";
import { getVisibleSlotNote } from "@/lib/slot-notes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
};

type ScheduleDay = {
  id: string;
  instructor_id: string;
  date: string;
  transmission: "automatic" | "manual" | null;
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

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

const locationLabels = {
  in_car: "В автомобиле",
  online: "Онлайн",
  classroom: "В классе",
  other: "Другое",
};

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getWeekStart(value: string) {
  const date = parseDate(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function formatDayTitle(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseDate(value));
}

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(new Date(value));
}

function getTransmissionLabel(transmission: ScheduleDay["transmission"]) {
  if (transmission === "automatic") return "АКПП";
  if (transmission === "manual") return "МКПП";
  return "Теория";
}

function getShortLessonName(name: string) {
  const normalized = name.toLocaleLowerCase("ru-RU");

  if (normalized.includes("omg")) return "OMG";
  if (normalized.includes("главн")) return "Главная";
  if (normalized.includes("подар")) return "Подарок";
  if (normalized.includes("доп")) return "Доп";

  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

function SlotActions({
  slotId,
  bookingId,
  adminEnabled,
}: {
  slotId: string;
  bookingId: string | null;
  adminEnabled: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {bookingId && (
        <form action={cancelBookingAction}>
          <input type="hidden" name="booking_id" value={bookingId} />
          <Button
            type="submit"
            variant="outline"
            className="h-9 w-full text-xs"
            disabled={!adminEnabled}
          >
            <CircleX />
            Отменить запись
          </Button>
        </form>
      )}
      <form action={deleteSlotAction}>
        <input type="hidden" name="slot_id" value={slotId} />
        <Button
          type="submit"
          variant="destructive"
          className="h-9 w-full text-xs"
          disabled={!adminEnabled}
        >
          <Trash2 />
          Удалить слот
        </Button>
      </form>
    </div>
  );
}

function DesktopSlotCard({
  slot,
  lessonType,
  booking,
  timezone,
  onClick,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  timezone: string;
  onClick: () => void;
}) {
  const isBlocked = slot.status === "blocked";

  return (
    <button
      type="button"
      className="max-h-28 w-full overflow-hidden rounded-xl border bg-white p-2 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      onClick={onClick}
      aria-label={`Открыть слот ${formatTime(slot.start_time, timezone)}–${formatTime(slot.end_time, timezone)}`}
    >
      <div className="flex items-start justify-between gap-1.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold tabular-nums">
            {formatTime(slot.start_time, timezone)}–
            {formatTime(slot.end_time, timezone)}
          </p>
          <p className="mt-0.5 truncate text-[11px] font-medium leading-4">
            {lessonType.name}
          </p>
        </div>
        <span
          className="mt-0.5 size-2 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: lessonType.color }}
        />
      </div>

      <div className="mt-1">
        <Badge
          className={`px-1.5 py-0 text-[10px] ${
            isBlocked
              ? "bg-zinc-200 text-zinc-700"
              : booking
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isBlocked ? "Блок" : booking ? "Занят" : "Свободен"}
        </Badge>
      </div>

      {booking && (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-semibold leading-4 text-amber-950">
          <UserRound className="size-3 shrink-0" />
          {booking.student_label}
        </p>
      )}
    </button>
  );
}

function DesktopSlotPanel({
  slot,
  lessonType,
  booking,
  scheduleDay,
  instructor,
  adminEnabled,
  onClose,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  scheduleDay: ScheduleDay | undefined;
  instructor: Instructor;
  adminEnabled: boolean;
  onClose: () => void;
}) {
  const isBlocked = slot.status === "blocked";
  const visibleNote = getVisibleSlotNote(slot.note);

  return (
    <div className="fixed inset-0 z-50 hidden lg:block">
      <button
        type="button"
        className="absolute inset-0 bg-black/20"
        aria-label="Закрыть панель слота"
        onClick={onClose}
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b p-5">
          <div>
            <p className="text-muted-foreground text-xs font-medium">
              Управление слотом
            </p>
            <h3 className="mt-1 text-xl font-bold">
              {formatTime(slot.start_time, instructor.timezone)}–
              {formatTime(slot.end_time, instructor.timezone)}
            </h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X />
          </Button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className={
                isBlocked
                  ? "bg-zinc-200 text-zinc-700"
                  : booking
                    ? "bg-amber-100 text-amber-800"
                    : "bg-emerald-100 text-emerald-800"
              }
            >
              {isBlocked ? "Заблокирован" : booking ? "Занят" : "Свободен"}
            </Badge>
            <span
              className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium"
              style={{ borderColor: lessonType.color }}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: lessonType.color }}
              />
              {lessonType.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-muted-foreground text-xs">Дата</p>
              <p className="mt-1 font-semibold">
                {scheduleDay ? formatDayTitle(scheduleDay.date) : "Не указана"}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-muted-foreground text-xs">Коробка</p>
              <p className="mt-1 font-semibold">
                {getTransmissionLabel(scheduleDay?.transmission ?? null)}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-muted-foreground text-xs">Формат</p>
              <p className="mt-1 font-semibold">
                {locationLabels[slot.location_type]}
              </p>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3">
              <p className="text-muted-foreground text-xs">Инструктор</p>
              <p className="mt-1 truncate font-semibold">
                {instructor.public_name ?? instructor.name}
              </p>
            </div>
          </div>

          {booking ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-medium text-amber-700">Ученик</p>
              <p className="mt-1 flex items-center gap-2 font-semibold text-amber-950">
                <UserRound className="size-4" />
                {booking.student_label}
              </p>
              <p className="mt-2 text-xs text-amber-800">
                Запись создана:{" "}
                {new Intl.DateTimeFormat("ru-RU", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: instructor.timezone,
                }).format(new Date(booking.created_at))}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              На этот слот пока никто не записан.
            </div>
          )}

          {visibleNote && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="flex items-start gap-2 text-sm leading-6 text-blue-900">
                <StickyNote className="mt-0.5 size-4 shrink-0" />
                <span className="whitespace-pre-wrap break-words">
                  {visibleNote}
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="border-t p-5">
          <SlotActions
            slotId={slot.id}
            bookingId={booking?.id ?? null}
            adminEnabled={adminEnabled}
          />
        </div>
      </aside>
    </div>
  );
}

function MobileSlotRow({
  slot,
  lessonType,
  booking,
  timezone,
  adminEnabled,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  timezone: string;
  adminEnabled: boolean;
}) {
  const isBlocked = slot.status === "blocked";
  const visibleNote = getVisibleSlotNote(slot.note);

  return (
    <details className="group rounded-lg border bg-white">
      <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2">
        <span className="text-xs font-bold tabular-nums">
          {formatTime(slot.start_time, timezone)}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span
            className="h-5 w-1 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: lessonType.color }}
          />
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold">
              {getShortLessonName(lessonType.name)}
            </span>
            {booking && (
              <span className="block truncate text-[11px] text-zinc-500">
                {booking.student_label}
              </span>
            )}
          </span>
        </span>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-bold ${
            isBlocked
              ? "bg-zinc-200 text-zinc-700"
              : booking
                ? "bg-amber-100 text-amber-800"
                : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isBlocked ? "Блок" : booking ? "Занят" : "Свободен"}
        </span>
      </summary>

      <div className="space-y-3 border-t px-3 py-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-zinc-400">Время</p>
            <p className="mt-0.5 font-semibold">
              {formatTime(slot.start_time, timezone)}–
              {formatTime(slot.end_time, timezone)}
            </p>
          </div>
          <div>
            <p className="text-zinc-400">Тип занятия</p>
            <p className="mt-0.5 font-semibold">{lessonType.name}</p>
          </div>
          <div>
            <p className="text-zinc-400">Формат</p>
            <p className="mt-0.5 font-semibold">
              {locationLabels[slot.location_type]}
            </p>
          </div>
          {booking && (
            <div>
              <p className="text-zinc-400">Ученик</p>
              <p className="mt-0.5 font-semibold">{booking.student_label}</p>
            </div>
          )}
        </div>

        {visibleNote && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-2">
            <p className="flex items-start gap-1.5 text-xs leading-5 text-blue-900">
              <StickyNote className="mt-0.5 size-3.5 shrink-0" />
              <span className="whitespace-pre-wrap break-words">
                {visibleNote}
              </span>
            </p>
          </div>
        )}

        <SlotActions
          slotId={slot.id}
          bookingId={booking?.id ?? null}
          adminEnabled={adminEnabled}
        />
      </div>
    </details>
  );
}

export function AdminWeekCalendar({
  instructors,
  lessonTypes,
  scheduleDays,
  slots,
  bookings,
  weekDate,
  currentWeekDate,
  instructorId,
  onWeekDateChange,
  onInstructorChange,
  canSelectInstructor,
  adminEnabled,
  onCreateSlotForDate,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  scheduleDays: ScheduleDay[];
  slots: Slot[];
  bookings: Booking[];
  weekDate: string;
  currentWeekDate: string;
  instructorId: string;
  onWeekDateChange: (value: string) => void;
  onInstructorChange: (value: string) => void;
  canSelectInstructor: boolean;
  adminEnabled: boolean;
  onCreateSlotForDate?: (date: string) => void;
}) {
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const weekStart = getWeekStart(weekDate);
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === instructorId,
  );
  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        formatDate(addDays(weekStart, index)),
      ),
    [weekStart],
  );
  const lessonTypesById = useMemo(
    () => new Map(lessonTypes.map((lessonType) => [lessonType.id, lessonType])),
    [lessonTypes],
  );
  const bookingsBySlotId = useMemo(
    () => new Map(bookings.map((booking) => [booking.slot_id, booking])),
    [bookings],
  );
  const daysByDate = useMemo(
    () =>
      new Map(
        scheduleDays
          .filter((day) => day.instructor_id === instructorId)
          .map((day) => [day.date, day]),
      ),
    [instructorId, scheduleDays],
  );
  const slotsByDayId = useMemo(() => {
    const result = new Map<string, Slot[]>();

    for (const slot of slots) {
      if (slot.instructor_id !== instructorId || slot.status === "cancelled") {
        continue;
      }

      const current = result.get(slot.schedule_day_id) ?? [];
      current.push(slot);
      result.set(slot.schedule_day_id, current);
    }

    for (const daySlots of result.values()) {
      daySlots.sort(
        (first, second) =>
          new Date(first.start_time).getTime() -
          new Date(second.start_time).getTime(),
      );
    }

    return result;
  }, [instructorId, slots]);

  const selectedSlot =
    selectedSlotId === null
      ? null
      : slots.find(
          (slot) =>
            slot.id === selectedSlotId &&
            slot.instructor_id === instructorId &&
            slot.status !== "cancelled",
        ) ?? null;
  const selectedLessonType = selectedSlot
    ? lessonTypesById.get(selectedSlot.lesson_type_id)
    : undefined;
  const selectedBooking = selectedSlot
    ? (bookingsBySlotId.get(selectedSlot.id) ?? null)
    : null;
  const selectedScheduleDay = selectedSlot
    ? scheduleDays.find((day) => day.id === selectedSlot.schedule_day_id)
    : undefined;

  function handleWeekDateChange(value: string) {
    setSelectedSlotId(null);
    onWeekDateChange(value);
  }

  function handleInstructorChange(value: string) {
    setSelectedSlotId(null);
    onInstructorChange(value);
  }

  function getDayData(date: string) {
    const scheduleDay = daysByDate.get(date);
    const daySlots = scheduleDay
      ? (slotsByDayId.get(scheduleDay.id) ?? [])
      : [];
    const occupiedCount = daySlots.filter((slot) =>
      bookingsBySlotId.has(slot.id),
    ).length;
    const freeCount = daySlots.filter(
      (slot) =>
        slot.status === "available" && !bookingsBySlotId.has(slot.id),
    ).length;
    const blockedCount = daySlots.filter(
      (slot) => slot.status === "blocked",
    ).length;

    return {
      scheduleDay,
      daySlots,
      occupiedCount,
      freeCount,
      blockedCount,
    };
  }

  function renderEmptyDay(date?: string) {
    return (
      <div className="rounded-xl border border-dashed bg-white px-3 py-4 text-center">
        <CalendarPlus className="mx-auto size-5 text-zinc-400" />
        <p className="mt-2 text-sm font-medium">Слотов нет</p>
        {date && onCreateSlotForDate && (
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9 w-full"
            onClick={() => onCreateSlotForDate(date)}
          >
            <CalendarPlus />
            Добавить слот
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        {canSelectInstructor ? (
          <div className="w-full space-y-2 xl:max-w-xs">
            <label htmlFor="calendar-instructor" className="text-sm font-medium">
              Инструктор
            </label>
            <select
              id="calendar-instructor"
              className={selectClassName}
              value={instructorId}
              onChange={(event) => handleInstructorChange(event.target.value)}
            >
              <option value="" disabled>
                Выберите инструктора
              </option>
              {instructors.map((instructor) => (
                <option key={instructor.id} value={instructor.id}>
                  {instructor.public_name ?? instructor.name} /{" "}
                  {instructor.slug}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <p className="text-muted-foreground text-xs">Инструктор</p>
            <p className="font-semibold">
              {selectedInstructor?.public_name ??
                selectedInstructor?.name ??
                "Не выбран"}
            </p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-2 text-xs sm:h-10 sm:px-3 sm:text-sm"
            onClick={() =>
              handleWeekDateChange(formatDate(addDays(weekStart, -7)))
            }
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Предыдущая</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-2 text-xs sm:h-10 sm:px-3 sm:text-sm"
            onClick={() => handleWeekDateChange(currentWeekDate)}
          >
            Текущая
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 px-2 text-xs sm:h-10 sm:px-3 sm:text-sm"
            onClick={() =>
              handleWeekDateChange(formatDate(addDays(weekStart, 7)))
            }
          >
            <span className="hidden sm:inline">Следующая</span>
            <ChevronRight />
          </Button>
        </div>
      </div>

      <div className="rounded-xl bg-zinc-100 px-4 py-2.5 text-center text-sm font-medium">
        {weekDates[0]} — {weekDates[6]}
      </div>

      <div className="space-y-3 lg:hidden">
        {weekDates.map((date) => {
          const {
            scheduleDay,
            daySlots,
            occupiedCount,
            freeCount,
            blockedCount,
          } = getDayData(date);

          return (
            <section key={date} className="rounded-xl bg-zinc-50 p-2.5">
              <div className="mb-2.5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold capitalize">
                    {formatDayTitle(date)}
                  </h3>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {scheduleDay
                      ? getTransmissionLabel(scheduleDay.transmission)
                      : "День не создан"}
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="text-right text-[11px] leading-4 text-zinc-500">
                    <p>{daySlots.length} слотов</p>
                    <p>
                      <span className="text-amber-700">
                        {occupiedCount} занято
                      </span>
                      {" · "}
                      <span className="text-emerald-700">
                        {freeCount} свободно
                      </span>
                      {blockedCount > 0 && ` · ${blockedCount} блок`}
                    </p>
                  </div>
                  {onCreateSlotForDate && (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      className="shrink-0 rounded-full bg-white"
                      aria-label={`Добавить слот на ${formatDayTitle(date)}`}
                      onClick={() => onCreateSlotForDate(date)}
                    >
                      <CalendarPlus />
                    </Button>
                  )}
                </div>
              </div>

              {scheduleDay && daySlots.length > 0 && selectedInstructor ? (
                <div className="space-y-1.5">
                  {daySlots.map((slot) => {
                    const lessonType = lessonTypesById.get(slot.lesson_type_id);
                    if (!lessonType) return null;

                    return (
                      <MobileSlotRow
                        key={slot.id}
                        slot={slot}
                        lessonType={lessonType}
                        booking={bookingsBySlotId.get(slot.id) ?? null}
                        timezone={selectedInstructor.timezone}
                        adminEnabled={adminEnabled}
                      />
                    );
                  })}
                </div>
              ) : (
                renderEmptyDay(date)
              )}
            </section>
          );
        })}
      </div>

      <div className="hidden gap-2 lg:grid lg:grid-cols-7">
        {weekDates.map((date) => {
          const { scheduleDay, daySlots, occupiedCount, freeCount } =
            getDayData(date);

          return (
            <section
              key={date}
              className="min-w-0 rounded-xl bg-zinc-50 p-2"
            >
              <div className="mb-2">
                <h3 className="text-sm font-semibold capitalize">
                  {formatDayTitle(date)}
                </h3>
                <p className="text-muted-foreground mt-0.5 text-[11px]">
                  {scheduleDay
                    ? `${getTransmissionLabel(scheduleDay.transmission)} · ${occupiedCount}/${daySlots.length} занято · ${freeCount} свободно`
                    : date}
                </p>
              </div>

              {scheduleDay && daySlots.length > 0 && selectedInstructor ? (
                <div className="space-y-1.5">
                  {daySlots.map((slot) => {
                    const lessonType = lessonTypesById.get(slot.lesson_type_id);
                    if (!lessonType) return null;

                    return (
                      <DesktopSlotCard
                        key={slot.id}
                        slot={slot}
                        lessonType={lessonType}
                        booking={bookingsBySlotId.get(slot.id) ?? null}
                        timezone={selectedInstructor.timezone}
                        onClick={() => setSelectedSlotId(slot.id)}
                      />
                    );
                  })}
                </div>
              ) : (
                renderEmptyDay()
              )}
            </section>
          );
        })}
      </div>

      {selectedSlot &&
        selectedLessonType &&
        selectedInstructor && (
          <DesktopSlotPanel
            slot={selectedSlot}
            lessonType={selectedLessonType}
            booking={selectedBooking}
            scheduleDay={selectedScheduleDay}
            instructor={selectedInstructor}
            adminEnabled={adminEnabled}
            onClose={() => setSelectedSlotId(null)}
          />
        )}
    </div>
  );
}
