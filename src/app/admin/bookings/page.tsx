import Link from "next/link";
import {
  CalendarDays,
  CircleX,
  Home,
  LogOut,
  Search,
  Settings,
  UserRound,
  UserRoundPen,
  UsersRound,
} from "lucide-react";
import { cancelBookingAction } from "@/app/admin/actions";
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
import { Input } from "@/components/ui/input";

export const dynamic = "force-dynamic";

type AdminBookingsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    range?: string;
    q?: string;
  }>;
};

type Instructor = {
  id: string;
  name: string;
  slug: string;
  public_name: string | null;
  timezone: string;
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

type LessonType = {
  id: string;
  name: string;
  color: string;
};

type Booking = {
  id: string;
  slot_id: string;
  student_label: string;
  created_at: string;
};

type BookingItem = Booking & {
  slot: Slot;
  scheduleDay: ScheduleDay;
  lessonType: LessonType | null;
  instructor: Instructor;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

const rangeLabels = {
  today: "Сегодня",
  tomorrow: "Завтра",
  week: "Неделя",
};

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

function parseDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateValue(date);
}

function getWeekStart(value: string) {
  const date = parseDate(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return formatDateValue(date);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
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

function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function getTransmissionLabel(transmission: ScheduleDay["transmission"]) {
  if (transmission === "automatic") return "АКПП";
  if (transmission === "manual") return "МКПП";
  return "Теория";
}

function getRangeBounds(range: keyof typeof rangeLabels, timezone: string) {
  const today = getLocalDate(timezone);

  if (range === "tomorrow") {
    const tomorrow = addDays(today, 1);
    return { start: tomorrow, end: tomorrow };
  }

  if (range === "week") {
    const start = getWeekStart(today);
    return { start, end: addDays(start, 6) };
  }

  return { start: today, end: today };
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed bg-white px-4 py-10 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

function BookingCard({
  item,
  adminEnabled,
}: {
  item: BookingItem;
  adminEnabled: boolean;
}) {
  const note = getVisibleSlotNote(item.slot.note);

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="bg-amber-100 text-amber-800">Записан</Badge>
            <span className="text-xs font-medium text-zinc-500">
              {formatDate(item.scheduleDay.date)}
            </span>
          </div>
          <p className="mt-2 text-xl font-bold tabular-nums">
            {formatTime(item.slot.start_time, item.instructor.timezone)}
            <span className="mx-1.5 text-zinc-300">–</span>
            {formatTime(item.slot.end_time, item.instructor.timezone)}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <span
              className="size-3 shrink-0 rounded-full border border-black/10"
              style={{
                backgroundColor: item.lessonType?.color ?? "#d4d4d8",
              }}
            />
            <p className="truncate font-semibold">
              {item.lessonType?.name ?? "Тип занятия не найден"}
            </p>
          </div>
        </div>

        <form action={cancelBookingAction}>
          <input type="hidden" name="booking_id" value={item.id} />
          <Button
            type="submit"
            variant="outline"
            className="h-10 w-full sm:w-auto"
            disabled={!adminEnabled}
          >
            <CircleX />
            Отменить запись
          </Button>
        </form>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-xs font-medium text-amber-700">Ученик</p>
          <p className="mt-1 flex items-center gap-2 font-semibold text-amber-950">
            <UserRound className="size-4" />
            {item.student_label}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs font-medium text-zinc-500">Инструктор</p>
          <p className="mt-1 truncate font-semibold">
            {item.instructor.public_name ?? item.instructor.name}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs font-medium text-zinc-500">Коробка</p>
          <p className="mt-1 font-semibold">
            {getTransmissionLabel(item.scheduleDay.transmission)}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs font-medium text-zinc-500">Запись создана</p>
          <p className="mt-1 font-semibold">
            {formatDateTime(item.created_at, item.instructor.timezone)}
          </p>
        </div>
      </div>

      {note && (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-900">
          {note}
        </div>
      )}
    </article>
  );
}

export default async function AdminBookingsPage({
  searchParams,
}: AdminBookingsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireActiveOrganizationMember();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();
  const range =
    params.range === "tomorrow" || params.range === "week"
      ? params.range
      : "today";
  const query = (params.q ?? "").trim();

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
  const timezone = selectedInstructor?.timezone ?? "Asia/Irkutsk";
  const bounds = getRangeBounds(range, timezone);
  const instructorIds = selectedInstructor ? [selectedInstructor.id] : [];

  const { data: scheduleDayData, error: scheduleDayError } =
    instructorIds.length > 0
      ? await supabase
          .from("schedule_days")
          .select("id, instructor_id, date, transmission")
          .in("instructor_id", instructorIds)
          .gte("date", bounds.start)
          .lte("date", bounds.end)
          .order("date")
      : { data: [], error: null };
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
  const bookings = (bookingData ?? []) as Booking[];

  const lessonTypeIds = [...new Set(slots.map((slot) => slot.lesson_type_id))];
  const { data: lessonTypeData, error: lessonTypeError } =
    lessonTypeIds.length > 0
      ? await supabase
          .from("lesson_types")
          .select("id, name, color")
          .in("id", lessonTypeIds)
      : { data: [], error: null };
  const lessonTypes = (lessonTypeData ?? []) as LessonType[];

  const loadError =
    instructorError ?? scheduleDayError ?? slotError ?? bookingError ?? lessonTypeError;
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const scheduleDaysById = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay]),
  );
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const bookingItems = bookings
    .map((booking): BookingItem | null => {
      const slot = slotsById.get(booking.slot_id);
      if (!slot) return null;

      const scheduleDay = scheduleDaysById.get(slot.schedule_day_id);
      const instructor = instructorsById.get(slot.instructor_id);
      if (!scheduleDay || !instructor) return null;

      return {
        ...booking,
        slot,
        scheduleDay,
        instructor,
        lessonType: lessonTypesById.get(slot.lesson_type_id) ?? null,
      };
    })
    .filter((item): item is BookingItem => Boolean(item))
    .filter((item) =>
      query
        ? item.student_label.toLocaleLowerCase("ru-RU").includes(
            query.toLocaleLowerCase("ru-RU"),
          )
        : true,
    )
    .sort(
      (first, second) =>
        new Date(first.slot.start_time).getTime() -
        new Date(second.slot.start_time).getTime(),
    );

  return (
    <main className="min-h-screen bg-zinc-100 px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Журнал записей
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Записи учеников
              </h1>
              <p className="text-muted-foreground mt-2 text-xs sm:text-sm">
                {rangeLabels[range]} · {bookingItems.length} записей
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
                render={<Link href="/admin/schedule" />}
              >
                <CalendarDays />
                Расписание
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
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Фильтры</CardTitle>
            <CardDescription>
              Быстро найдите запись по ученику или периоду.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-[1fr_180px_1fr_auto]">
              {membership.isOwnerOrAdmin ? (
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
              ) : (
                <div className="rounded-lg border bg-zinc-50 px-3 py-2 text-sm font-medium">
                  {selectedInstructor?.public_name ??
                    selectedInstructor?.name ??
                    "Инструктор не выбран"}
                </div>
              )}

              <select
                name="range"
                className={selectClassName}
                defaultValue={range}
              >
                <option value="today">Сегодня</option>
                <option value="tomorrow">Завтра</option>
                <option value="week">Неделя</option>
              </select>

              <div className="relative">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
                <Input
                  name="q"
                  defaultValue={query}
                  placeholder="Поиск по ученику"
                  className="h-10 pl-9"
                />
              </div>

              <Button type="submit" className="h-10">
                Показать
              </Button>
            </form>
          </CardContent>
        </Card>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить записи: {loadError.message}
          </div>
        )}

        <section className="space-y-3">
          {bookingItems.length > 0 ? (
            bookingItems.map((item) => (
              <BookingCard
                key={item.id}
                item={item}
                adminEnabled={adminEnabled}
              />
            ))
          ) : (
            <EmptyState>
              По выбранным фильтрам записей нет. Попробуйте другой период или
              очистите поиск.
            </EmptyState>
          )}
        </section>
      </div>
    </main>
  );
}
