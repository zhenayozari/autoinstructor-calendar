"use client";

import { useActionState, useMemo, useState } from "react";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  CircleX,
  Eye,
  EyeOff,
  Pencil,
  StickyNote,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import {
  assignStudentToSlotAction,
  cancelBookingAction,
  deleteSelectedSlotsAction,
  deleteSlotAction,
  updateBookingCategoryAction,
  updateDayPublicationAction,
  updateSlotAction,
  type BookingCategoryActionState,
  type BulkSlotDeleteActionState,
  type PublicationActionState,
  type SlotActionState,
} from "@/app/admin/actions";
import { BookingPaymentForm } from "@/components/admin/pay-toggle-button";
import {
  bookingCategoryOptions,
  getBookingCategoryLabel,
} from "@/lib/booking-categories";
import {
  addUtcDays,
  formatDateTime,
  formatDateValue,
  formatDayTitle,
  formatTime,
  getTransmissionLabel,
  getUtcWeekStart,
  parseUtcDate,
  selectClassName,
} from "@/lib/formatters";
import { getVisibleSlotNote } from "@/lib/slot-notes";
import type {
  Booking,
  Instructor,
  LessonType,
  ScheduleDay,
  School,
  Slot,
  StudentAccess,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const locationLabels = {
  in_car: "В автомобиле",
  online: "Онлайн",
  classroom: "В классе",
  other: "Другое",
};

const INITIAL_BULK_DELETE_STATE: BulkSlotDeleteActionState = {
  status: "idle",
  message: "",
  deletedCount: 0,
};

const INITIAL_PUBLICATION_STATE: PublicationActionState = {
  status: "idle",
  message: "",
};

const INITIAL_SLOT_UPDATE_STATE: SlotActionState = {
  status: "idle",
  message: "",
};

const INITIAL_BOOKING_CATEGORY_STATE: BookingCategoryActionState = {
  status: "idle",
  message: "",
};

function getShortLessonName(name: string) {
  const normalized = name.toLocaleLowerCase("ru-RU");

  if (normalized.includes("omg")) return "OMG";
  if (normalized.includes("главн")) return "Главная";
  if (normalized.includes("подар")) return "Подарок";
  if (normalized.includes("доп")) return "Доп";

  return name.length > 12 ? `${name.slice(0, 11)}…` : name;
}

function formatMobileWeekday(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

function formatMobileDayNumber(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

function getPublicationStatus(day: ScheduleDay | undefined) {
  if (!day) {
    return {
      label: "День не создан",
      className: "bg-zinc-100 text-zinc-600",
      isPublished: false,
    };
  }

  if (!day.published_at) {
    return {
      label: "Черновик",
      className: "bg-zinc-100 text-zinc-700",
      isPublished: false,
    };
  }

  if (new Date(day.published_at) > new Date()) {
    return {
      label: "Запланирован",
      className: "bg-blue-100 text-blue-800",
      isPublished: false,
    };
  }

  return {
    label: "Опубликован",
    className: "bg-emerald-100 text-emerald-800",
    isPublished: true,
  };
}

function DayPublicationQuickAction({
  day,
}: {
  day: ScheduleDay | undefined;
}) {
  const [, formAction, isPending] = useActionState(
    updateDayPublicationAction,
    INITIAL_PUBLICATION_STATE,
  );

  if (!day) {
    return null;
  }

  const publicationStatus = getPublicationStatus(day);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="schedule_day_id" value={day.id} />
      <input
        type="hidden"
        name="publication_mode"
        value={publicationStatus.isPublished ? "hidden" : "now"}
      />
      <Button
        type="submit"
        size="sm"
        variant={publicationStatus.isPublished ? "outline" : "default"}
        className="h-8 px-2.5 text-xs"
        disabled={isPending}
      >
        {publicationStatus.isPublished ? <EyeOff /> : <Eye />}
        {publicationStatus.isPublished ? "Скрыть" : "Опубликовать"}
      </Button>
    </form>
  );
}

function SlotEditForm({
  slot,
  booking,
  scheduleDay,
  lessonType,
  lessonTypes,
  timezone,
  adminEnabled,
}: {
  slot: Slot;
  booking: Booking | null;
  scheduleDay: ScheduleDay | undefined;
  lessonType: LessonType;
  lessonTypes: LessonType[];
  schools: School[];
  timezone: string;
  adminEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateSlotAction,
    INITIAL_SLOT_UPDATE_STATE,
  );
  const activeLessonTypes = lessonTypes.filter(
    (candidate) => candidate.is_active !== false || candidate.id === slot.lesson_type_id,
  );
  const lessonTypeOptions =
    activeLessonTypes.some((candidate) => candidate.id === slot.lesson_type_id)
      ? activeLessonTypes
      : [lessonType, ...activeLessonTypes];
  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-white p-3">
      <input type="hidden" name="slot_id" value={slot.id} />

      {booking && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
          На этот слот записан ученик. Если меняете дату, время или тип занятия,
          предупредите ученика.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`edit-date-${slot.id}`}>Дата</Label>
          <Input
            id={`edit-date-${slot.id}`}
            name="date"
            type="date"
            defaultValue={scheduleDay?.date ?? ""}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`edit-time-${slot.id}`}>Начало</Label>
          <Input
            id={`edit-time-${slot.id}`}
            name="start_time"
            type="time"
            defaultValue={formatTime(slot.start_time, timezone)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`edit-type-${slot.id}`}>Тип занятия</Label>
          <select
            id={`edit-type-${slot.id}`}
            name="lesson_type_id"
            className={selectClassName}
            defaultValue={slot.lesson_type_id}
            required
          >
            {lessonTypeOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={`edit-location-${slot.id}`}>Формат</Label>
          <select
            id={`edit-location-${slot.id}`}
            name="location_type"
            className={selectClassName}
            defaultValue={slot.location_type}
            required
          >
            <option value="in_car">В автомобиле</option>
            <option value="online">Онлайн</option>
            <option value="classroom">В классе</option>
            <option value="other">Другое</option>
          </select>
        </div>
      </div>

      <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        Коробка дня не меняется:{" "}
        <span className="font-semibold">
          {getTransmissionLabel(scheduleDay?.transmission ?? null)}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`edit-note-${slot.id}`}>Заметка</Label>
        <Textarea
          id={`edit-note-${slot.id}`}
          name="note"
          defaultValue={slot.note ?? ""}
          maxLength={500}
        />
      </div>

      {state.message && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}

      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={isPending || !adminEnabled}
      >
        <Pencil />
        {isPending ? "Сохраняем…" : "Сохранить изменения"}
      </Button>
    </form>
  );
}

function AssignStudentToSlotForm({
  slot,
  lessonType,
  studentAccesses,
  adminEnabled,
}: {
  slot: Slot;
  lessonType: LessonType;
  studentAccesses: StudentAccess[];
  adminEnabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    assignStudentToSlotAction,
    INITIAL_SLOT_UPDATE_STATE,
  );
  const eligibleStudentAccesses = studentAccesses.filter(
    (access) =>
      access.instructor_id === slot.instructor_id &&
      access.is_active &&
      !access.is_archived &&
      access.lesson_type_ids.includes(slot.lesson_type_id),
  );

  if (slot.status !== "available") {
    return null;
  }

  return (
    <details className="group rounded-lg border border-emerald-200 bg-emerald-50/70">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-emerald-950">
        <span className="inline-flex items-center gap-1.5">
          <UserRound className="size-3.5" />
          Записать ученика
        </span>
        <ChevronRight className="size-3.5 text-emerald-700 transition-transform group-open:rotate-90" />
      </summary>
      <div className="space-y-2 border-t border-emerald-200 px-3 py-3">
        <p className="text-xs leading-5 text-emerald-900">
          Показываются активные ученики, которым доступен тип занятия:
          {" "}
          <span className="font-semibold">{lessonType.name}</span>.
        </p>

        {eligibleStudentAccesses.length > 0 ? (
          <form action={formAction} className="space-y-2">
            <input type="hidden" name="slot_id" value={slot.id} />
            <select
              name="student_access_id"
              className={selectClassName}
              defaultValue=""
              required
              disabled={!adminEnabled || isPending}
            >
              <option value="" disabled>
                Выберите ученика
              </option>
              {eligibleStudentAccesses.map((access) => (
                <option key={access.id} value={access.id}>
                  {access.display_label}
                  {access.login ? ` · ${access.login}` : ""}
                </option>
              ))}
            </select>

            {state.message && (
              <p
                className={`rounded-lg px-3 py-2 text-xs ${
                  state.status === "success"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-red-50 text-red-700"
                }`}
              >
                {state.message}
              </p>
            )}

            <Button
              type="submit"
              className="h-9 w-full"
              disabled={!adminEnabled || isPending}
            >
              <UserRound />
              {isPending ? "Записываем..." : "Записать в слот"}
            </Button>
          </form>
        ) : (
          <p className="rounded-lg bg-white/80 px-3 py-2 text-xs leading-5 text-zinc-600">
            Подходящих учеников пока нет. Проверьте доступ ученика и выбранные
            типы занятий на странице «Ученики».
          </p>
        )}
      </div>
    </details>
  );
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

function BookingCategoryForm({
  booking,
  disabled,
}: {
  booking: Booking;
  disabled: boolean;
}) {
  const [state, formAction, isPending] = useActionState(
    updateBookingCategoryAction,
    INITIAL_BOOKING_CATEGORY_STATE,
  );
  const currentCategory = booking.booking_category ?? "regular";

  return (
    <form action={formAction} className="space-y-2 rounded-lg border bg-white p-3">
      <input type="hidden" name="booking_id" value={booking.id} />
      <div className="space-y-1.5">
        <Label htmlFor={`booking-category-${booking.id}`}>
          Категория записи
        </Label>
        <select
          id={`booking-category-${booking.id}`}
          name="booking_category"
          className={selectClassName}
          defaultValue={currentCategory}
          disabled={disabled || isPending}
        >
          {bookingCategoryOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs leading-5 text-zinc-500">
        Это аналитика записи ученика, а не тип слота в расписании.
      </p>
      {state.message && (
        <p
          className={`rounded-lg px-3 py-2 text-xs ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}
      <Button
        type="submit"
        variant="outline"
        className="h-9 w-full text-xs"
        disabled={disabled || isPending}
      >
        {isPending ? "Сохраняем..." : "Сохранить категорию"}
      </Button>
    </form>
  );
}

function DesktopSlotCard({
  slot,
  lessonType,
  booking,
  timezone,
  onClick,
  selectionMode = false,
  selected = false,
  onSelectionChange,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  timezone: string;
  onClick: () => void;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
}) {
  const className = `max-h-28 w-full overflow-hidden rounded-xl border bg-white p-2 text-left shadow-sm transition hover:border-zinc-300 hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${
    selected ? "border-red-300 ring-2 ring-red-100" : ""
  }`;

  if (selectionMode) {
    return (
      <label className={`${className} block cursor-pointer`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelectionChange?.(event.target.checked)}
            className="size-4"
          />
          <span className="text-[10px] font-semibold text-zinc-500">
            выбрать
          </span>
        </div>
        <SlotCardContent
          slot={slot}
          lessonType={lessonType}
          booking={booking}
          timezone={timezone}
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={`Открыть слот ${formatTime(slot.start_time, timezone)}–${formatTime(slot.end_time, timezone)}`}
    >
      <SlotCardContent
        slot={slot}
        lessonType={lessonType}
        booking={booking}
        timezone={timezone}
      />
    </button>
  );
}

function SlotCardContent({
  slot,
  lessonType,
  booking,
  timezone,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  timezone: string;
}) {
  const isBlocked = slot.status === "blocked";

  return (
    <>
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

      <div className="mt-1 flex items-center gap-1.5">
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
        {booking?.is_paid && (
          <span className="rounded-full bg-emerald-100 px-1.5 py-0 text-[10px] font-semibold text-emerald-700">
            ₽✓
          </span>
        )}
      </div>

      {booking && (
        <p className="mt-1 flex items-center gap-1 truncate text-[11px] font-semibold leading-4 text-amber-950">
          <UserRound className="size-3 shrink-0" />
          {booking.student_label}
        </p>
      )}
    </>
  );
}

function DesktopSlotPanel({
  slot,
  lessonType,
  booking,
  scheduleDay,
  instructor,
  lessonTypes,
  schools,
  studentAccesses,
  adminEnabled,
  onClose,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  scheduleDay: ScheduleDay | undefined;
  instructor: Instructor;
  lessonTypes: LessonType[];
  schools: School[];
  studentAccesses: StudentAccess[];
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
          </div>

          {booking ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium text-amber-700">Ученик</p>
                  <p className="mt-1 flex items-center gap-2 font-semibold text-amber-950">
                    <UserRound className="size-4" />
                    {booking.student_label}
                  </p>
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    {getBookingCategoryLabel(booking.booking_category)}
                  </p>
                  <p className="mt-2 text-xs text-amber-800">
                    Запись создана:{" "}
                    {formatDateTime(booking.created_at, instructor.timezone)}
                  </p>
                </div>
              </div>
              {booking.is_paid && booking.paid_at && (
                <p className="mt-2 text-xs text-emerald-700">
                  Оплачено: {formatDateTime(booking.paid_at, instructor.timezone)}
                </p>
              )}
              <div className="mt-3">
                <BookingCategoryForm
                  booking={booking}
                  disabled={!adminEnabled}
                />
              </div>
              <div className="mt-3">
                <BookingPaymentForm
                  bookingId={booking.id}
                  priceAmount={booking.price_amount ?? null}
                  paidAmount={booking.paid_amount ?? null}
                  paymentNote={booking.payment_note ?? null}
                  isPaid={booking.is_paid ?? false}
                  disabled={!adminEnabled}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-800">
              На этот слот пока никто не записан.
            </div>
          )}

          {!booking && !isBlocked && (
            <AssignStudentToSlotForm
              slot={slot}
              lessonType={lessonType}
              studentAccesses={studentAccesses}
              adminEnabled={adminEnabled}
            />
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

          <details className="group rounded-xl border bg-zinc-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold">
              <span className="inline-flex items-center gap-2">
                <Pencil className="size-4" />
                Редактировать слот
              </span>
              <ChevronRight className="size-4 text-zinc-500 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t p-3">
              <SlotEditForm
                slot={slot}
                booking={booking}
                scheduleDay={scheduleDay}
                lessonType={lessonType}
                lessonTypes={lessonTypes}
                schools={schools}
                timezone={instructor.timezone}
                adminEnabled={adminEnabled}
              />
            </div>
          </details>
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
  scheduleDay,
  lessonTypes,
  schools,
  studentAccesses,
  timezone,
  adminEnabled,
  selectionMode = false,
  selected = false,
  onSelectionChange,
}: {
  slot: Slot;
  lessonType: LessonType;
  booking: Booking | null;
  scheduleDay: ScheduleDay | undefined;
  lessonTypes: LessonType[];
  schools: School[];
  studentAccesses: StudentAccess[];
  timezone: string;
  adminEnabled: boolean;
  selectionMode?: boolean;
  selected?: boolean;
  onSelectionChange?: (checked: boolean) => void;
}) {
  const isBlocked = slot.status === "blocked";
  const visibleNote = getVisibleSlotNote(slot.note);
  return (
    <details
      className={`group rounded-lg border bg-white ${
        selected ? "border-red-300 ring-2 ring-red-100" : ""
      }`}
    >
      <summary className="grid cursor-pointer list-none grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2">
        {selectionMode ? (
          <input
            type="checkbox"
            checked={selected}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onSelectionChange?.(event.target.checked)}
            className="size-4"
            aria-label="Выбрать слот"
          />
        ) : (
          <span className="hidden" />
        )}
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
          {booking && (
            <div>
              <p className="text-zinc-400">Категория</p>
              <p className="mt-0.5 font-semibold">
                {getBookingCategoryLabel(booking.booking_category)}
              </p>
            </div>
          )}
        </div>

        {booking && (
          <BookingCategoryForm booking={booking} disabled={!adminEnabled} />
        )}

        {booking && (
          <div className="space-y-2 rounded-lg border bg-white px-3 py-2">
            <p className="text-xs font-medium text-zinc-600">Оплата</p>
            <BookingPaymentForm
              bookingId={booking.id}
              priceAmount={booking.price_amount ?? null}
              paidAmount={booking.paid_amount ?? null}
              paymentNote={booking.payment_note ?? null}
              isPaid={booking.is_paid ?? false}
              disabled={!adminEnabled}
            />
          </div>
        )}

        {!booking && !isBlocked && (
          <AssignStudentToSlotForm
            slot={slot}
            lessonType={lessonType}
            studentAccesses={studentAccesses}
            adminEnabled={adminEnabled}
          />
        )}

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

        <details className="group rounded-lg border bg-zinc-50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold">
            <span className="inline-flex items-center gap-1.5">
              <Pencil className="size-3.5" />
              Редактировать
            </span>
            <ChevronRight className="size-3.5 text-zinc-500 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t p-2">
            <SlotEditForm
              slot={slot}
              booking={booking}
              scheduleDay={scheduleDay}
              lessonType={lessonType}
              lessonTypes={lessonTypes}
              schools={schools}
              timezone={timezone}
              adminEnabled={adminEnabled}
            />
          </div>
        </details>

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
  schools,
  scheduleDays,
  slots,
  bookings,
  studentAccesses,
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
  schools: School[];
  scheduleDays: ScheduleDay[];
  slots: Slot[];
  bookings: Booking[];
  studentAccesses: StudentAccess[];
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
  const [selectedMobileDate, setSelectedMobileDate] =
    useState(currentWeekDate);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [bulkDeleteState, bulkDeleteAction, isBulkDeletePending] = useActionState(
    async (
      previousState: BulkSlotDeleteActionState,
      formData: FormData,
    ) => {
      const result = await deleteSelectedSlotsAction(previousState, formData);

      if (result.status === "success") {
        setSelectedSlotIds([]);
        setSelectionMode(false);
        setSelectedSlotId(null);
      }

      return result;
    },
    INITIAL_BULK_DELETE_STATE,
  );
  const weekStart = getUtcWeekStart(weekDate);
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === instructorId,
  );
  const weekDates = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        formatDateValue(addUtcDays(weekStart, index)),
      ),
    [weekStart],
  );
  const mobileSelectedDate = weekDates.includes(selectedMobileDate)
    ? selectedMobileDate
    : (weekDates[0] ?? currentWeekDate);
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
  const visibleWeekSlotIds = useMemo(() => {
    const result: string[] = [];

    for (const date of weekDates) {
      const scheduleDay = daysByDate.get(date);
      if (!scheduleDay) continue;

      const daySlots = slotsByDayId.get(scheduleDay.id) ?? [];
      result.push(...daySlots.map((slot) => slot.id));
    }

    return result;
  }, [daysByDate, slotsByDayId, weekDates]);
  const selectedVisibleSlotIds = selectedSlotIds.filter((slotId) =>
    visibleWeekSlotIds.includes(slotId),
  );
  const allVisibleSlotsSelected =
    visibleWeekSlotIds.length > 0 &&
    visibleWeekSlotIds.every((slotId) => selectedVisibleSlotIds.includes(slotId));

  function handleWeekDateChange(value: string) {
    setSelectedSlotId(null);
    setSelectedSlotIds([]);
    setSelectionMode(false);
    setSelectedMobileDate(value);
    onWeekDateChange(value);
  }

  function handleInstructorChange(value: string) {
    setSelectedSlotId(null);
    setSelectedSlotIds([]);
    setSelectionMode(false);
    onInstructorChange(value);
  }

  function handleSlotSelectionChange(slotId: string, checked: boolean) {
    setSelectedSlotIds((current) => {
      if (checked) {
        return current.includes(slotId) ? current : [...current, slotId];
      }

      return current.filter((currentSlotId) => currentSlotId !== slotId);
    });
  }

  function handleSelectAllVisible(checked: boolean) {
    setSelectedSlotIds(checked ? visibleWeekSlotIds : []);
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

  const mobileSelectedDayData = getDayData(mobileSelectedDate);

  function renderBulkDeletePanel(compact = false) {
    return (
      <>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {!compact && (
            <div>
              <p className="text-sm font-semibold">Массовое удаление слотов</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Включите выбор, отметьте слоты галочками и удалите их разом.
              </p>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={selectionMode ? "default" : "outline"}
              disabled={!adminEnabled || visibleWeekSlotIds.length === 0}
              onClick={() => {
                setSelectionMode((current) => !current);
                setSelectedSlotId(null);
              }}
            >
              {selectionMode ? "Завершить выбор" : "Выбрать слоты"}
            </Button>
            {selectionMode && (
              <label className="inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allVisibleSlotsSelected}
                  onChange={(event) =>
                    handleSelectAllVisible(event.target.checked)
                  }
                  className="size-4"
                />
                Все на неделе
              </label>
            )}
          </div>
        </div>

        {selectionMode && (
          <form
            action={bulkDeleteAction}
            className="mt-3 flex flex-col gap-2 rounded-lg bg-zinc-50 p-3 sm:flex-row sm:items-center sm:justify-between"
            onSubmit={(event) => {
              if (selectedVisibleSlotIds.length === 0) {
                event.preventDefault();
                return;
              }

              if (
                !window.confirm(
                  `Удалить выбранные слоты навсегда? Количество: ${selectedVisibleSlotIds.length}. Записи учеников в этих слотах тоже будут удалены.`,
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            <div>
              <p className="text-sm font-semibold">
                Выбрано: {selectedVisibleSlotIds.length}
              </p>
              {bulkDeleteState.message && (
                <p
                  className={
                    bulkDeleteState.status === "success"
                      ? "mt-1 text-xs font-medium text-emerald-700"
                      : "mt-1 text-xs font-medium text-red-700"
                  }
                >
                  {bulkDeleteState.message}
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedVisibleSlotIds.map((slotId) => (
                <input key={slotId} type="hidden" name="slot_id" value={slotId} />
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={selectedVisibleSlotIds.length === 0 || isBulkDeletePending}
                onClick={() => setSelectedSlotIds([])}
              >
                Снять выбор
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={
                  selectedVisibleSlotIds.length === 0 ||
                  isBulkDeletePending ||
                  !adminEnabled
                }
              >
                <Trash2 />
                {isBulkDeletePending ? "Удаляем…" : "Удалить выбранные"}
              </Button>
            </div>
          </form>
        )}
      </>
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
        ) : null}

        <div className="grid grid-cols-3 gap-2 xl:ml-auto">
          <Button
            type="button"
            variant="outline"
            className="h-9 px-2 text-xs sm:h-10 sm:px-3 sm:text-sm"
            onClick={() =>
              handleWeekDateChange(formatDateValue(addUtcDays(weekStart, -7)))
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
              handleWeekDateChange(formatDateValue(addUtcDays(weekStart, 7)))
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

      <div className="hidden rounded-xl border bg-white p-3 shadow-sm lg:block">
        {renderBulkDeletePanel()}
      </div>

      <details className="group rounded-xl border bg-white shadow-sm lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Выбор слотов</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              Массовое удаление, если нужно
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
              {selectedVisibleSlotIds.length > 0
                ? `выбрано ${selectedVisibleSlotIds.length}`
                : `${visibleWeekSlotIds.length} сл.`}
            </span>
            <ChevronRight className="size-4 text-zinc-500 transition-transform group-open:rotate-90" />
          </div>
        </summary>
        <div className="border-t px-3 py-3">
          <p className="text-muted-foreground mb-3 text-xs">
            Включите выбор, отметьте слоты галочками и удалите их разом.
          </p>
          {renderBulkDeletePanel(true)}
        </div>
      </details>

      <div className="space-y-3 lg:hidden">
        <div className="grid grid-cols-7 gap-1.5 rounded-2xl bg-white p-2 shadow-sm">
          {weekDates.map((date) => {
            const { daySlots, occupiedCount, freeCount } = getDayData(date);
            const isSelected = mobileSelectedDate === date;

            return (
              <button
                key={date}
                type="button"
                className={`min-h-16 rounded-xl border px-1 py-2 text-center transition ${
                  isSelected
                    ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                    : "bg-white hover:border-zinc-400"
                }`}
                onClick={() => setSelectedMobileDate(date)}
              >
                <span className="block text-[10px] font-medium uppercase opacity-70">
                  {formatMobileWeekday(date)}
                </span>
                <span className="mt-1 block text-lg font-bold leading-none">
                  {formatMobileDayNumber(date)}
                </span>
                <span className="mt-1 block text-[10px] leading-3 opacity-75">
                  {daySlots.length === 0
                    ? "пусто"
                    : occupiedCount > 0
                      ? `${occupiedCount}/${daySlots.length}`
                      : `${freeCount} св.`}
                </span>
              </button>
            );
          })}
        </div>

        <section className="rounded-xl bg-zinc-50 p-2.5">
          <div className="mb-2.5 flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold capitalize">
                {formatDayTitle(mobileSelectedDate)}
              </h3>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">
                  {mobileSelectedDayData.scheduleDay
                    ? getTransmissionLabel(
                        mobileSelectedDayData.scheduleDay.transmission,
                      )
                    : "День не создан"}
                </span>
                <Badge
                  className={`px-2 py-0.5 text-[10px] ${getPublicationStatus(mobileSelectedDayData.scheduleDay).className}`}
                >
                  {getPublicationStatus(mobileSelectedDayData.scheduleDay).label}
                </Badge>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="text-right text-[11px] leading-4 text-zinc-500">
                <p>{mobileSelectedDayData.daySlots.length} слотов</p>
                <p>
                  <span className="text-amber-700">
                    {mobileSelectedDayData.occupiedCount} занято
                  </span>
                  {" · "}
                  <span className="text-emerald-700">
                    {mobileSelectedDayData.freeCount} свободно
                  </span>
                  {mobileSelectedDayData.blockedCount > 0 &&
                    ` · ${mobileSelectedDayData.blockedCount} блок`}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <DayPublicationQuickAction
                  day={mobileSelectedDayData.scheduleDay}
                />
                {onCreateSlotForDate && (
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="shrink-0 rounded-full bg-white"
                    aria-label={`Добавить слот на ${formatDayTitle(mobileSelectedDate)}`}
                    onClick={() => onCreateSlotForDate(mobileSelectedDate)}
                  >
                    <CalendarPlus />
                  </Button>
                )}
              </div>
            </div>
          </div>

          {mobileSelectedDayData.scheduleDay &&
          mobileSelectedDayData.daySlots.length > 0 &&
          selectedInstructor ? (
            <div className="space-y-1.5">
              {mobileSelectedDayData.daySlots.map((slot) => {
                const lessonType = lessonTypesById.get(slot.lesson_type_id);
                if (!lessonType) return null;

                return (
                  <MobileSlotRow
                    key={slot.id}
                    slot={slot}
                    lessonType={lessonType}
                    booking={bookingsBySlotId.get(slot.id) ?? null}
                    scheduleDay={mobileSelectedDayData.scheduleDay}
                    lessonTypes={lessonTypes}
                    schools={schools}
                    studentAccesses={studentAccesses}
                    timezone={selectedInstructor.timezone}
                    adminEnabled={adminEnabled}
                    selectionMode={selectionMode}
                    selected={selectedSlotIds.includes(slot.id)}
                    onSelectionChange={(checked) =>
                      handleSlotSelectionChange(slot.id, checked)
                    }
                  />
                );
              })}
            </div>
          ) : (
            renderEmptyDay(mobileSelectedDate)
          )}
        </section>
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
                        selectionMode={selectionMode}
                        selected={selectedSlotIds.includes(slot.id)}
                        onSelectionChange={(checked) =>
                          handleSlotSelectionChange(slot.id, checked)
                        }
                        onClick={() => {
                          if (selectionMode) {
                            handleSlotSelectionChange(
                              slot.id,
                              !selectedSlotIds.includes(slot.id),
                            );
                            return;
                          }

                          setSelectedSlotId(slot.id);
                        }}
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
            lessonTypes={lessonTypes}
            schools={schools}
            studentAccesses={studentAccesses}
            adminEnabled={adminEnabled}
            onClose={() => setSelectedSlotId(null)}
          />
        )}
    </div>
  );
}
