import Link from "next/link";
import {
  CalendarDays,
  ChevronDown,
  CircleX,
  ClipboardList,
  ExternalLink,
  Home,
  LogOut,
  Settings,
  Trash2,
  UserRound,
  UserRoundPen,
  UsersRound,
} from "lucide-react";
import { cancelBookingAction, deleteSlotAction } from "@/app/admin/actions";
import { logoutAction } from "@/app/login/actions";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { AdminScheduleWorkspace } from "@/components/admin/admin-schedule-workspace";
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

type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
  timezone: string;
};

type LessonType = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  kind: "driving" | "theory";
  requires_vehicle: boolean;
  default_duration_minutes: number;
  tags: string[];
  sort_order: number;
  is_active: boolean;
};

type ScheduleDay = {
  id: string;
  instructor_id: string;
  date: string;
  transmission: "automatic" | "manual" | null;
  published_at: string | null;
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

function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export default async function AdminSchedulePage() {
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
  const initialInstructorId =
    membership.instructorId &&
    instructors.some(
      (instructor) => instructor.id === membership.instructorId,
    )
      ? membership.instructorId
      : "";
  const linkedInstructor = instructors.find(
    (instructor) => instructor.id === initialInstructorId,
  );
  const instructorIds = instructors.map((instructor) => instructor.id);
  const [
    { data: lessonTypeData, error: lessonTypeError },
    { data: scheduleDayData, error: scheduleDayError },
    { data: slotData, error: slotError },
  ] = await Promise.all([
    supabase
      .from("lesson_types")
      .select(
        "id, code, name, description, color, kind, requires_vehicle, default_duration_minutes, tags, sort_order, is_active",
      )
      .order("sort_order")
      .order("name"),
    instructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission, published_at")
          .in("instructor_id", instructorIds)
          .order("date", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    instructorIds.length > 0
      ? supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, start_time, end_time, location_type, status, note",
          )
          .in("instructor_id", instructorIds)
          .neq("status", "cancelled")
          .order("start_time", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

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
    lessonTypeError ??
    scheduleDayError ??
    slotError ??
    bookingError;
  const lessonTypeCatalog = (lessonTypeData ?? []) as LessonType[];
  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const bookings = (bookingData ?? []) as Booking[];
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const lessonTypesById = new Map(
    lessonTypeCatalog.map((lessonType) => [lessonType.id, lessonType]),
  );
  const scheduleDaysById = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay]),
  );
  const bookingsBySlotId = new Map(
    bookings.map((booking) => [booking.slot_id, booking]),
  );
  const slotCountsByScheduleDay = new Map<string, number>();

  for (const slot of slots) {
    slotCountsByScheduleDay.set(
      slot.schedule_day_id,
      (slotCountsByScheduleDay.get(slot.schedule_day_id) ?? 0) + 1,
    );
  }

  const defaultWeekDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Irkutsk",
  }).format(new Date());

  return (
    <main className="min-h-screen bg-zinc-100 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-5">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-muted-foreground text-sm font-medium">
                Планирование
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Расписание
              </h1>
              <p className="text-muted-foreground mt-2 max-w-2xl text-sm">
                Полная неделя, создание слотов, копирование и публикация. Для
                быстрого рабочего дня используйте главный экран.
              </p>
            </div>

            <div className="min-w-0 rounded-full border bg-zinc-50 px-3 py-2 text-right text-[11px] leading-4 text-zinc-500 sm:text-xs">
              <span className="block font-semibold text-zinc-900">
                {membership.role}
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
              <p className="font-semibold">Навигация</p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs sm:text-sm">
                {linkedInstructor
                  ? `${linkedInstructor.public_name ?? linkedInstructor.name} / ${linkedInstructor.slug}`
                  : "Профиль выбирается в календаре ниже"}
              </p>
            </div>
            <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>

          <div className="grid grid-cols-2 gap-2 border-t px-4 py-4 sm:flex sm:flex-wrap sm:px-5">
            <Button
              variant="outline"
              className="h-10"
              nativeButton={false}
              render={<Link href="/admin" />}
            >
              <Home />
              Главная
            </Button>
            <Button
              variant="outline"
              className="h-10"
              nativeButton={false}
              render={<Link href="/schedule" />}
            >
              <ExternalLink />
              Публичный календарь
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
                    initialInstructorId
                      ? `/admin/profile?instructor=${initialInstructorId}`
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
        </details>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <AdminScheduleWorkspace
          instructors={instructors}
          lessonTypes={lessonTypeCatalog}
          scheduleDays={scheduleDays.map((day) => ({
            ...day,
            slot_count: slotCountsByScheduleDay.get(day.id) ?? 0,
          }))}
          slots={slots}
          bookings={bookings}
          defaultWeekDate={defaultWeekDate}
          initialInstructorId={initialInstructorId}
          canSelectInstructor={membership.isOwnerOrAdmin}
          adminEnabled={adminEnabled}
        />

        <details className="group rounded-2xl border bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 sm:px-6">
            <div>
              <p className="font-semibold">Технический список слотов</p>
              <p className="text-muted-foreground mt-0.5 text-sm">
                Запасной режим со всеми слотами и действиями.
              </p>
            </div>
            <ChevronDown className="text-muted-foreground size-5 shrink-0 transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-4 sm:p-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-zinc-100">
                    <CalendarDays className="size-5" />
                  </div>
                  <div>
                    <CardTitle>Все существующие слоты</CardTitle>
                    <CardDescription>
                      {slots.length} в расписании
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {slots.length === 0 ? (
                  <div className="rounded-xl border border-dashed px-5 py-10 text-center">
                    <p className="font-medium">Слотов пока нет</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {slots.map((slot) => {
                      const instructor = instructorsById.get(
                        slot.instructor_id,
                      );
                      const lessonType = lessonTypesById.get(
                        slot.lesson_type_id,
                      );
                      const scheduleDay = scheduleDaysById.get(
                        slot.schedule_day_id,
                      );
                      const booking = bookingsBySlotId.get(slot.id);

                      if (!instructor || !lessonType || !scheduleDay) {
                        return null;
                      }

                      return (
                        <div
                          key={slot.id}
                          className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <span
                              className="mt-1 size-3 shrink-0 rounded-full"
                              style={{ backgroundColor: lessonType.color }}
                            />
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">
                                  {lessonType.name}
                                </p>
                                <Badge
                                  className={
                                    booking
                                      ? "bg-amber-100 text-amber-800"
                                      : "bg-emerald-100 text-emerald-800"
                                  }
                                >
                                  {booking ? "Занят" : "Свободен"}
                                </Badge>
                              </div>
                              <p className="text-muted-foreground mt-1 text-sm">
                                {formatDate(scheduleDay.date)},{" "}
                                {formatTime(
                                  slot.start_time,
                                  instructor.timezone,
                                )}{" "}
                                —{" "}
                                {formatTime(
                                  slot.end_time,
                                  instructor.timezone,
                                )}
                              </p>
                              <p className="text-muted-foreground mt-1 text-xs">
                                {instructor.name}
                              </p>
                              {booking && (
                                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                  <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-950">
                                    <UserRound className="size-4" />
                                    {booking.student_label}
                                  </p>
                                  <p className="mt-1 text-xs text-amber-700">
                                    Запись создана{" "}
                                    {formatDateTime(
                                      booking.created_at,
                                      instructor.timezone,
                                    )}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {booking && (
                              <form action={cancelBookingAction}>
                                <input
                                  type="hidden"
                                  name="booking_id"
                                  value={booking.id}
                                />
                                <Button
                                  type="submit"
                                  variant="outline"
                                  className="h-10"
                                  disabled={!adminEnabled}
                                >
                                  <CircleX />
                                  Отменить запись
                                </Button>
                              </form>
                            )}

                            <form action={deleteSlotAction}>
                              <input
                                type="hidden"
                                name="slot_id"
                                value={slot.id}
                              />
                              <Button
                                type="submit"
                                variant="destructive"
                                className="h-10"
                                disabled={!adminEnabled}
                              >
                                <Trash2 />
                                Удалить слот
                              </Button>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </details>
      </div>
    </main>
  );
}
