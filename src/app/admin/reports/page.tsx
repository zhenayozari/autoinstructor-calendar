import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  Home,
  LogOut,
  Settings,
  TrendingUp,
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
import { AdminMobileNav } from "@/components/admin/admin-mobile-nav";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const dynamic = "force-dynamic";

type AdminReportsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    from?: string;
    to?: string;
    lessonType?: string;
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
};

type Slot = {
  id: string;
  instructor_id: string;
  schedule_day_id: string;
  lesson_type_id: string;
  start_time: string;
  end_time: string;
};

type Booking = {
  id: string;
  slot_id: string;
  student_label: string;
  price_amount: number | null;
};

type LessonType = {
  id: string;
  code: string;
  name: string;
  color: string;
  kind: "driving" | "theory";
};

type ReportItem = Booking & {
  slot: Slot;
  scheduleDay: ScheduleDay;
  lessonType: LessonType;
  instructor: Instructor;
};

type ReportGroup = {
  id: string;
  label: string;
  color?: string;
  count: number;
  hours: number;
  amount: number;
  missingPriceCount: number;
};

const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

function getLocalDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function getMonthBounds(dateValue: string) {
  const [year, month] = dateValue.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

function formatHours(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}

function getDurationHours(slot: Slot) {
  return (
    (new Date(slot.end_time).getTime() -
      new Date(slot.start_time).getTime()) /
    3_600_000
  );
}

function addToGroup(
  map: Map<string, ReportGroup>,
  key: string,
  label: string,
  item: ReportItem,
  color?: string,
) {
  const current =
    map.get(key) ??
    ({
      id: key,
      label,
      color,
      count: 0,
      hours: 0,
      amount: 0,
      missingPriceCount: 0,
    } satisfies ReportGroup);

  current.count += 1;
  current.hours += getDurationHours(item.slot);
  current.amount += item.price_amount ?? 0;

  if (item.price_amount === null) {
    current.missingPriceCount += 1;
  }

  map.set(key, current);
}

function SummaryCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <p className="text-sm text-zinc-500">{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        <p className="mt-1 text-xs text-zinc-500">{hint}</p>
      </CardContent>
    </Card>
  );
}

function GroupTable({
  title,
  description,
  groups,
}: {
  title: string;
  description: string;
  groups: ReportGroup[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
            Нет данных за выбранный период.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b">
                  <th className="py-3 pr-3 font-semibold">Название</th>
                  <th className="py-3 pr-3 text-right font-semibold">
                    Занятий
                  </th>
                  <th className="py-3 pr-3 text-right font-semibold">Часов</th>
                  <th className="py-3 pr-3 text-right font-semibold">Сумма</th>
                  <th className="py-3 text-right font-semibold">Без цены</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b last:border-0">
                    <td className="py-3 pr-3">
                      <div className="flex items-center gap-2">
                        {group.color && (
                          <span
                            className="size-3 rounded-full border border-black/10"
                            style={{ backgroundColor: group.color }}
                          />
                        )}
                        <span className="font-semibold">{group.label}</span>
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {group.count}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {formatHours(group.hours)}
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                      {formatMoney(group.amount)}
                    </td>
                    <td className="py-3 text-right tabular-nums text-zinc-500">
                      {group.missingPriceCount || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AdminReportsPage({
  searchParams,
}: AdminReportsPageProps) {
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
  const firstInstructor = instructors[0] ?? null;
  const timezone = firstInstructor?.timezone ?? "Asia/Irkutsk";
  const defaultBounds = getMonthBounds(getLocalDate(timezone));
  const from = isDateValue(params.from) ? params.from! : defaultBounds.from;
  const to = isDateValue(params.to) ? params.to! : defaultBounds.to;
  const selectedInstructorId =
    membership.isOwnerOrAdmin && params.instructor
      ? params.instructor
      : membership.instructorId;
  const selectedInstructor =
    selectedInstructorId && selectedInstructorId !== "all"
      ? instructors.find((instructor) => instructor.id === selectedInstructorId) ??
        firstInstructor
      : null;
  const reportInstructorIds =
    membership.isOwnerOrAdmin && selectedInstructorId === "all"
      ? instructors.map((instructor) => instructor.id)
      : selectedInstructor
        ? [selectedInstructor.id]
        : firstInstructor
          ? [firstInstructor.id]
          : [];

  const [
    { data: lessonTypeData, error: lessonTypeError },
    { data: scheduleDayData, error: scheduleDayError },
  ] = await Promise.all([
    supabase
      .from("lesson_types")
      .select("id, code, name, color, kind")
      .order("sort_order")
      .order("name"),
    adminEnabled && reportInstructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date")
          .in("instructor_id", reportInstructorIds)
          .gte("date", from)
          .lte("date", to)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const lessonTypes = (lessonTypeData ?? []) as LessonType[];
  const selectedLessonTypeId =
    params.lessonType && params.lessonType !== "all" ? params.lessonType : "all";
  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);

  const { data: slotData, error: slotError } =
    adminEnabled && scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, start_time, end_time",
          )
          .in("schedule_day_id", scheduleDayIds)
          .neq("status", "cancelled")
          .order("start_time")
      : { data: [], error: null };
  let slots = (slotData ?? []) as Slot[];

  if (selectedLessonTypeId !== "all") {
    slots = slots.filter((slot) => slot.lesson_type_id === selectedLessonTypeId);
  }

  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    adminEnabled && slotIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, slot_id, student_label, price_amount")
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };
  const bookings = (bookingData ?? []) as Booking[];
  const loadError =
    instructorError ??
    lessonTypeError ??
    scheduleDayError ??
    slotError ??
    bookingError;

  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const scheduleDaysById = new Map(
    scheduleDays.map((day) => [day.id, day]),
  );
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const lessonTypesById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const reportItems = bookings
    .map((booking): ReportItem | null => {
      const slot = slotsById.get(booking.slot_id);
      if (!slot) return null;

      const scheduleDay = scheduleDaysById.get(slot.schedule_day_id);
      const lessonType = lessonTypesById.get(slot.lesson_type_id);
      const instructor = instructorsById.get(slot.instructor_id);
      if (!scheduleDay || !lessonType || !instructor) return null;

      return {
        ...booking,
        slot,
        scheduleDay,
        lessonType,
        instructor,
      };
    })
    .filter((item): item is ReportItem => Boolean(item));

  const byLessonType = new Map<string, ReportGroup>();
  const byStudent = new Map<string, ReportGroup>();
  const byInstructor = new Map<string, ReportGroup>();

  for (const item of reportItems) {
    addToGroup(
      byLessonType,
      item.lessonType.id,
      item.lessonType.name,
      item,
      item.lessonType.color,
    );
    addToGroup(byStudent, item.student_label, item.student_label, item);
    addToGroup(
      byInstructor,
      item.instructor.id,
      item.instructor.public_name ?? item.instructor.name,
      item,
    );
  }

  const lessonTypeGroups = [...byLessonType.values()].sort(
    (first, second) => second.amount - first.amount,
  );
  const studentGroups = [...byStudent.values()].sort(
    (first, second) => second.count - first.count,
  );
  const instructorGroups = [...byInstructor.values()].sort(
    (first, second) => second.amount - first.amount,
  );
  const totalCount = reportItems.length;
  const totalHours = reportItems.reduce(
    (sum, item) => sum + getDurationHours(item.slot),
    0,
  );
  const totalAmount = reportItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const missingPriceCount = reportItems.filter(
    (item) => item.price_amount === null,
  ).length;
  const selectedInstructorForNav =
    selectedInstructor ?? firstInstructor ?? null;

  return (
    <main className="min-h-screen bg-zinc-100 px-3 pb-24 pt-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <AdminMobileNav
          role={membership.role}
          email={membership.user.email}
          instructorName={
            selectedInstructorForNav?.public_name ?? selectedInstructorForNav?.name
          }
          showTeam={membership.isOwnerOrAdmin}
        />

        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <p className="text-muted-foreground text-sm font-medium">
                Итоги и деньги
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Отчёты
              </h1>
              <p className="text-muted-foreground mt-2 text-sm">
                Считаем подтверждённые записи за период. Отменённые записи не
                входят в итог.
              </p>
            </div>

            <div className="hidden grid-cols-2 gap-2 sm:flex sm:flex-wrap">
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
                      selectedInstructorForNav
                        ? `/admin/profile?instructor=${selectedInstructorForNav.id}`
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

        {!adminEnabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Для отчётов нужен серверный ключ{" "}
            <code className="font-semibold">SUPABASE_SECRET_KEY</code>.
          </div>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Фильтры</CardTitle>
            <CardDescription>
              Выберите период, инструктора и тип занятия.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 lg:grid-cols-[1fr_160px_160px_1fr_auto]">
              {membership.isOwnerOrAdmin ? (
                <select
                  name="instructor"
                  className={selectClassName}
                  defaultValue={selectedInstructorId ?? firstInstructor?.id}
                >
                  <option value="all">Все инструкторы</option>
                  {instructors.map((instructor) => (
                    <option key={instructor.id} value={instructor.id}>
                      {instructor.public_name ?? instructor.name} /{" "}
                      {instructor.slug}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-lg border bg-zinc-50 px-3 py-2 text-sm font-medium">
                  {selectedInstructorForNav?.public_name ??
                    selectedInstructorForNav?.name ??
                    "Инструктор не выбран"}
                </div>
              )}

              <div className="space-y-1">
                <Label htmlFor="report-from" className="sr-only">
                  С даты
                </Label>
                <Input id="report-from" name="from" type="date" defaultValue={from} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="report-to" className="sr-only">
                  По дату
                </Label>
                <Input id="report-to" name="to" type="date" defaultValue={to} />
              </div>

              <select
                name="lessonType"
                className={selectClassName}
                defaultValue={selectedLessonTypeId}
              >
                <option value="all">Все типы занятий</option>
                {lessonTypes.map((lessonType) => (
                  <option key={lessonType.id} value={lessonType.id}>
                    {lessonType.name}
                  </option>
                ))}
              </select>

              <Button type="submit" className="h-10">
                Показать
              </Button>
            </form>
          </CardContent>
        </Card>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить отчёт: {loadError.message}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="Занятий"
            value={String(totalCount)}
            hint={`${formatDate(from)} — ${formatDate(to)}`}
          />
          <SummaryCard
            label="Часов"
            value={formatHours(totalHours)}
            hint="Сумма длительности записанных слотов"
          />
          <SummaryCard
            label="Сумма"
            value={formatMoney(totalAmount)}
            hint="По зафиксированным ценам в записях"
          />
          <SummaryCard
            label="Без цены"
            value={String(missingPriceCount)}
            hint="Записи, где сумма ещё не указана"
          />
        </section>

        {missingPriceCount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            В отчёте есть записи без суммы. Обычно это старые записи, созданные
            до добавления цен. Их можно учитывать как 0 ₽ или позже добавить
            ручное редактирование суммы.
          </div>
        )}

        <GroupTable
          title="По типам занятий"
          description="Автошколы, допы, подарочные занятия и теория."
          groups={lessonTypeGroups}
        />

        {membership.isOwnerOrAdmin && selectedInstructorId === "all" && (
          <GroupTable
            title="По инструкторам"
            description="Сводка по каждому инструктору в выбранном периоде."
            groups={instructorGroups}
          />
        )}

        <GroupTable
          title="По ученикам"
          description="По метке ученика или учебному доступу."
          groups={studentGroups}
        />

        <Card className="border-blue-200 bg-blue-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5" />
              Что считается сейчас
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-blue-950">
            Сейчас отчёт считает подтверждённые записи по дате занятия. Позже
            можно добавить статус «проведено», чтобы деньги считались не по факту
            записи, а по факту состоявшегося занятия.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
