"use client";

import { useActionState, useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { createSlotAction, type SlotActionState } from "@/app/admin/actions";
import {
  addUtcDays,
  formatDateValue,
  formatDayTitle,
  formatTime,
  getUtcWeekStart,
  parseUtcDate,
  selectClassName,
} from "@/lib/formatters";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";



const INITIAL_STATE: SlotActionState = {
  status: "idle",
  message: "",
};

function addMinutes(time: string, minutes: number) {
  const [hours = 0, currentMinutes = 0] = time.split(":").map(Number);
  const total = hours * 60 + currentMinutes + minutes;
  const nextHours = Math.floor(total / 60) % 24;
  const nextMinutes = total % 60;

  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function formatWeekday(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

function formatDayNumber(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

function getSlotStatusLabel(slot: Slot, booking: Booking | undefined) {
  if (slot.status === "blocked") return "Блок";
  if (booking) return "Занят";
  return "Свободен";
}

export function SlotForm({
  instructors,
  lessonTypes,
  schools,
  scheduleDays = [],
  slots = [],
  bookings = [],
  adminEnabled,
  defaultDate,
  fallbackDate,
}: {
  instructors: Instructor[];
  lessonTypes: LessonType[];
  schools: School[];
  scheduleDays?: ScheduleDay[];
  slots?: Slot[];
  bookings?: Booking[];
  adminEnabled: boolean;
  defaultDate?: string;
  fallbackDate?: string;
}) {
  const [state, formAction, isPending] = useActionState(
    createSlotAction,
    INITIAL_STATE,
  );
  const selectedInstructorId = instructors[0]?.id ?? "";
  const initialSelectedDate = defaultDate ?? fallbackDate ?? "";
  const [selectedDate, setSelectedDate] = useState(initialSelectedDate);
  const [visibleWeekDate, setVisibleWeekDate] = useState(initialSelectedDate);
  const [lessonTypeId, setLessonTypeId] = useState(lessonTypes[0]?.id ?? "");
  const [startTime, setStartTime] = useState("10:00");
  const selectedInstructor = instructors[0] ?? null;
  const selectedLessonType = useMemo(
    () => lessonTypes.find((lessonType) => lessonType.id === lessonTypeId),
    [lessonTypeId, lessonTypes],
  );
  const weekStart = getUtcWeekStart(visibleWeekDate);
  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        formatDateValue(addUtcDays(weekStart, index)),
      ),
    [weekStart],
  );
  const daysByDate = useMemo(
    () =>
      new Map(
        scheduleDays
          .filter((day) => day.instructor_id === selectedInstructorId)
          .map((day) => [day.date, day]),
      ),
    [scheduleDays, selectedInstructorId],
  );
  const slotsByDayId = useMemo(() => {
    const result = new Map<string, Slot[]>();

    for (const slot of slots) {
      if (
        slot.instructor_id !== selectedInstructorId ||
        slot.status === "cancelled"
      ) {
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
  }, [selectedInstructorId, slots]);
  const bookingsBySlotId = useMemo(
    () => new Map(bookings.map((booking) => [booking.slot_id, booking])),
    [bookings],
  );
  const lessonTypesById = useMemo(
    () => new Map(lessonTypes.map((lessonType) => [lessonType.id, lessonType])),
    [lessonTypes],
  );
  const selectedScheduleDay = daysByDate.get(selectedDate);
  const selectedDayPublished = Boolean(selectedScheduleDay?.published_at);
  const selectedDaySlots = selectedScheduleDay
    ? slotsByDayId.get(selectedScheduleDay.id) ?? []
    : [];
  const freeSlotsCount = selectedDaySlots.filter(
    (slot) => slot.status !== "blocked" && !bookingsBySlotId.has(slot.id),
  ).length;
  const endTime = selectedLessonType
    ? addMinutes(startTime, selectedLessonType.default_duration_minutes)
    : null;

  return (
    <form action={formAction} className="space-y-5">
      <div className="space-y-3 rounded-2xl border bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Предыдущая неделя"
            onClick={() => {
              const previousWeek = formatDateValue(addUtcDays(weekStart, -7));
              setVisibleWeekDate(previousWeek);
              setSelectedDate(previousWeek);
            }}
          >
            <ChevronLeft />
          </Button>
          <div className="text-center">
            <p className="text-xs font-medium text-zinc-500">Выберите день</p>
            <p className="text-sm font-semibold">
              {weekDates[0]} — {weekDates[6]}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Следующая неделя"
            onClick={() => {
              const nextWeek = formatDateValue(addUtcDays(weekStart, 7));
              setVisibleWeekDate(nextWeek);
              setSelectedDate(nextWeek);
            }}
          >
            <ChevronRight />
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {weekDates.map((date) => {
            const scheduleDay = daysByDate.get(date);
            const daySlots = scheduleDay
              ? slotsByDayId.get(scheduleDay.id) ?? []
              : [];
            const bookedCount = daySlots.filter((slot) =>
              bookingsBySlotId.has(slot.id),
            ).length;
            const isSelected = selectedDate === date;

            return (
              <button
                key={date}
                type="button"
                className={`min-h-16 rounded-xl border px-1 py-2 text-center transition ${
                  isSelected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "bg-white hover:border-zinc-400"
                }`}
                onClick={() => setSelectedDate(date)}
              >
                <span className="block text-[10px] font-medium uppercase opacity-70">
                  {formatWeekday(date)}
                </span>
                <span className="mt-1 block text-lg font-bold leading-none">
                  {formatDayNumber(date)}
                </span>
                <span className="mt-1 block text-[10px] leading-3 opacity-75">
                  {daySlots.length === 0
                    ? "пусто"
                    : bookedCount > 0
                      ? `${bookedCount}/${daySlots.length}`
                      : `${daySlots.length} сл.`}
                </span>
              </button>
            );
          })}
        </div>

        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {formatDayTitle(selectedDate)}
              </p>
              <p className="text-xs text-zinc-500">
                Слотов: {selectedDaySlots.length} · свободно: {freeSlotsCount}
              </p>
            </div>
            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-zinc-600">
              {selectedDate}
            </span>
          </div>

          {selectedDaySlots.length > 0 ? (
            <div className="mt-3 space-y-2">
              {selectedDaySlots.map((slot) => {
                const lessonType = lessonTypesById.get(slot.lesson_type_id);
                const booking = bookingsBySlotId.get(slot.id);

                return (
                  <div
                    key={slot.id}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold tabular-nums">
                        {selectedInstructor
                          ? `${formatTime(slot.start_time, selectedInstructor.timezone)}–${formatTime(slot.end_time, selectedInstructor.timezone)}`
                          : "Время"}
                      </p>
                      <p className="truncate text-zinc-500">
                        {lessonType?.name ?? "Тип не найден"}
                        {booking ? ` · ${booking.student_label}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-1 font-semibold text-zinc-700">
                      {getSlotStatusLabel(slot, booking)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 rounded-lg border border-dashed bg-white px-3 py-3 text-center text-xs text-zinc-500">
              На этот день пока нет слотов.
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <input
          type="hidden"
          name="instructor_id"
          value={selectedInstructorId}
          readOnly
        />
        <input type="hidden" name="date" value={selectedDate} readOnly />

        <div className="space-y-2">
          <Label htmlFor="lesson_type_id">Тип занятия</Label>
          <select
            id="lesson_type_id"
            name="lesson_type_id"
            className={selectClassName}
            required
            value={lessonTypeId}
            onChange={(event) => setLessonTypeId(event.target.value)}
          >
            {lessonTypes.length > 0 && (
              <option disabled value="">
                ── Активные типы из справочника ──
              </option>
            )}
            {lessonTypes.map((lessonType) => (
              <option key={lessonType.id} value={lessonType.id}>
                {lessonType.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a
              href="#lesson-types-settings"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              + Добавить свой
            </a>
            <span className="text-muted-foreground">·</span>
            <a
              href="#lesson-types-settings"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Управление типами
            </a>
          </div>
          {selectedLessonType && (
            <p className="text-muted-foreground text-xs">
              Длительность: {selectedLessonType.default_duration_minutes} мин.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="start_time">Начало</Label>
          <Input
            id="start_time"
            name="start_time"
            type="time"
            required
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
          {endTime && (
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <Clock3 className="size-3" />
              Окончание автоматически: {endTime}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="school_id">Автошкола / источник</Label>
          <select
            id="school_id"
            name="school_id"
            className={selectClassName}
            defaultValue=""
          >
            <option value="">Частное занятие / без автошколы</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>

        {selectedLessonType?.kind === "driving" && (
          <div className="space-y-2">
            <Label htmlFor="transmission">Коробка передач</Label>
            <select
              id="transmission"
              name="transmission"
              className={selectClassName}
              required
              defaultValue="automatic"
            >
              <option value="automatic">АКПП</option>
              <option value="manual">МКПП</option>
            </select>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="location_type">Формат занятия</Label>
          <select
            id="location_type"
            name="location_type"
            className={selectClassName}
            required
            defaultValue={selectedLessonType?.kind === "theory" ? "online" : "in_car"}
            key={selectedLessonType?.kind}
          >
            <option value="in_car">В автомобиле</option>
            <option value="online">Онлайн</option>
            <option value="classroom">В классе</option>
            <option value="other">Другое</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border bg-white px-3 py-3">
        <label className="flex items-start gap-3 text-sm font-medium">
          <input
            key={selectedDate}
            type="checkbox"
            name="publish_day"
            defaultChecked
            disabled={selectedDayPublished}
            className="mt-1 size-4"
          />
          <span>
            <span className="block">
              {selectedDayPublished
                ? "День уже опубликован"
                : "Опубликовать день в расписании"}
            </span>
            <span className="text-muted-foreground mt-0.5 block text-xs font-normal">
              {selectedDayPublished
                ? "Ученики уже видят свободные слоты этого дня."
                : "Ученики увидят свободные слоты выбранного дня. Снимите галочку, если готовите слот черновиком."}
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slot-note">Внутренняя заметка</Label>
        <Textarea
          id="slot-note"
          name="note"
          maxLength={500}
          placeholder="Например: оплата, рассчитали от 22.06, комментарий для себя"
        />
        <p className="text-muted-foreground text-xs">
          Видна только в админке и не показывается ученикам.
        </p>
      </div>

      {state.message && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </div>
      )}

      {!adminEnabled && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Для создания слотов добавьте служебный ключ проекта в настройки сервера.
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full sm:w-auto"
        disabled={
          isPending ||
          !adminEnabled ||
          instructors.length === 0 ||
          lessonTypes.length === 0
        }
      >
        <CalendarPlus />
        {isPending ? "Создаём…" : "Создать слот"}
      </Button>
    </form>
  );
}
