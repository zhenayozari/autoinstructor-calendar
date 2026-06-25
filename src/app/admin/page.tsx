import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  KeyRound,
  LogOut,
  Settings,
  UserRound,
  UserRoundPen,
  UsersRound,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { getVisibleSlotNote } from "@/lib/slot-notes";
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

type DashboardSlot = Slot & {
  lessonType: LessonType | null;
  scheduleDay: ScheduleDay | null;
  booking: Booking | null;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function getLocalDate(timezone: string, offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
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

function getRoleLabel(role: string) {
  if (role === "owner") return "Владелец";
  if (role === "admin") return "Администратор";
  if (role === "instructor") return "Инструктор";
  return role;
}

function SlotRow({
  slot,
  timezone,
  compact = false,
}: {
  slot: DashboardSlot;
  timezone: string;
  compact?: boolean;
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
        <Badge className={getStatusClassName(slot)}>
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
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <UserRound className="size-4" />
            {slot.booking.student_label}
          </p>
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

  let instructorQuery = supabase
    .from("instructors")
    .select("id, name, slug, public_name, timezone")
    .eq("organization_id", membership.organizationId)
    .eq("is_active", true)
    .order("name");

  if (membership.isInstructor && membership.instructorId) {
    instructorQuery = instructorQuery.eq("id", membership.instructorId);
  }

  const { data: instructorData, error: instructorError } =
    await instructorQuery;
  const instructors = (instructorData ?? []) as Instructor[];
  const selectedInstructorId =
    membership.isOwnerOrAdmin && params.instructor
      ? params.instructor
      : membership.instructorId;
  const selectedInstructor =
    instructors.find((instructor) => instructor.id === selectedInstructorId) ??
    instructors[0] ??
    null;
  const allowedInstructorIds = selectedInstructor
    ? [selectedInstructor.id]
    : [];
  const timezone = selectedInstructor?.timezone ?? "Asia/Irkutsk";
  const today = getLocalDate(timezone);
  const tomorrow = getLocalDate(timezone, 1);

  const [
    { data: scheduleDayData, error: scheduleDayError },
    { data: lessonTypeData, error: lessonTypeError },
  ] = await Promise.all([
    allowedInstructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission")
          .in("instructor_id", allowedInstructorIds)
          .in("date", [today, tomorrow])
      : Promise.resolve({ data: [], error: null }),
    supabase.from("lesson_types").select("id, name, color"),
  ]);

  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);
  const { data: slotData, error: slotError } =
    scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, start_time, end_time, location_type, status, note",
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
          .select("id, slot_id, student_label, created_at")
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };

  const loadError =
    instructorError ??
    scheduleDayError ??
    lessonTypeError ??
    slotError ??
    bookingError;
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const bookings = (bookingData ?? []) as Booking[];
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const scheduleDaysById = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay]),
  );
  const bookingsBySlotId = new Map(
    bookings.map((booking) => [booking.slot_id, booking]),
  );
  const dashboardSlots: DashboardSlot[] = slots
    .map((slot) => ({
      ...slot,
      lessonType: lessonTypesById.get(slot.lesson_type_id) ?? null,
      scheduleDay: scheduleDaysById.get(slot.schedule_day_id) ?? null,
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

  return (
    <main className="min-h-screen bg-zinc-100 px-3 pb-24 pt-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-3 sm:space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Рабочий экран
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Сегодня
              </h1>
            </div>

            <div className="min-w-0 rounded-full border bg-zinc-50 px-3 py-2 text-right text-[11px] leading-4 text-zinc-500 sm:text-xs">
              <span className="block font-semibold text-zinc-900">
                {getRoleLabel(membership.role)}
              </span>
              <span className="block max-w-[150px] truncate sm:max-w-[240px]">
                {membership.user.email}
              </span>
            </div>
          </div>
        </header>

        <details className="group rounded-2xl border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="font-semibold">Навигация и инструктор</p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs sm:text-sm">
                {selectedInstructor
                  ? `${selectedInstructor.public_name ?? selectedInstructor.name} / ${selectedInstructor.slug}`
                  : "Инструктор не выбран"}
              </p>
            </div>
            <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>

          <div className="space-y-4 border-t px-4 py-4 sm:px-5">
            {membership.isOwnerOrAdmin && instructors.length > 0 && (
              <form className="flex flex-col gap-3 sm:flex-row">
                <select
                  name="instructor"
                  className={selectClassName}
                  defaultValue={selectedInstructor?.id}
                >
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.public_name ?? instructor.name} /{" "}
                      {instructor.slug}
                    </option>
                  ))}
                </select>
                <Button type="submit" className="h-10">
                  Показать
                </Button>
              </form>
            )}

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/schedule" />}
              >
                <ExternalLink />
                Календарь
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/admin/schedule" />}
              >
                <CalendarDays />
                Расписание
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/admin/bookings" />}
              >
                <ClipboardList />
                Записи
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={<Link href="/admin/settings" />}
              >
                <Settings />
                Настройки
              </Button>
              <Button
                variant="outline"
                className="h-10"
                nativeButton={false}
                render={
                  <Link
                    href={
                      selectedInstructor
                        ? `/admin/profile?instructor=${selectedInstructor.id}`
                        : "/admin/profile"
                    }
                  />
                }
              >
                <UserRoundPen />
                Профиль
              </Button>
              {membership.isOwnerOrAdmin && (
                <Button
                  variant="outline"
                  className="h-10"
                  nativeButton={false}
                  render={<Link href="/admin/team" />}
                >
                  <UsersRound />
                  Команда
                </Button>
              )}
              <form action={logoutAction}>
                <Button type="submit" variant="outline" className="h-10 w-full">
                  <LogOut />
                  Выйти
                </Button>
              </form>
            </div>
          </div>
        </details>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
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
                    Самое важное для быстрого взгляда с телефона.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {nextSlot ? (
                    <SlotRow slot={nextSlot} timezone={timezone} />
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
                    render={<Link href="/admin/bookings" />}
                    className="h-11 justify-start"
                  >
                    <ClipboardList />
                    Список записей
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

      <nav
        aria-label="Быстрые действия"
        className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-2xl border bg-white/95 p-1.5 shadow-2xl shadow-zinc-950/15 backdrop-blur sm:hidden"
      >
        <Link
          href="/admin/schedule?create=slot#schedule-quick-actions"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <CalendarPlus className="size-4" />
          <span>Слот</span>
        </Link>
        <Link
          href="/admin/schedule"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <CalendarDays className="size-4" />
          <span>Неделя</span>
        </Link>
        <Link
          href="/admin/bookings"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <ClipboardList className="size-4" />
          <span>Записи</span>
        </Link>
        <Link
          href="/admin/settings"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <KeyRound className="size-4" />
          <span>Код</span>
        </Link>
      </nav>
    </main>
  );
}
