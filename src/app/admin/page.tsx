import Link from "next/link";
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  KeyRound,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  formatDate,
  formatMoney,
  formatTime,
  getLocalDate,
  getTransmissionLabel,
} from "@/lib/formatters";
import {
  buildActiveInstructorsQuery,
  getSelectedInstructor,
  getSelectedInstructorId,
} from "@/lib/queries";

import { createClient } from "@/lib/supabase/server";
import { getVisibleSlotNote } from "@/lib/slot-notes";
import type { Booking, Instructor, LessonType, ScheduleDay, School, Slot } from "@/lib/types";
import { LessonStateControls } from "@/components/admin/lesson-state-controls";
import {
  BookingPaymentForm,
} from "@/components/admin/pay-toggle-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";


export const dynamic = "force-dynamic";

type AdminPageProps = {
  searchParams?: Promise<{
    instructor?: string;
  }>;
};

type DashboardSlot = Slot & {
  lessonType: LessonType | null;
  scheduleDay: ScheduleDay | null;
  school: School | null;
  booking: Booking | null;
};

function getStatusLabel(slot: DashboardSlot) {
  if (slot.status === "blocked") return "Заблокирован";
  if (slot.booking) return "Занят";
  return "Свободен";
}

function getStatusClassName(slot: DashboardSlot) {
  if (slot.status === "blocked") return "bg-zinc-200 text-zinc-700";
  if (slot.booking) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

function getDashboardLessonStateLabel(lessonState: Booking["lesson_state"]) {
  if (lessonState === "completed") return "Проведено";
  if (lessonState === "no_show") return "Неявка";
  return "План";
}

function SlotRow({
  slot,
  timezone,
  compact = false,
  adminEnabled = false,
}: {
  slot: DashboardSlot;
  timezone: string;
  compact?: boolean;
  adminEnabled?: boolean;
}) {
  const note = getVisibleSlotNote(slot.note);

  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-bold tabular-nums text-zinc-950">
            {formatTime(slot.start_time, timezone)}
            <span className="mx-1.5 text-zinc-300">–</span>
            {formatTime(slot.end_time, timezone)}
          </p>
          <div className="mt-1 flex min-w-0 items-center gap-2">
            <span
              className="size-2.5 shrink-0 rounded-full border border-black/10"
              style={{
                backgroundColor: slot.lessonType?.color ?? "#d4d4d8",
              }}
            />
            <p className="truncate text-sm font-semibold">
              {slot.lessonType?.name ?? "Тип занятия не найден"}
            </p>
          </div>
        </div>
        <Badge
          className={getStatusClassName(slot)}
          title={
            slot.booking
              ? getDashboardLessonStateLabel(slot.booking.lesson_state)
              : undefined
          }
        >
          {getStatusLabel(slot)}
        </Badge>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
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
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
              <UserRound className="size-4" />
              {slot.booking.student_label}
            </p>
          </div>
          {slot.booking.price_amount !== null && slot.booking.price_amount !== undefined && (
            <p className="mt-1.5 text-xs font-semibold text-amber-900">
              К оплате: {formatMoney(slot.booking.price_amount)}
              {" · "}
              Получено: {formatMoney(slot.booking.paid_amount ?? 0)}
            </p>
          )}
          {slot.booking.is_paid && slot.booking.paid_at && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-700">
              <CheckCircle2 className="size-3" />
              Оплачено {formatTime(slot.booking.paid_at, timezone)}
            </p>
          )}
          <div className="mt-2">
            <LessonStateControls
              bookingId={slot.booking.id}
              lessonState={slot.booking.lesson_state}
              instructorNote={slot.booking.instructor_note}
              disabled={!adminEnabled}
            />
          </div>
          <details className="mt-2 rounded-xl border border-amber-200 bg-white/70">
            <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-amber-950">
              Оплата
            </summary>
            <div className="border-t border-amber-100 p-2">
              <BookingPaymentForm
                bookingId={slot.booking.id}
                priceAmount={slot.booking.price_amount ?? null}
                paidAmount={slot.booking.paid_amount ?? null}
                paymentNote={slot.booking.payment_note ?? null}
                isPaid={slot.booking.is_paid}
                disabled={!adminEnabled}
              />
            </div>
          </details>
        </div>
      )}

      {!compact && note && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-900">
          {note}
        </div>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white px-4 py-8 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name, timezone",
    );
  const instructors = (instructorData ?? []) as Instructor[];
  const selectedInstructorId = getSelectedInstructorId(
    membership,
    params.instructor,
  );
  const selectedInstructor = getSelectedInstructor(
    instructors,
    selectedInstructorId,
  );
  const allowedInstructorIds = selectedInstructor
    ? [selectedInstructor.id]
    : [];
  const timezone = selectedInstructor?.timezone ?? "Asia/Irkutsk";
  const today = getLocalDate(timezone);
  const tomorrow = getLocalDate(timezone, 1);

  const [
    { data: scheduleDayData, error: scheduleDayError },
    { data: lessonTypeData, error: lessonTypeError },
    { data: schoolData, error: schoolError },
  ] = await Promise.all([
    allowedInstructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission")
          .in("instructor_id", allowedInstructorIds)
          .in("date", [today, tomorrow])
      : Promise.resolve({ data: [], error: null }),
    supabase.from("lesson_types").select("id, name, color"),
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
  ]);

  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);
  const { data: slotData, error: slotError } =
    scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, school_id, start_time, end_time, location_type, status, note",
          )
          .in("schedule_day_id", scheduleDayIds)
          .neq("status", "cancelled")
          .order("start_time")
      : { data: [], error: null };
  const slots = (slotData ?? []) as Slot[];
  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    adminEnabled && slotIds.length > 0
      ? await supabase
          .from("bookings")
                .select("id, slot_id, student_label, student_access_id, created_at, price_amount, paid_amount, is_paid, paid_at, payment_note, lesson_state, completed_at, instructor_note")
                .in("slot_id", slotIds)
                .eq("status", "confirmed")
            : { data: [], error: null };

  // Augment bookings with payment fields (select includes them)
  const loadError =
    instructorError ??
    scheduleDayError ??
    lessonTypeError ??
    schoolError ??
    slotError ??
    bookingError;
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const schools = (schoolData ?? []) as School[];
  const bookings = (bookingData ?? []) as Booking[];
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const scheduleDaysById = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay]),
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const bookingsBySlotId = new Map(
    bookings.map((booking) => [booking.slot_id, booking]),
  );
  const dashboardSlots: DashboardSlot[] = slots
    .map((slot) => ({
      ...slot,
      lessonType: lessonTypesById.get(slot.lesson_type_id) ?? null,
      scheduleDay: scheduleDaysById.get(slot.schedule_day_id) ?? null,
      school: slot.school_id ? schoolsById.get(slot.school_id) ?? null : null,
      booking: bookingsBySlotId.get(slot.id) ?? null,
    }))
    .sort(
      (first, second) =>
        new Date(first.start_time).getTime() -
        new Date(second.start_time).getTime(),
    );
  const now = new Date();
  const todaySlots = dashboardSlots.filter(
    (slot) => slot.scheduleDay?.date === today,
  );
  const tomorrowSlots = dashboardSlots.filter(
    (slot) => slot.scheduleDay?.date === tomorrow,
  );
  const upcomingSlots = [
    ...todaySlots.filter((slot) => new Date(slot.end_time) >= now),
    ...tomorrowSlots,
  ];
  const nextSlot =
    upcomingSlots.find((slot) => slot.booking) ??
    upcomingSlots[0] ??
    todaySlots[0] ??
    null;
  const nextBookings = dashboardSlots
    .filter((slot) => slot.booking && new Date(slot.end_time) >= now)
    .slice(0, 5);
  const todayCompletedSlots = todaySlots.filter(
    (slot) => slot.booking?.lesson_state === "completed",
  );
  const todayEarnedAmount = todayCompletedSlots.reduce(
    (sum, slot) => sum + (slot.booking?.price_amount ?? 0),
    0,
  );
  const todayPaidAmount = todayCompletedSlots
    .reduce((sum, slot) => sum + (slot.booking?.paid_amount ?? 0), 0);
  const todayDebtSlots = todayCompletedSlots.filter(
    (slot) => !slot.booking?.is_paid,
  );
  const todayDebtAmount = Math.max(todayEarnedAmount - todayPaidAmount, 0);

      return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Рабочий экран
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Сегодня
            </h1>
          </div>
        </header>



                {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        {selectedInstructor && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="font-semibold text-zinc-950">
                Сегодня: {todaySlots.length}{" "}
                {todaySlots.length === 1 ? "занятие" : todaySlots.length >= 2 && todaySlots.length <= 4 ? "занятия" : "занятий"}
              </span>
              <span className="text-zinc-500">
                {todaySlots.filter((s) => !s.booking).length} свободных
              </span>
              <span className="text-zinc-500">
                {todaySlots.filter((s) => s.booking).length} записано
              </span>
              <span className="text-emerald-600 font-medium">
                {todaySlots.filter((s) => s.booking?.is_paid).length} оплачено
              </span>
            </div>
            <Button
              nativeButton={false}
              render={
                <Link href="/admin/schedule?create=slot#schedule-quick-actions" />
              }
              className="h-9"
            >
              <CalendarPlus className="size-4" />
              Добавить слот
            </Button>
          </div>
        )}

        {selectedInstructor && (
          <section className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium text-zinc-500">Проведено сегодня</p>
              <p className="mt-1 text-xl font-semibold text-zinc-950">
                {todayCompletedSlots.length}
              </p>
            </div>
            <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
              <p className="text-xs font-medium text-zinc-500">Заработано / получено</p>
              <p className="mt-1 text-xl font-semibold text-zinc-950">
                {formatMoney(todayEarnedAmount)} / {formatMoney(todayPaidAmount)}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm">
              <p className="text-xs font-medium text-amber-700">Долг сегодня</p>
              <p className="mt-1 text-xl font-semibold text-amber-950">
                {formatMoney(todayDebtAmount)}
              </p>
              <p className="mt-0.5 text-xs text-amber-700">
                {todayDebtSlots.length} занятий
              </p>
            </div>
          </section>
        )}

        {!selectedInstructor ? (
          <EmptyState>Нет активного инструктора для отображения.</EmptyState>
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <Card className="border-2 border-zinc-900">
                <CardHeader className="pb-3">
                  <CardTitle>Кто следующий?</CardTitle>
                  <CardDescription>
                    {nextSlot?.scheduleDay
                      ? `Следующая запись: ${formatDate(nextSlot.scheduleDay.date)}.`
                      : "Самое важное для быстрого взгляда с телефона."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                                    {nextSlot ? (
                    <SlotRow slot={nextSlot} timezone={timezone} adminEnabled={adminEnabled} />
                  ) : (
                    <EmptyState>
                      На сегодня и завтра ближайших занятий нет.
                    </EmptyState>
                  )}
                </CardContent>
              </Card>

              <Card className="hidden sm:block">
                <CardHeader className="pb-3">
                  <CardTitle>Быстрые действия</CardTitle>
                  <CardDescription>
                    Создание расписания вынесено в отдельный раздел.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Button
                    nativeButton={false}
                    render={
                      <Link href="/admin/schedule?create=slot#schedule-quick-actions" />
                    }
                    className="h-11 justify-start"
                  >
                    <CalendarPlus />
                    Создать слот
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/admin/schedule" />}
                    className="h-11 justify-start"
                  >
                    <CalendarDays />
                    Открыть неделю
                  </Button>
                  
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/admin/reports" />}
                    className="h-11 justify-start"
                  >
                    <BarChart3 />
                    Итоги и деньги
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/admin/students" />}
                    className="h-11 justify-start"
                  >
                    <UserRoundCheck />
                    Ученики и доступы
                  </Button>
                  <Button
                    variant="outline"
                    nativeButton={false}
                    render={<Link href="/admin/settings" />}
                    className="h-11 justify-start"
                  >
                    <KeyRound />
                    Кодовое слово
                  </Button>
                </CardContent>
              </Card>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card className="border-l-4 border-l-emerald-400 bg-emerald-50/30">
                <CardHeader className="pb-3">
                  <CardTitle>Сегодня · {formatDate(today)}</CardTitle>
                  <CardDescription>
                    {todaySlots.length} слотов,{" "}
                    {todaySlots.filter((slot) => slot.booking).length} занято.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                                    {todaySlots.length > 0 ? (
                    todaySlots.map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        timezone={timezone}
                        compact
                        adminEnabled={adminEnabled}
                      />
                    ))
                  ) : (
                    <EmptyState>На сегодня занятий нет.</EmptyState>
                  )}
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-400 bg-blue-50/30">
                <CardHeader className="pb-3">
                  <CardTitle>Завтра · {formatDate(tomorrow)}</CardTitle>
                  <CardDescription>
                    Краткий список, чтобы понимать следующий день.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                                    {tomorrowSlots.length > 0 ? (
                    tomorrowSlots.slice(0, 5).map((slot) => (
                      <SlotRow
                        key={slot.id}
                        slot={slot}
                        timezone={timezone}
                        compact
                        adminEnabled={adminEnabled}
                      />
                    ))
                  ) : (
                    <EmptyState>На завтра занятий нет.</EmptyState>
                  )}
                  {tomorrowSlots.length > 5 && (
                    <Button
                      variant="outline"
                      nativeButton={false}
                      render={<Link href="/admin/schedule" />}
                      className="w-full"
                    >
                      Показать всю неделю
                    </Button>
                  )}
                </CardContent>
              </Card>
            </section>

            <Card className="border-l-4 border-l-amber-400 bg-amber-50/30">
              <CardHeader className="pb-3">
                <CardTitle>Ближайшие записи</CardTitle>
                <CardDescription>
                  3–5 ближайших учеников без лишней прокрутки.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {nextBookings.length > 0 ? (
                                    nextBookings.map((slot) => (
                    <SlotRow
                      key={slot.id}
                      slot={slot}
                      timezone={timezone}
                      compact
                      adminEnabled={adminEnabled}
                    />
                  ))
                ) : (
                  <EmptyState>Ближайших активных записей нет.</EmptyState>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

