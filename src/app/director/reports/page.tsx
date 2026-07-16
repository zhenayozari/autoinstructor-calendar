import { CircleDollarSign } from "lucide-react";
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
import { requireDirectorAccess } from "@/lib/director-auth";
import {
  formatDateValue,
  formatHours,
  formatMoney,
  getLocalDate,
  selectClassName,
} from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Booking, Instructor, LessonState, ScheduleDay, School, Slot } from "@/lib/types";

export const dynamic = "force-dynamic";

type DirectorReportsPageProps = {
  searchParams?: Promise<{
    period?: string;
    from?: string;
    to?: string;
    instructor?: string;
  }>;
};

type ReportSlot = Pick<
  Slot,
  "id" | "instructor_id" | "schedule_day_id" | "school_id" | "start_time" | "end_time"
>;

type ReportBooking = Pick<Booking, "id" | "slot_id" | "student_label"> & {
  price_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean;
  lesson_state: LessonState;
};

type ReportItem = ReportBooking & {
  slot: ReportSlot;
  scheduleDay: Pick<ScheduleDay, "id" | "instructor_id" | "date">;
  instructor: Instructor;
  school: School | null;
};

type MoneyGroup = {
  id: string;
  label: string;
  color?: string;
  count: number;
  completedCount: number;
  hours: number;
  plannedAmount: number;
  earnedAmount: number;
  paidAmount: number;
  debtAmount: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function getMonthBounds(dateValue: string) {
  const [year, month] = dateValue.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));

  return {
    from: formatDateValue(start),
    to: formatDateValue(end),
  };
}

function getWeekBounds(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00Z`);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() + 6);

  return {
    from: formatDateValue(date),
    to: formatDateValue(end),
  };
}

function getDateBounds(period: string, currentDate: string) {
  if (period === "day") {
    return { from: currentDate, to: currentDate };
  }

  if (period === "week") {
    return getWeekBounds(currentDate);
  }

  return getMonthBounds(currentDate);
}

function isDateValue(value: string | undefined) {
  return Boolean(value && DATE_PATTERN.test(value));
}

function getDurationHours(slot: ReportSlot) {
  return (
    (new Date(slot.end_time).getTime() -
      new Date(slot.start_time).getTime()) /
    3_600_000
  );
}

function getPaidAmount(item: Pick<ReportBooking, "paid_amount">) {
  return item.paid_amount ?? 0;
}

function getDebtAmount(
  item: Pick<ReportBooking, "price_amount" | "paid_amount">,
) {
  return Math.max((item.price_amount ?? 0) - (item.paid_amount ?? 0), 0);
}

function addToGroup(
  map: Map<string, MoneyGroup>,
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
      completedCount: 0,
      hours: 0,
      plannedAmount: 0,
      earnedAmount: 0,
      paidAmount: 0,
      debtAmount: 0,
    } satisfies MoneyGroup);

  current.count += 1;
  current.paidAmount += getPaidAmount(item);
  current.debtAmount += getDebtAmount(item);

  if (item.lesson_state === "scheduled") {
    current.plannedAmount += item.price_amount ?? 0;
  }

  if (item.lesson_state === "completed") {
    current.completedCount += 1;
    current.hours += getDurationHours(item.slot);
    current.earnedAmount += item.price_amount ?? 0;
  }

  map.set(key, current);
}

function SummaryCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const className =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50/60"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/60"
        : "";
  const labelClassName =
    tone === "emerald"
      ? "text-emerald-700"
      : tone === "amber"
        ? "text-amber-700"
        : "text-zinc-500";

  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <p className={`text-sm ${labelClassName}`}>{label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950">
          {value}
        </p>
        <p className={`mt-1 text-xs ${labelClassName}`}>{hint}</p>
      </CardContent>
    </Card>
  );
}

function PeriodButton({
  value,
  label,
  selectedPeriod,
  selectedInstructorId,
}: {
  value: "day" | "week" | "month";
  label: string;
  selectedPeriod: string;
  selectedInstructorId: string;
}) {
  return (
    <>
      <input type="hidden" name="instructor" value={selectedInstructorId} />
      <Button
        type="submit"
        name="period"
        value={value}
        variant={selectedPeriod === value ? "default" : "outline"}
        className="h-9 flex-1"
      >
        {label}
      </Button>
    </>
  );
}

function MoneyGroupTable({
  title,
  description,
  groups,
}: {
  title: string;
  description: string;
  groups: MoneyGroup[];
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
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b">
                  <th className="py-3 pr-3 font-semibold">Название</th>
                  <th className="py-3 pr-3 text-right font-semibold">Занятий</th>
                  <th className="py-3 pr-3 text-right font-semibold">Проведено</th>
                  <th className="py-3 pr-3 text-right font-semibold">Часов</th>
                  <th className="py-3 pr-3 text-right font-semibold">План</th>
                  <th className="py-3 pr-3 text-right font-semibold">Получено</th>
                  <th className="py-3 text-right font-semibold">Долг</th>
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
                      {group.completedCount}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      {formatHours(group.hours)}
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                      {formatMoney(group.plannedAmount)}
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums text-emerald-700">
                      {formatMoney(group.paidAmount)}
                    </td>
                    <td className="py-3 text-right font-semibold tabular-nums text-amber-700">
                      {formatMoney(group.debtAmount)}
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

export default async function DirectorReportsPage({
  searchParams,
}: DirectorReportsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireDirectorAccess();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();

  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name, timezone, is_active",
    );
  const instructors = (instructorData ?? []) as Instructor[];
  const timezone = instructors[0]?.timezone ?? "Asia/Irkutsk";
  const selectedPeriod =
    params.period === "day" ||
    params.period === "week" ||
    params.period === "custom"
      ? params.period
      : "month";
  const defaultBounds = getDateBounds(selectedPeriod, getLocalDate(timezone));
  const from = isDateValue(params.from) ? params.from! : defaultBounds.from;
  const to = isDateValue(params.to) ? params.to! : defaultBounds.to;
  const selectedInstructor = instructors.find(
    (instructor) => instructor.id === params.instructor,
  );
  const selectedInstructorId = selectedInstructor?.id ?? "all";
  const reportInstructorIds = selectedInstructor
    ? [selectedInstructor.id]
    : instructors.map((instructor) => instructor.id);

  const [
    { data: schoolData, error: schoolError },
    { data: scheduleDayData, error: scheduleDayError },
  ] = await Promise.all([
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    reportInstructorIds.length > 0
      ? supabase
          .from("schedule_days")
          .select("id, instructor_id, date")
          .in("instructor_id", reportInstructorIds)
          .gte("date", from)
          .lte("date", to)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const scheduleDays = (scheduleDayData ?? []) as Pick<
    ScheduleDay,
    "id" | "instructor_id" | "date"
  >[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);
  const { data: slotData, error: slotError } =
    scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select("id, instructor_id, schedule_day_id, school_id, start_time, end_time")
          .in("schedule_day_id", scheduleDayIds)
          .neq("status", "cancelled")
      : { data: [], error: null };
  const slots = (slotData ?? []) as ReportSlot[];
  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    slotIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, slot_id, student_label, price_amount, paid_amount, is_paid, lesson_state")
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };

  const loadError = instructorError ?? schoolError ?? scheduleDayError ?? slotError ?? bookingError;
  const schools = (schoolData ?? []) as School[];
  const bookings = (bookingData ?? []) as ReportBooking[];
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const scheduleDaysById = new Map(
    scheduleDays.map((scheduleDay) => [scheduleDay.id, scheduleDay]),
  );
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const reportItems = bookings
    .map((booking): ReportItem | null => {
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
        school: slot.school_id ? schoolsById.get(slot.school_id) ?? null : null,
      };
    })
    .filter((item): item is ReportItem => Boolean(item));
  const completedItems = reportItems.filter(
    (item) => item.lesson_state === "completed",
  );
  const plannedItems = reportItems.filter(
    (item) => item.lesson_state === "scheduled",
  );
  const plannedAmount = plannedItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const earnedAmount = completedItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const paidAmount = reportItems.reduce(
    (sum, item) => sum + getPaidAmount(item),
    0,
  );
  const debtAmount = reportItems.reduce(
    (sum, item) => sum + getDebtAmount(item),
    0,
  );
  const paidItemsCount = reportItems.filter((item) => getPaidAmount(item) > 0)
    .length;
  const debtItems = reportItems.filter((item) => getDebtAmount(item) > 0);
  const hours = completedItems.reduce(
    (sum, item) => sum + getDurationHours(item.slot),
    0,
  );
  const byInstructor = new Map<string, MoneyGroup>();
  const bySchool = new Map<string, MoneyGroup>();
  const byStudent = new Map<string, MoneyGroup>();

  for (const item of reportItems) {
    addToGroup(
      byInstructor,
      item.instructor.id,
      item.instructor.public_name ?? item.instructor.name,
      item,
    );
    addToGroup(
      bySchool,
      item.school?.id ?? "without-school",
      item.school?.name ?? "Без источника",
      item,
      item.school?.color,
    );
    addToGroup(byStudent, item.student_label, item.student_label, item);
  }

  const instructorGroups = [...byInstructor.values()].sort(
    (first, second) => second.plannedAmount - first.plannedAmount,
  );
  const schoolGroups = [...bySchool.values()].sort(
    (first, second) => second.plannedAmount - first.plannedAmount,
  );
  const topDebtGroups = [...byStudent.values()]
    .filter((group) => group.debtAmount > 0)
    .sort((first, second) => second.debtAmount - first.debtAmount)
    .slice(0, 8);

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Итоги школы
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Деньги и занятия за период: {from} - {to}.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="План"
            value={formatMoney(plannedAmount)}
            hint={`${plannedItems.length} запланированных занятий`}
          />
          <SummaryCard
            label="Заработано"
            value={formatMoney(earnedAmount)}
            hint={`${completedItems.length} проведено · ${formatHours(hours)} ч`}
          />
          <SummaryCard
            label="Получено"
            value={formatMoney(paidAmount)}
            hint={`${paidItemsCount} записей с оплатой`}
            tone="emerald"
          />
          <SummaryCard
            label="Долг"
            value={formatMoney(debtAmount)}
            hint={`${debtItems.length} записей с долгом`}
            tone="amber"
          />
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold">Фильтры</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Быстрый период или точная настройка дат.
              </p>
            </div>
            <form className="flex gap-2">
              <PeriodButton
                value="day"
                label="Сегодня"
                selectedPeriod={selectedPeriod}
                selectedInstructorId={selectedInstructorId}
              />
              <PeriodButton
                value="week"
                label="Неделя"
                selectedPeriod={selectedPeriod}
                selectedInstructorId={selectedInstructorId}
              />
              <PeriodButton
                value="month"
                label="Месяц"
                selectedPeriod={selectedPeriod}
                selectedInstructorId={selectedInstructorId}
              />
            </form>

            <details className="rounded-xl border bg-zinc-50">
              <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold">
                Точные фильтры
              </summary>
              <form className="grid gap-3 border-t px-3 py-4 md:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="period" value="custom" />
                <div className="space-y-1">
                  <Label htmlFor="director-report-from">С даты</Label>
                  <Input
                    id="director-report-from"
                    name="from"
                    type="date"
                    defaultValue={from}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="director-report-to">По дату</Label>
                  <Input
                    id="director-report-to"
                    name="to"
                    type="date"
                    defaultValue={to}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="director-report-instructor">Инструктор</Label>
                  <select
                    id="director-report-instructor"
                    name="instructor"
                    className={selectClassName}
                    defaultValue={selectedInstructorId}
                  >
                    <option value="all">Все инструкторы</option>
                    {instructors.map((instructor) => (
                      <option key={instructor.id} value={instructor.id}>
                        {instructor.public_name ?? instructor.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <Button type="submit" className="h-10 w-full">
                    Показать
                  </Button>
                </div>
              </form>
            </details>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <MoneyGroupTable
            title="По инструкторам"
            description="Кто сколько записей, денег и долгов дал за период."
            groups={instructorGroups}
          />
          <MoneyGroupTable
            title="По источникам"
            description="Автошколы, частные ученики и другие источники."
            groups={schoolGroups}
          />
        </section>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <CircleDollarSign className="size-4" />
              Долги по ученикам
            </CardTitle>
            <CardDescription>
              Самые заметные задолженности за выбранный период.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topDebtGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                Долгов за выбранный период нет.
              </div>
            ) : (
              <div className="divide-y rounded-xl border bg-white">
                {topDebtGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{group.label}</p>
                      <p className="text-muted-foreground text-xs">
                        {group.count} записей
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-amber-700">
                      {formatMoney(group.debtAmount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </main>
  );
}
