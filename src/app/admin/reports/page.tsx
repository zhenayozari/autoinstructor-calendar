import { ChevronDown, TrendingUp } from "lucide-react";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import {
  formatDateValue,
  formatHours,
  formatMoney,
  getLocalDate,
  selectClassName,
} from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import type {
  Booking,
  Instructor,
  LessonState,
  LessonType,
  ScheduleDay,
  School,
  Slot,
} from "@/lib/types";
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
    period?: string;
    school?: string;
    student?: string;
    payment?: string;
    lessonState?: string;
  }>;
};

type ReportSlot = Pick<
  Slot,
  | "id"
  | "instructor_id"
  | "schedule_day_id"
  | "lesson_type_id"
  | "school_id"
  | "start_time"
  | "end_time"
>;

type ReportBooking = Pick<Booking, "id" | "slot_id" | "student_label"> & {
  student_access_id: string | null;
  price_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  lesson_state: LessonState;
  completed_at: string | null;
};

type ReportLessonType = Pick<LessonType, "id" | "code" | "name" | "color" | "kind">;

type ReportItem = ReportBooking & {
  slot: ReportSlot;
  scheduleDay: Pick<ScheduleDay, "id" | "instructor_id" | "date">;
  lessonType: ReportLessonType;
  instructor: Instructor;
  school: School | null;
};

type ReportGroup = {
  id: string;
  label: string;
  color?: string;
  count: number;
  hours: number;
  amount: number;
  missingPriceCount: number;
  paidCount: number;
};

type DebtGroup = {
  id: string;
  label: string;
  amount: number;
  count: number;
};

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

function getDateBounds(period: string | undefined, currentDate: string) {
  if (period === "day") {
    return { from: currentDate, to: currentDate };
  }

  if (period === "week") {
    return getWeekBounds(currentDate);
  }

  return getMonthBounds(currentDate);
}

function isDateValue(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function getDurationHours(slot: ReportSlot) {
  return (
    (new Date(slot.end_time).getTime() -
      new Date(slot.start_time).getTime()) /
    3_600_000
  );
}

function getItemPaidAmount(item: Pick<ReportBooking, "paid_amount">) {
  return item.paid_amount ?? 0;
}

function getItemDebtAmount(
  item: Pick<ReportBooking, "price_amount" | "paid_amount">,
) {
  return Math.max((item.price_amount ?? 0) - (item.paid_amount ?? 0), 0);
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
      paidCount: 0,
    } satisfies ReportGroup);

  current.count += 1;
  if (item.lesson_state === "completed") {
    current.hours += getDurationHours(item.slot);
    current.amount += item.price_amount ?? 0;
    if (item.is_paid) current.paidCount += 1;

    if (item.price_amount === null) {
      current.missingPriceCount += 1;
    }
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
  const toneClassName =
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
  const valueClassName =
    tone === "emerald"
      ? "text-emerald-950"
      : tone === "amber"
        ? "text-amber-950"
        : "";

  return (
    <Card className={toneClassName}>
      <CardContent className="p-4 sm:p-5">
        <p className={`text-sm ${labelClassName}`}>{label}</p>
        <p className={`mt-2 text-2xl font-semibold tracking-tight ${valueClassName}`}>
          {value}
        </p>
        <p className={`mt-1 text-xs ${labelClassName}`}>{hint}</p>
      </CardContent>
    </Card>
  );
}

function HiddenFilterFields({
  selectedLessonTypeId,
  selectedSchoolId,
  selectedStudentId,
  selectedPayment,
  selectedLessonState,
}: {
  selectedLessonTypeId: string;
  selectedSchoolId: string;
  selectedStudentId: string;
  selectedPayment: string;
  selectedLessonState: string;
}) {
  return (
    <>
      <input type="hidden" name="lessonType" value={selectedLessonTypeId} />
      <input type="hidden" name="school" value={selectedSchoolId} />
      <input type="hidden" name="student" value={selectedStudentId} />
      <input type="hidden" name="payment" value={selectedPayment} />
      <input type="hidden" name="lessonState" value={selectedLessonState} />
    </>
  );
}

function PeriodButton({
  value,
  label,
  selectedPeriod,
}: {
  value: "day" | "week" | "month";
  label: string;
  selectedPeriod: string;
}) {
  const isActive = selectedPeriod === value;

  return (
    <Button
      type="submit"
      name="period"
      value={value}
      variant={isActive ? "default" : "outline"}
      className="h-9 flex-1"
    >
      {label}
    </Button>
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
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b">
                  <th className="py-3 pr-3 font-semibold">Название</th>
                  <th className="py-3 pr-3 text-right font-semibold">Занятий</th>
                  <th className="py-3 pr-3 text-right font-semibold">Оплачено</th>
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
                      <span className={group.paidCount === group.count ? "font-semibold text-emerald-700" : "text-zinc-500"}>
                        {group.paidCount}/{group.count}
                      </span>
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

  const { data: instructorData, error: instructorError } =
    await buildActiveInstructorsQuery(supabase, membership);
  const instructors = (instructorData ?? []) as Instructor[];
  const firstInstructor = instructors[0] ?? null;
  const timezone = firstInstructor?.timezone ?? "Asia/Irkutsk";
  const selectedPeriod =
    params.period === "day" || params.period === "week" || params.period === "custom"
      ? params.period
      : "month";
  const defaultBounds = getDateBounds(selectedPeriod, getLocalDate(timezone));
  const from = isDateValue(params.from) ? params.from! : defaultBounds.from;
  const to = isDateValue(params.to) ? params.to! : defaultBounds.to;
  const selectedSchoolId =
    params.school && params.school !== "all" ? params.school : "all";
  const selectedStudentId =
    params.student && params.student !== "all" ? params.student : "all";
  const selectedPayment =
    params.payment === "paid" || params.payment === "unpaid"
      ? params.payment
      : "all";
  const selectedLessonState =
    params.lessonState === "scheduled" ||
    params.lessonState === "completed" ||
    params.lessonState === "no_show"
      ? params.lessonState
      : "all";
  const selectedInstructorId = membership.instructorId ?? firstInstructor?.id;
  const selectedInstructor =
    selectedInstructorId && selectedInstructorId !== "all"
      ? instructors.find((instructor) => instructor.id === selectedInstructorId) ??
        firstInstructor
      : null;
  const reportInstructorIds =
    selectedInstructor
        ? [selectedInstructor.id]
        : firstInstructor
          ? [firstInstructor.id]
          : [];

  const [
    { data: lessonTypeData, error: lessonTypeError },
    { data: schoolData, error: schoolError },
    { data: studentAccessData, error: studentAccessError },
    { data: scheduleDayData, error: scheduleDayError },
  ] = await Promise.all([
    supabase
      .from("lesson_types")
      .select("id, code, name, color, kind")
      .order("sort_order")
      .order("name"),
    supabase
      .from("schools")
      .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
      .eq("organization_id", membership.organizationId)
      .order("name"),
    adminEnabled && reportInstructorIds.length > 0
      ? supabase
          .from("student_accesses")
          .select("id, display_label, instructor_id, school_id, is_archived")
          .eq("organization_id", membership.organizationId)
          .in("instructor_id", reportInstructorIds)
          .order("display_label")
      : Promise.resolve({ data: [], error: null }),
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
  const schools = (schoolData ?? []) as School[];
  const studentAccesses = (studentAccessData ?? []) as {
    id: string;
    display_label: string;
    instructor_id: string;
    school_id: string | null;
    is_archived: boolean;
  }[];
  const selectedLessonTypeId =
    params.lessonType && params.lessonType !== "all" ? params.lessonType : "all";
  const scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);

  const { data: slotData, error: slotError } =
    adminEnabled && scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select(
            "id, instructor_id, schedule_day_id, lesson_type_id, school_id, start_time, end_time",
          )
          .in("schedule_day_id", scheduleDayIds)
          .neq("status", "cancelled")
          .order("start_time")
      : { data: [], error: null };
  let slots = (slotData ?? []) as ReportSlot[];

  if (selectedLessonTypeId !== "all") {
    slots = slots.filter((slot) => slot.lesson_type_id === selectedLessonTypeId);
  }

  if (selectedSchoolId !== "all") {
    slots = slots.filter((slot) => slot.school_id === selectedSchoolId);
  }

  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    adminEnabled && slotIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, slot_id, student_label, student_access_id, price_amount, paid_amount, is_paid, paid_at, lesson_state, completed_at")
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };
  let bookings = (bookingData ?? []) as ReportBooking[];

  if (selectedStudentId !== "all") {
    bookings = bookings.filter(
      (booking) => booking.student_access_id === selectedStudentId,
    );
  }

  if (selectedPayment === "paid") {
    bookings = bookings.filter((booking) => booking.is_paid);
  } else if (selectedPayment === "unpaid") {
    bookings = bookings.filter((booking) => !booking.is_paid);
  }

  if (selectedLessonState !== "all") {
    bookings = bookings.filter(
      (booking) => booking.lesson_state === selectedLessonState,
    );
  }
  const loadError =
    instructorError ??
    lessonTypeError ??
    schoolError ??
    studentAccessError ??
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
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
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
        school: slot.school_id ? schoolsById.get(slot.school_id) ?? null : null,
      };
    })
    .filter((item): item is ReportItem => Boolean(item));

  const byLessonType = new Map<string, ReportGroup>();
  const byStudent = new Map<string, ReportGroup>();
  const byInstructor = new Map<string, ReportGroup>();
  const bySchool = new Map<string, ReportGroup>();

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
      bySchool,
      item.school?.id ?? "private",
      item.school?.name ?? "Частные занятия",
      item,
      item.school?.color,
    );
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
  const schoolGroups = [...bySchool.values()].sort(
    (first, second) => second.amount - first.amount,
  );
  const plannedItems = reportItems.filter(
    (item) => item.lesson_state === "scheduled",
  );
  const completedItems = reportItems.filter(
    (item) => item.lesson_state === "completed",
  );
  const plannedAmount = plannedItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const earnedAmount = completedItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const missingPriceCount = reportItems.filter(
    (item) => item.price_amount === null,
  ).length;
  const paidCount = reportItems.filter((item) => getItemPaidAmount(item) > 0).length;
  const debtItems = reportItems.filter((item) => getItemDebtAmount(item) > 0);
  const paidAmount = reportItems
    .reduce((sum, item) => sum + getItemPaidAmount(item), 0);
  const debtAmount = reportItems.reduce(
    (sum, item) => sum + getItemDebtAmount(item),
    0,
  );
  const debtGroupsByStudent = new Map<string, DebtGroup>();

  for (const item of reportItems) {
    const itemDebt = getItemDebtAmount(item);

    if (itemDebt <= 0) {
      continue;
    }

    const current =
      debtGroupsByStudent.get(item.student_label) ??
      ({
        id: item.student_label,
        label: item.student_label,
        amount: 0,
        count: 0,
      } satisfies DebtGroup);

    current.amount += itemDebt;
    current.count += 1;
    debtGroupsByStudent.set(item.student_label, current);
  }

  const debtGroups = [...debtGroupsByStudent.values()].sort(
    (first, second) => second.amount - first.amount,
  );

  // Sort report items by date desc for the booking list
  const sortedReportItems = [...reportItems].sort(
    (a, b) =>
      new Date(b.slot.start_time).getTime() -
      new Date(a.slot.start_time).getTime(),
  );

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">

        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              Итоги и деньги
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Итоги
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              Деньги, долги и занятия за выбранный период.
            </p>
          </div>
        </header>

        {!adminEnabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Для отчётов нужен служебный ключ проекта в настройках сервера.
          </div>
        )}

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить отчёт: {loadError.message}
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
            hint={`${completedItems.length} проведённых занятий`}
          />
          <SummaryCard
            label="Получено"
            value={formatMoney(paidAmount)}
            hint={`${paidCount} записей с оплатой`}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Период</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {from} — {to}
              </p>
            </div>
            <form className="flex gap-2 sm:min-w-[360px]">
              <HiddenFilterFields
                selectedLessonTypeId={selectedLessonTypeId}
                selectedSchoolId={selectedSchoolId}
                selectedStudentId={selectedStudentId}
                selectedPayment={selectedPayment}
                selectedLessonState={selectedLessonState}
              />
              <PeriodButton
                value="day"
                label="Сегодня"
                selectedPeriod={selectedPeriod}
              />
              <PeriodButton
                value="week"
                label="Неделя"
                selectedPeriod={selectedPeriod}
              />
              <PeriodButton
                value="month"
                label="Месяц"
                selectedPeriod={selectedPeriod}
              />
            </form>
          </div>

          <details className="group mt-4 rounded-xl border bg-zinc-50">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-3 text-sm font-semibold">
              Фильтры
              <ChevronDown className="size-4 text-zinc-500 transition group-open:rotate-180" />
            </summary>
            <form className="grid gap-3 border-t px-3 py-4 md:grid-cols-2 lg:grid-cols-3">
              <input type="hidden" name="period" value="custom" />

              <div className="space-y-1">
                <Label htmlFor="report-from">С даты</Label>
                <Input id="report-from" name="from" type="date" defaultValue={from} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="report-to">По дату</Label>
                <Input id="report-to" name="to" type="date" defaultValue={to} />
              </div>

              <div className="space-y-1">
                <Label htmlFor="report-lesson-type">Тип занятия</Label>
                <select
                  id="report-lesson-type"
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
              </div>

              <div className="space-y-1">
                <Label htmlFor="report-school">Автошкола</Label>
                <select
                  id="report-school"
                  name="school"
                  className={selectClassName}
                  defaultValue={selectedSchoolId}
                >
                  <option value="all">Все автошколы</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="report-student">Ученик</Label>
                <select
                  id="report-student"
                  name="student"
                  className={selectClassName}
                  defaultValue={selectedStudentId}
                >
                  <option value="all">Все ученики</option>
                  {studentAccesses.map((student) => (
                    <option key={student.id} value={student.id}>
                      {student.display_label}
                      {student.is_archived ? " / архив" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="report-payment">Оплата</Label>
                <select
                  id="report-payment"
                  name="payment"
                  className={selectClassName}
                  defaultValue={selectedPayment}
                >
                  <option value="all">Все оплаты</option>
                  <option value="paid">Только оплаченные</option>
                  <option value="unpaid">Только долги</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="report-lesson-state">Статус занятия</Label>
                <select
                  id="report-lesson-state"
                  name="lessonState"
                  className={selectClassName}
                  defaultValue={selectedLessonState}
                >
                  <option value="all">Все занятия</option>
                  <option value="scheduled">Запланированные</option>
                  <option value="completed">Проведённые</option>
                  <option value="no_show">Неявки</option>
                </select>
              </div>

              <Button type="submit" className="h-10 self-end">
                Показать
              </Button>
            </form>
          </details>
        </section>

        {missingPriceCount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            В отчёте есть записи без суммы. Обычно это старые записи, созданные
            до добавления цен. Их можно учитывать как 0 ₽ или позже добавить
            ручное редактирование суммы.
          </div>
        )}

        <Card className="border-amber-200">
          <CardHeader className="pb-3">
            <CardTitle>Долги</CardTitle>
            <CardDescription>
              Записи, где получено меньше, чем указано к оплате.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {debtGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                Долгов за выбранный период нет.
              </div>
            ) : (
              <div className="divide-y rounded-xl border bg-white">
                {debtGroups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between gap-3 px-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{group.label}</p>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        {group.count} неоплаченных занятий
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold text-amber-900">
                      {formatMoney(group.amount)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <GroupTable
          title="По типам занятий"
          description="Автошколы, допы, подарочные занятия и теория."
          groups={lessonTypeGroups}
        />

        <GroupTable
          title="По автошколам"
          description="Источник занятия: автошкола или частные записи."
          groups={schoolGroups}
        />

        {false && membership.isOwnerOrAdmin && selectedInstructorId === "all" && (
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Все записи за период</CardTitle>
            <CardDescription>
              Полный список с возможностью отметить оплату прямо здесь.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sortedReportItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                Нет записей за выбранный период.
              </div>
            ) : (
              <div className="divide-y">
                {sortedReportItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className="mt-1 size-2.5 shrink-0 rounded-full border border-black/10"
                        style={{ backgroundColor: item.lessonType.color }}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {item.student_label}
                        </p>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {item.lessonType.name} ·{" "}
                          {new Intl.DateTimeFormat("ru-RU", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: item.instructor.timezone,
                          }).format(new Date(item.slot.start_time))}
                        </p>
                        {item.price_amount !== null && (
                          <p className="mt-0.5 text-xs font-medium text-zinc-600">
                            К оплате: {formatMoney(item.price_amount)}
                            {" · "}
                            Получено: {formatMoney(item.paid_amount ?? 0)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="pl-5 text-xs font-semibold sm:pl-0">
                      {getItemDebtAmount(item) > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                          Долг {formatMoney(getItemDebtAmount(item))}
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                          Долга нет
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/60">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-5" />
              Что считается сейчас
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-blue-950">
            План считается по запланированным занятиям. Заработано считается
            только по проведённым занятиям. Получено и долг считаются по всем
            подтверждённым записям выбранного периода, потому что оплату могут
            внести до занятия.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
