import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronDown, Download, TrendingUp } from "lucide-react";
import {
  createAdminClient,
  hasSupabaseAdminKey,
} from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireActiveOrganizationMember } from "@/lib/auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import {
  formatDateValue,
  formatHours,
  formatMoney,
  getLocalDate,
  selectClassName,
} from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import { getSchedulableLessonTypes } from "@/lib/lesson-types";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  bookingCategoryOptions,
  getBookingCategoryLabel,
} from "@/lib/booking-categories";
import type {
  Booking,
  BookingCategory,
  Instructor,
  LessonState,
  LessonType,
  ScheduleDay,
  School,
  Slot,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SourceSettlementButton } from "@/components/admin/source-settlement-button";
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
    bookingCategory?: string;
  }>;
};

type ReportSlot = Pick<
  Slot,
  | "id"
  | "instructor_id"
  | "schedule_day_id"
  | "lesson_type_id"
  | "start_time"
  | "end_time"
>;

type ReportBooking = Pick<Booking, "id" | "slot_id" | "student_label"> & {
  student_access_id: string | null;
  school_id: string | null;
  price_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean;
  paid_at: string | null;
  booking_category: BookingCategory;
  lesson_state: LessonState;
  completed_at: string | null;
  direct_instructor_income_amount: number | null;
  direct_instructor_income_recognized_at: string | null;
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
  studentAccessId?: string | null;
  sourceSummaries: {
    id: string;
    label: string;
    color?: string;
  }[];
  count: number;
  hours: number;
  amount: number;
  missingPriceCount: number;
  paidCount: number;
};

type DebtGroup = {
  id: string;
  label: string;
  studentAccessId?: string | null;
  sourceSummaries: {
    id: string;
    label: string;
    color?: string;
  }[];
  amount: number;
  count: number;
};

type SourceSettlementGroup = {
  id: string;
  label: string;
  color?: string;
  completedCount: number;
  debtCount: number;
  earnedAmount: number;
  paidAmount: number;
  debtAmount: number;
  missingPriceCount: number;
};

type ReportItemSourceGroup = {
  id: string;
  label: string;
  color?: string;
  items: ReportItem[];
  amount: number;
  paidAmount: number;
  debtAmount: number;
};

type InstructorPayoutPeriodSummary = {
  planned_amount: number;
  paid_amount: number;
  remaining_amount: number;
};

type InstructorPayoutEntryDetail = {
  id: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  entry_type: string;
  planned_at: string | null;
  event_at: string | null;
  student_label: string | null;
  lesson_type_name: string | null;
  school_name: string | null;
  booking_category: BookingCategory | null;
  lesson_state: LessonState | null;
};

type InstructorPayoutPaymentDetail = {
  id: string;
  paid_at: string | null;
  amount: number;
  payment_note: string | null;
};

type ExamRouteReportItem = {
  booking_id: string;
  student_label: string;
  school_name: string;
  lesson_type_name: string;
  lesson_date: string;
  start_time: string;
  amount: number;
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

function formatReportDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

function formatReportDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatPayoutDateTime(value: string | null, timezone: string) {
  if (!value) {
    return "Дата не указана";
  }

  return formatReportDateTime(value, timezone);
}

function getPayoutEntryTitle(entry: InstructorPayoutEntryDetail) {
  if (entry.entry_type === "correction") {
    return "Корректировка";
  }

  return entry.student_label ?? "Занятие";
}

function getPayoutEntryMeta(entry: InstructorPayoutEntryDetail) {
  const parts = [
    entry.lesson_type_name,
    entry.school_name,
    entry.booking_category ? getBookingCategoryLabel(entry.booking_category) : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Без деталей занятия";
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
  options?: { studentAccessId?: string | null },
) {
  const current =
    map.get(key) ??
    ({
      id: key,
      label,
      color,
      studentAccessId: options?.studentAccessId,
      sourceSummaries: [],
      count: 0,
      hours: 0,
      amount: 0,
      missingPriceCount: 0,
      paidCount: 0,
    } satisfies ReportGroup);

  const sourceId = item.school?.id ?? "without-source";
  if (!current.sourceSummaries.some((source) => source.id === sourceId)) {
    current.sourceSummaries.push({
      id: sourceId,
      label: item.school?.name ?? "Без источника",
      color: item.school?.color,
    });
  }

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

function InstructorPayoutDetails({
  entries,
  payments,
  timezone,
}: {
  entries: InstructorPayoutEntryDetail[];
  payments: InstructorPayoutPaymentDetail[];
  timezone: string;
}) {
  return (
    <section className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Начисления за период</CardTitle>
          <CardDescription>
            За какие занятия или корректировки появилась сумма к выплате.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-zinc-500">
              За выбранный период начислений нет.
            </div>
          ) : (
            <div className="divide-y rounded-xl border bg-white">
              {entries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">
                      {getPayoutEntryTitle(entry)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatPayoutDateTime(entry.event_at ?? entry.planned_at, timezone)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {getPayoutEntryMeta(entry)}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-right sm:min-w-[230px]">
                    <div>
                      <p className="text-[11px] uppercase text-zinc-500">Начислено</p>
                      <p className="font-semibold">{formatMoney(entry.amount)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-emerald-700">Выплачено</p>
                      <p className="font-semibold text-emerald-900">
                        {formatMoney(entry.paid_amount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase text-amber-700">Осталось</p>
                      <p className="font-semibold text-amber-900">
                        {formatMoney(entry.remaining_amount)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Выплаты по этим начислениям</CardTitle>
          <CardDescription>
            Когда руководитель отметил выдачу денег, сумма и комментарий.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-zinc-500">
              По этим начислениям выплат ещё нет.
            </div>
          ) : (
            <div className="divide-y rounded-xl border bg-white">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {formatPayoutDateTime(payment.paid_at, timezone)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {payment.payment_note?.trim() || "Без комментария"}
                    </p>
                  </div>
                  <p className="text-right font-semibold text-emerald-900">
                    {formatMoney(payment.amount)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ExamRouteDetails({ items }: { items: ExamRouteReportItem[] }) {
  if (items.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <CardTitle>Экзаменационные маршруты</CardTitle>
        <CardDescription>
          Здесь видно, за какие записи начислено как за 2 занятия. В расписании
          запись при этом остаётся одной.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div
            key={item.booking_id}
            className="grid gap-2 rounded-xl border border-amber-200 bg-white px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
          >
            <div className="min-w-0">
              <p className="font-semibold">{item.student_label}</p>
              <p className="mt-1 text-xs text-zinc-500">
                {formatReportDate(item.lesson_date)} · {item.start_time.slice(0, 5)}
              </p>
              <p className="text-xs text-zinc-500">
                {item.school_name} · {item.lesson_type_name} · Экзаменационный маршрут: 2 занятия
              </p>
            </div>
            <span className="font-semibold text-amber-900">
              {formatMoney(item.amount)}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function MetricTile({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const toneClassName =
    tone === "emerald"
      ? "bg-emerald-100/70 text-emerald-950"
      : tone === "amber"
        ? "bg-amber-100/70 text-amber-950"
        : "bg-white text-zinc-950";

  return (
    <div className={`rounded-xl px-3 py-2 ${toneClassName}`}>
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-zinc-600">{hint}</p>}
    </div>
  );
}

function HiddenFilterFields({
  selectedLessonTypeId,
  selectedSchoolId,
  selectedStudentId,
  selectedPayment,
  selectedLessonState,
  selectedBookingCategory,
}: {
  selectedLessonTypeId: string;
  selectedSchoolId: string;
  selectedStudentId: string;
  selectedPayment: string;
  selectedLessonState: string;
  selectedBookingCategory: string;
}) {
  return (
    <>
      <input type="hidden" name="lessonType" value={selectedLessonTypeId} />
      <input type="hidden" name="school" value={selectedSchoolId} />
      <input type="hidden" name="student" value={selectedStudentId} />
      <input type="hidden" name="payment" value={selectedPayment} />
      <input type="hidden" name="lessonState" value={selectedLessonState} />
      <input
        type="hidden"
        name="bookingCategory"
        value={selectedBookingCategory}
      />
    </>
  );
}

function StudentCardLink({
  studentAccessId,
  className,
  children,
}: {
  studentAccessId?: string | null;
  className?: string;
  children: ReactNode;
}) {
  if (!studentAccessId) {
    return <span className={className}>{children}</span>;
  }

  return (
    <Link
      href={`/admin/students?student=${encodeURIComponent(studentAccessId)}`}
      className={`${className ?? ""} underline-offset-4 hover:underline`}
    >
      {children}
    </Link>
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
  showSources = false,
}: {
  title: string;
  description: string;
  groups: ReportGroup[];
  showSources?: boolean;
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
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {group.color && (
                            <span
                              className="size-3 rounded-full border border-black/10"
                              style={{ backgroundColor: group.color }}
                            />
                          )}
                          <StudentCardLink
                            studentAccessId={group.studentAccessId}
                            className="font-semibold"
                          >
                            {group.label}
                          </StudentCardLink>
                        </div>
                        {showSources && group.sourceSummaries.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {group.sourceSummaries.map((source) => (
                              <span
                                key={source.id}
                                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
                              >
                                {source.color && (
                                  <span
                                    className="size-1.5 rounded-full"
                                    style={{ backgroundColor: source.color }}
                                  />
                                )}
                                {source.label}
                              </span>
                            ))}
                          </div>
                        )}
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

function ReportItemRow({
  item,
  showSource = true,
  showMoney = true,
}: {
  item: ReportItem;
  showSource?: boolean;
  showMoney?: boolean;
}) {
  const debt = getItemDebtAmount(item);

  return (
    <div className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-1 size-2.5 shrink-0 rounded-full border border-black/10"
          style={{ backgroundColor: item.lessonType.color }}
        />
        <div className="min-w-0">
          <StudentCardLink
            studentAccessId={item.student_access_id}
            className="block truncate text-sm font-semibold"
          >
            {item.student_label}
          </StudentCardLink>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-muted-foreground">{item.lessonType.name}</span>
            <span className="text-zinc-300">·</span>
            <span className="text-muted-foreground">
              {formatReportDateTime(
                item.slot.start_time,
                item.instructor.timezone,
              )}
            </span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
              {getBookingCategoryLabel(item.booking_category)}
            </span>
            {showSource && (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-700">
                {item.school?.color && (
                  <span
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: item.school.color }}
                  />
                )}
                {item.school?.name ?? "Без источника"}
              </span>
            )}
          </div>
          {showMoney && item.price_amount !== null && (
            <p className="mt-1 text-xs font-medium text-zinc-600">
              К оплате: {formatMoney(item.price_amount)}
              {" · "}
              Получено: {formatMoney(item.paid_amount ?? 0)}
            </p>
          )}
        </div>
      </div>
      {showMoney && (
        <div className="pl-5 text-xs font-semibold sm:pl-0">
          {debt > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
              Долг {formatMoney(debt)}
            </span>
          ) : (
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
              Долга нет
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function SourceSettlementsCard({
  groups,
  from,
  to,
  instructorId,
}: {
  groups: SourceSettlementGroup[];
  from: string;
  to: string;
  instructorId: string;
}) {
  const totalCompleted = groups.reduce(
    (sum, group) => sum + group.completedCount,
    0,
  );
  const totalEarned = groups.reduce(
    (sum, group) => sum + group.earnedAmount,
    0,
  );
  const totalPaid = groups.reduce((sum, group) => sum + group.paidAmount, 0);
  const totalDebt = groups.reduce((sum, group) => sum + group.debtAmount, 0);

  return (
    <Card className="border-emerald-200 bg-emerald-50/40">
      <CardHeader className="pb-3">
        <CardTitle>Расчёты с автошколами</CardTitle>
        <CardDescription>
          Проведённые занятия по источникам за период {formatReportDate(from)} —{" "}
          {formatReportDate(to)}. Здесь видно, кто уже рассчитался и какой
          остаток к выплате.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Проведено</p>
            <p className="mt-1 font-semibold">{totalCompleted}</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">К начислению</p>
            <p className="mt-1 font-semibold">{formatMoney(totalEarned)}</p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-emerald-700">Получено</p>
            <p className="mt-1 font-semibold text-emerald-900">
              {formatMoney(totalPaid)}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-amber-700">Остаток</p>
            <p className="mt-1 font-semibold text-amber-900">
              {formatMoney(totalDebt)}
            </p>
          </div>
        </div>

        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-4 py-8 text-center text-sm text-zinc-500">
            За выбранный период проведённых занятий по источникам нет.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b">
                  <th className="px-3 py-3 font-semibold">Источник</th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Проведено
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    К начислению
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Получено
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Остаток
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Без цены
                  </th>
                  <th className="px-3 py-3 text-right font-semibold">
                    Расчёт
                  </th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <tr key={group.id} className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <div className="flex min-w-0 items-center gap-2">
                        {group.color && (
                          <span
                            className="size-3 shrink-0 rounded-full border border-black/10"
                            style={{ backgroundColor: group.color }}
                          />
                        )}
                        <span className="truncate font-semibold">
                          {group.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {group.completedCount}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      {formatMoney(group.earnedAmount)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-800">
                      {formatMoney(group.paidAmount)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-amber-800">
                      {formatMoney(group.debtAmount)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-zinc-500">
                      {group.missingPriceCount || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {group.debtAmount > 0 && group.id !== "without-source" ? (
                        <SourceSettlementButton
                          instructorId={instructorId}
                          schoolId={group.id}
                          sourceLabel={group.label}
                          from={from}
                          to={to}
                          expectedCount={group.debtCount}
                          expectedAmount={group.debtAmount}
                        />
                      ) : (
                        <span className="text-xs text-zinc-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs leading-5 text-emerald-950/70">
          Кнопка расчёта закрывает только проведённые занятия с остатком к
          выплате. Уже оплаченные записи повторно не меняются.
        </p>
      </CardContent>
    </Card>
  );
}

export default async function AdminReportsPage({
  searchParams,
}: AdminReportsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireActiveOrganizationMember();
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend || hasSupabaseAdminKey();
  const isInstructorPayoutReport =
    postgresBackend && membership.isInstructor && !membership.isOwnerOrAdmin;
  const isOwnerInstructorReport =
    postgresBackend && membership.role === "owner" && Boolean(membership.instructorId);
  let instructors: Instructor[] = [];
  let lessonTypes: ReportLessonType[] = [];
  let schools: School[] = [];
  let studentAccesses: {
    id: string;
    display_label: string;
    instructor_id: string;
    school_id: string | null;
    is_archived: boolean;
  }[] = [];
  let scheduleDays: ScheduleDay[] = [];
  let slots: ReportSlot[] = [];
  let bookings: ReportBooking[] = [];
  let loadError: { message: string } | null = null;

  if (postgresBackend) {
    instructors = await queryRows<Instructor>(
      `
        select id, name, slug, public_name, timezone
        from public.instructors
        where organization_id = $1
          and is_active = true
          and ($2::uuid is null or id = $2::uuid)
        order by name
      `,
      [
        membership.organizationId,
        membership.isInstructor ? membership.instructorId : null,
      ],
    );
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: instructorData, error: instructorError } =
      await buildActiveInstructorsQuery(supabase, membership);

    instructors = (instructorData ?? []) as Instructor[];
    loadError = instructorError;
  }

  const firstInstructor = instructors[0] ?? null;
  const timezone = firstInstructor?.timezone ?? DEFAULT_TIMEZONE;
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
    !isInstructorPayoutReport &&
    (params.payment === "paid" || params.payment === "unpaid")
      ? params.payment
      : "all";
  const selectedLessonState =
    params.lessonState === "scheduled" ||
    params.lessonState === "completed" ||
    params.lessonState === "no_show"
      ? params.lessonState
      : "all";
  const selectedBookingCategory =
    params.bookingCategory === "regular" ||
    params.bookingCategory === "extra" ||
    params.bookingCategory === "gift"
      ? params.bookingCategory
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
  await autoCompletePastBookings({ instructorIds: reportInstructorIds });

  const [
    instructorPayoutPeriodSummary,
    instructorPayoutEntries,
    instructorPayoutPayments,
  ] =
    isInstructorPayoutReport && selectedInstructor
      ? await Promise.all([
          queryRows<InstructorPayoutPeriodSummary>(
            `
              select coalesce(sum(entries.amount), 0)::integer as planned_amount,
                     coalesce(sum(entries.paid_amount), 0)::integer as paid_amount,
                     greatest(
                       coalesce(
                         sum(entries.amount - entries.paid_amount)
                           filter (where bookings.lesson_state = 'completed'),
                         0
                       ),
                       0
                     )::integer as remaining_amount
              from public.instructor_payout_entry_balances entries
              left join public.bookings bookings on bookings.id = entries.booking_id
              where entries.organization_id = $1
                and entries.instructor_id = $2
                and entries.status = 'planned'
                and coalesce(entries.event_at, entries.planned_at)::date >= $3::date
                and coalesce(entries.event_at, entries.planned_at)::date <= $4::date
            `,
            [membership.organizationId, selectedInstructor.id, from, to],
          ).then(
            (rows) =>
              rows[0] ?? {
                planned_amount: 0,
                paid_amount: 0,
                remaining_amount: 0,
              },
          ),
          queryRows<InstructorPayoutEntryDetail>(
            `
              select entries.id::text,
                     entries.amount,
                     entries.paid_amount,
                     case
                       when bookings.lesson_state = 'completed'
                         then greatest(entries.remaining_amount, 0)
                       else 0
                     end as remaining_amount,
                     entries.entry_type,
                     entries.planned_at::text as planned_at,
                     entries.event_at::text as event_at,
                     bookings.student_label,
                     lesson_types.name as lesson_type_name,
                     schools.name as school_name,
                     bookings.booking_category,
                     bookings.lesson_state
              from public.instructor_payout_entry_balances entries
              left join public.bookings bookings on bookings.id = entries.booking_id
              left join public.lesson_types lesson_types
                on lesson_types.id = entries.lesson_type_id
              left join public.schools schools on schools.id = entries.school_id
              where entries.organization_id = $1
                and entries.instructor_id = $2
                and entries.status = 'planned'
                and coalesce(entries.event_at, entries.planned_at)::date >= $3::date
                and coalesce(entries.event_at, entries.planned_at)::date <= $4::date
              order by coalesce(entries.event_at, entries.planned_at), entries.created_at
            `,
            [membership.organizationId, selectedInstructor.id, from, to],
          ),
          queryRows<InstructorPayoutPaymentDetail>(
            `
              with period_entries as (
                select id
                from public.instructor_payout_entries
                where organization_id = $1
                  and instructor_id = $2
                  and status = 'planned'
                  and coalesce(event_at, planned_at)::date >= $3::date
                  and coalesce(event_at, planned_at)::date <= $4::date
              )
              select payments.id::text,
                     payments.paid_at::text as paid_at,
                     coalesce(sum(allocations.amount), 0)::integer as amount,
                     payments.payment_note
              from public.instructor_payout_payment_allocations allocations
              join period_entries entries on entries.id = allocations.payout_entry_id
              join public.instructor_payout_payments payments
                on payments.id = allocations.payment_id
              group by payments.id
              order by payments.paid_at desc, payments.created_at desc
            `,
            [membership.organizationId, selectedInstructor.id, from, to],
          ),
        ])
      : [
          null,
          [],
          [],
        ];

  if (postgresBackend) {
    const [
      lessonTypeData,
      schoolData,
      studentAccessData,
      scheduleDayData,
    ] = await Promise.all([
      queryRows<LessonType>(
        `
          select id, code, name, color, kind, tags, default_duration_minutes
          from public.lesson_types
          order by sort_order, name
        `,
      ),
      queryRows<School>(
        `
          select id, organization_id, name, color, default_price, payment_rule,
                 is_active, created_at::text as created_at, updated_at::text as updated_at
          from public.schools
          where organization_id = $1
          order by name
        `,
        [membership.organizationId],
      ),
      reportInstructorIds.length > 0
        ? queryRows<{
            id: string;
            display_label: string;
            instructor_id: string;
            school_id: string | null;
            is_archived: boolean;
          }>(
            `
              select id, display_label, instructor_id, school_id, is_archived
              from public.student_accesses
              where organization_id = $1
                and instructor_id = any($2::uuid[])
              order by display_label
            `,
            [membership.organizationId, reportInstructorIds],
          )
        : Promise.resolve([]),
      reportInstructorIds.length > 0
        ? queryRows<ScheduleDay>(
            `
              select id, instructor_id, date::text as date
              from public.schedule_days
              where instructor_id = any($1::uuid[])
                and date >= $2::date
                and date <= $3::date
            `,
            [reportInstructorIds, from, to],
          )
        : Promise.resolve([]),
    ]);

    lessonTypes = getSchedulableLessonTypes(lessonTypeData);
    schools = schoolData;
    studentAccesses = studentAccessData;
    scheduleDays = scheduleDayData;
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const [
      { data: lessonTypeData, error: lessonTypeError },
      { data: schoolData, error: schoolError },
      { data: studentAccessData, error: studentAccessError },
      { data: scheduleDayData, error: scheduleDayError },
    ] = await Promise.all([
      supabase
        .from("lesson_types")
        .select("id, code, name, color, kind, tags")
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

    lessonTypes = getSchedulableLessonTypes(
      (lessonTypeData ?? []) as LessonType[],
    );
    schools = (schoolData ?? []) as School[];
    studentAccesses = (studentAccessData ?? []) as typeof studentAccesses;
    scheduleDays = (scheduleDayData ?? []) as ScheduleDay[];
    loadError =
      loadError ??
      lessonTypeError ??
      schoolError ??
      studentAccessError ??
      scheduleDayError;
  }

  const selectedLessonTypeId =
    params.lessonType && params.lessonType !== "all" ? params.lessonType : "all";
  const scheduleDayIds = scheduleDays.map((day) => day.id);

  if (postgresBackend) {
    slots =
      scheduleDayIds.length > 0
        ? await queryRows<ReportSlot>(
            `
              select id, instructor_id, schedule_day_id, lesson_type_id,
                     start_time::text as start_time, end_time::text as end_time
              from public.slots
              where schedule_day_id = any($1::uuid[])
                and status <> 'cancelled'
              order by start_time
            `,
            [scheduleDayIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
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

    slots = (slotData ?? []) as ReportSlot[];
    loadError = loadError ?? slotError;
  }

  if (selectedLessonTypeId !== "all") {
    slots = slots.filter((slot) => slot.lesson_type_id === selectedLessonTypeId);
  }

  const slotIds = slots.map((slot) => slot.id);

  if (postgresBackend) {
    bookings =
      slotIds.length > 0
        ? await queryRows<ReportBooking>(
            `
              select id, slot_id, student_label, student_access_id, school_id,
                     price_amount, paid_amount, is_paid, paid_at::text as paid_at,
                     booking_category, lesson_state, completed_at::text as completed_at,
                     direct_instructor_income_amount,
                     direct_instructor_income_recognized_at::text
                       as direct_instructor_income_recognized_at
              from public.bookings
              where slot_id = any($1::uuid[])
                and status = 'confirmed'
            `,
            [slotIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: bookingData, error: bookingError } =
      adminEnabled && slotIds.length > 0
        ? await supabase
            .from("bookings")
            .select("id, slot_id, student_label, student_access_id, school_id, price_amount, paid_amount, is_paid, paid_at, booking_category, lesson_state, completed_at")
            .in("slot_id", slotIds)
            .eq("status", "confirmed")
        : { data: [], error: null };

    bookings = (bookingData ?? []) as ReportBooking[];
    loadError = loadError ?? bookingError;
  }

  if (selectedStudentId !== "all") {
    bookings = bookings.filter(
      (booking) => booking.student_access_id === selectedStudentId,
    );
  }

  const studentAccessesById = new Map(
    studentAccesses.map((access) => [access.id, access]),
  );

  if (selectedSchoolId !== "all") {
    bookings = bookings.filter((booking) => {
      const bookingSchoolId =
        booking.school_id ??
        (booking.student_access_id
          ? studentAccessesById.get(booking.student_access_id)?.school_id
          : null);

      return bookingSchoolId === selectedSchoolId;
    });
  }

  if (selectedBookingCategory !== "all") {
    bookings = bookings.filter(
      (booking) => booking.booking_category === selectedBookingCategory,
    );
  }

  const settlementBookings = [...bookings];

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
  const buildReportItem = (booking: ReportBooking): ReportItem | null => {
    const slot = slotsById.get(booking.slot_id);
    if (!slot) return null;

    const scheduleDay = scheduleDaysById.get(slot.schedule_day_id);
    const lessonType = lessonTypesById.get(slot.lesson_type_id);
    const instructor = instructorsById.get(slot.instructor_id);
    if (!scheduleDay || !lessonType || !instructor) return null;
    const access = booking.student_access_id
      ? studentAccessesById.get(booking.student_access_id)
      : null;

    return {
      ...booking,
      slot,
      scheduleDay,
      lessonType,
      instructor,
      school: booking.school_id
        ? schoolsById.get(booking.school_id) ?? null
        : access?.school_id
          ? schoolsById.get(access.school_id) ?? null
          : null,
    };
  };
  const reportItems = bookings
    .map(buildReportItem)
    .filter((item): item is ReportItem => Boolean(item));
  const directIncomeItems = reportItems.filter(
    (item) =>
      item.direct_instructor_income_amount !== null &&
      Boolean(item.direct_instructor_income_recognized_at),
  );
  const directIncomeAmount = directIncomeItems.reduce(
    (sum, item) => sum + (item.direct_instructor_income_amount ?? 0),
    0,
  );
  const examRouteItems =
    isOwnerInstructorReport && selectedInstructor
      ? await queryRows<ExamRouteReportItem>(
          `
            select entries.booking_id::text,
                   coalesce(accesses.display_label, bookings.student_label, 'Без ученика') as student_label,
                   coalesce(schools.name, 'Без автошколы') as school_name,
                   coalesce(lesson_types.name, 'Тип занятия не указан') as lesson_type_name,
                   days.date::text as lesson_date,
                   slots.start_time::text as start_time,
                   entries.amount
            from public.instructor_payout_entry_balances entries
            join public.bookings bookings on bookings.id = entries.booking_id
            join public.slots slots on slots.id = bookings.slot_id
            join public.schedule_days days on days.id = slots.schedule_day_id
            left join public.student_accesses accesses on accesses.id = entries.student_access_id
            left join public.schools schools on schools.id = entries.school_id
            left join public.lesson_types lesson_types on lesson_types.id = entries.lesson_type_id
            where entries.organization_id = $1
              and entries.instructor_id = $2
              and entries.status = 'planned'
              and entries.note = 'Экзаменационный маршрут: начисление за 2 занятия'
              and days.date between $3::date and $4::date
            order by days.date, slots.start_time, student_label
          `,
          [membership.organizationId, selectedInstructor.id, from, to],
        )
      : [];
  const settlementItems = settlementBookings
    .map(buildReportItem)
    .filter((item): item is ReportItem => Boolean(item))
    .filter((item) => item.lesson_state === "completed");

  const byLessonType = new Map<string, ReportGroup>();
  const byBookingCategory = new Map<string, ReportGroup>();
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
    addToGroup(
      byBookingCategory,
      item.booking_category,
      getBookingCategoryLabel(item.booking_category),
      item,
    );
    addToGroup(
      byStudent,
      item.student_access_id ?? item.student_label,
      item.student_label,
      item,
      undefined,
      { studentAccessId: item.student_access_id },
    );
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
  const bookingCategoryGroups = [...byBookingCategory.values()].sort(
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
  const completedPaidAmount = completedItems.reduce(
    (sum, item) => sum + getItemPaidAmount(item),
    0,
  );
  const completedDebtAmount = completedItems.reduce(
    (sum, item) => sum + getItemDebtAmount(item),
    0,
  );
  const plannedPaidAmount = plannedItems.reduce(
    (sum, item) => sum + getItemPaidAmount(item),
    0,
  );
  const plannedDebtAmount = plannedItems.reduce(
    (sum, item) => sum + getItemDebtAmount(item),
    0,
  );
  const totalStudentAmount = reportItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const zeroPriceItems = reportItems.filter((item) => (item.price_amount ?? 0) === 0);
  const zeroPriceStudents = new Map<
    string,
    {
      id: string | null;
      label: string;
      count: number;
      completedCount: number;
      scheduledCount: number;
      sources: Set<string>;
    }
  >();

  for (const item of zeroPriceItems) {
    const id = item.student_access_id ?? item.student_label;
    const current = zeroPriceStudents.get(id) ?? {
      id: item.student_access_id,
      label: item.student_label,
      count: 0,
      completedCount: 0,
      scheduledCount: 0,
      sources: new Set<string>(),
    };
    current.count += 1;
    if (item.lesson_state === "completed") current.completedCount += 1;
    if (item.lesson_state === "scheduled") current.scheduledCount += 1;
    current.sources.add(item.school?.name ?? "Частные занятия");
    zeroPriceStudents.set(id, current);
  }

  const zeroPriceStudentGroups = [...zeroPriceStudents.values()].sort(
    (first, second) => second.count - first.count || first.label.localeCompare(second.label, "ru"),
  );
  const debtGroupsByStudent = new Map<string, DebtGroup>();

  for (const item of reportItems) {
    const itemDebt = getItemDebtAmount(item);

    if (itemDebt <= 0) {
      continue;
    }

    const current =
      debtGroupsByStudent.get(item.student_access_id ?? item.student_label) ??
      ({
        id: item.student_access_id ?? item.student_label,
        label: item.student_label,
        studentAccessId: item.student_access_id,
        sourceSummaries: [],
        amount: 0,
        count: 0,
      } satisfies DebtGroup);

    const sourceId = item.school?.id ?? "without-source";
    if (!current.sourceSummaries.some((source) => source.id === sourceId)) {
      current.sourceSummaries.push({
        id: sourceId,
        label: item.school?.name ?? "Без источника",
        color: item.school?.color,
      });
    }

    current.amount += itemDebt;
    current.count += 1;
    debtGroupsByStudent.set(item.student_access_id ?? item.student_label, current);
  }

  const debtGroups = [...debtGroupsByStudent.values()].sort(
    (first, second) => second.amount - first.amount,
  );
  const sourceSettlementsById = new Map<string, SourceSettlementGroup>();

  for (const item of settlementItems) {
    const sourceId = item.school?.id ?? "without-source";
    const current =
      sourceSettlementsById.get(sourceId) ??
      ({
        id: sourceId,
        label: item.school?.name ?? "Без источника",
        color: item.school?.color,
        completedCount: 0,
        debtCount: 0,
        earnedAmount: 0,
        paidAmount: 0,
        debtAmount: 0,
        missingPriceCount: 0,
      } satisfies SourceSettlementGroup);

    current.completedCount += 1;
    current.earnedAmount += item.price_amount ?? 0;
    current.paidAmount += getItemPaidAmount(item);
    const itemDebt = getItemDebtAmount(item);
    current.debtAmount += itemDebt;

    if (itemDebt > 0) {
      current.debtCount += 1;
    }

    if (item.price_amount === null) {
      current.missingPriceCount += 1;
    }

    sourceSettlementsById.set(sourceId, current);
  }

  const sourceSettlementGroups = [...sourceSettlementsById.values()].sort(
    (first, second) => second.debtAmount - first.debtAmount,
  );

  // Sort report items by date desc for the booking list
  const sortedReportItems = [...reportItems].sort(
    (a, b) =>
      new Date(b.slot.start_time).getTime() -
      new Date(a.slot.start_time).getTime(),
  );

  const selectedLessonTypeLabel =
    selectedLessonTypeId === "all"
      ? "Все типы слотов"
      : lessonTypes.find((lessonType) => lessonType.id === selectedLessonTypeId)
          ?.name ?? "Тип не найден";
  const selectedBookingCategoryLabel =
    selectedBookingCategory === "all"
      ? "Все категории"
      : getBookingCategoryLabel(selectedBookingCategory as BookingCategory);
  const selectedSchool = schools.find((school) => school.id === selectedSchoolId);
  const selectedSchoolLabel =
    selectedSchoolId === "all"
      ? "Все автошколы"
      : selectedSchool?.name ?? "Источник не найден";
  const selectedStudentLabel =
    selectedStudentId === "all"
      ? "Все ученики"
      : studentAccesses.find((student) => student.id === selectedStudentId)
          ?.display_label ?? "Ученик не найден";
  const selectedPaymentLabel =
    selectedPayment === "paid"
      ? "Только оплаченные"
      : selectedPayment === "unpaid"
        ? "Только долги"
        : "Все оплаты";
  const selectedLessonStateLabel =
    selectedLessonState === "scheduled"
      ? "Запланированные"
      : selectedLessonState === "completed"
        ? "Проведённые"
        : selectedLessonState === "no_show"
          ? "Неявки"
          : "Все занятия";
  const filterChips = [
    `Тип слота: ${selectedLessonTypeLabel}`,
    `Категория: ${selectedBookingCategoryLabel}`,
    `Автошкола: ${selectedSchoolLabel}`,
    `Ученик: ${selectedStudentLabel}`,
    ...(isInstructorPayoutReport ? [] : [`Оплата: ${selectedPaymentLabel}`]),
    `Статус: ${selectedLessonStateLabel}`,
  ];
  const exportParams = new URLSearchParams({
    from,
    to,
    lessonType: selectedLessonTypeId,
    school: selectedSchoolId,
    student: selectedStudentId,
    payment: selectedPayment,
    lessonState: selectedLessonState,
    bookingCategory: selectedBookingCategory,
  });
  const exportHref = `/admin/reports/export?${exportParams.toString()}`;
  const reportItemGroupsBySource = [
    ...sortedReportItems
      .reduce((map, item) => {
        const sourceId = item.school?.id ?? "without-source";
        const current =
          map.get(sourceId) ??
          ({
            id: sourceId,
            label: item.school?.name ?? "Без источника",
            color: item.school?.color,
            items: [],
            amount: 0,
            paidAmount: 0,
            debtAmount: 0,
          } satisfies ReportItemSourceGroup);

        current.items.push(item);
        current.amount += item.price_amount ?? 0;
        current.paidAmount += getItemPaidAmount(item);
        current.debtAmount += getItemDebtAmount(item);
        map.set(sourceId, current);

        return map;
      }, new Map<string, ReportItemSourceGroup>())
      .values(),
  ].sort((first, second) => first.label.localeCompare(second.label, "ru"));

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">

        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-6">
          <div>
            <p className="text-muted-foreground text-sm font-medium">
              {isInstructorPayoutReport ? "Итоги выплат" : "Итоги и деньги"}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Итоги
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {isInstructorPayoutReport
                ? "Начисления и выплаты от руководителя за выбранный период."
                : "Деньги, долги и занятия за выбранный период."}
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

        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Период</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                {formatReportDate(from)} — {formatReportDate(to)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {filterChips.map((chip) => (
                  <span
                    key={chip}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-700"
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </div>
            <form className="flex gap-2 sm:min-w-[360px]">
              <HiddenFilterFields
                selectedLessonTypeId={selectedLessonTypeId}
                selectedSchoolId={selectedSchoolId}
                selectedStudentId={selectedStudentId}
                selectedPayment={selectedPayment}
                selectedLessonState={selectedLessonState}
                selectedBookingCategory={selectedBookingCategory}
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
                <Label htmlFor="report-lesson-type">Тип слота</Label>
                <select
                  id="report-lesson-type"
                  name="lessonType"
                  className={selectClassName}
                  defaultValue={selectedLessonTypeId}
                >
                  <option value="all">Все типы слотов</option>
                  {lessonTypes.map((lessonType) => (
                    <option key={lessonType.id} value={lessonType.id}>
                      {lessonType.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label htmlFor="report-booking-category">Категория записи</Label>
                <select
                  id="report-booking-category"
                  name="bookingCategory"
                  className={selectClassName}
                  defaultValue={selectedBookingCategory}
                >
                  <option value="all">Все категории</option>
                  {bookingCategoryOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
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

              {!isInstructorPayoutReport && (
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
              )}

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

        {isInstructorPayoutReport ? (
          <section className="space-y-3">
            <div className="grid gap-3 md:grid-cols-4">
              <SummaryCard
                label="Начислено"
                value={formatMoney(instructorPayoutPeriodSummary?.planned_amount ?? 0)}
                hint="Сколько школа должна за период"
              />
              <SummaryCard
                label="Выплачено"
                value={formatMoney(instructorPayoutPeriodSummary?.paid_amount ?? 0)}
                hint="Руководитель отметил выдачу денег"
                tone="emerald"
              />
              <SummaryCard
                label="Осталось получить"
                value={formatMoney(
                  instructorPayoutPeriodSummary?.remaining_amount ?? 0,
                )}
                hint="Только за проведённые занятия"
                tone="amber"
              />
              <SummaryCard
                label="Доп. заработок"
                value={formatMoney(directIncomeAmount)}
                hint={`Частные дополнительные занятия: ${directIncomeItems.length}`}
                tone="emerald"
              />
            </div>
            <Card className="border-blue-200 bg-blue-50/60">
              <CardContent className="p-4 text-sm leading-6 text-blue-950">
                Начислено — сумма за занятия выбранного периода, и проведённые,
                и непроведённые. Выплачено — деньги, которые руководитель уже
                отметил как выданные, то есть вы их уже получили. Осталось
                получить — сколько ещё школа должна вам; считается только по
                фактически проведённым занятиям. Доп. заработок — ваши частные
                дополнительные занятия; он считается автоматически и не входит
                в долг школы перед вами.
              </CardContent>
            </Card>
            <InstructorPayoutDetails
              entries={instructorPayoutEntries}
              payments={instructorPayoutPayments}
              timezone={timezone}
            />
          </section>
        ) : isOwnerInstructorReport ? (
          <section className="space-y-3">
            <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold text-blue-950">Деньги за занятия</h2>
                <p className="mt-1 text-sm leading-5 text-blue-900/80">
                  В общий долг входят и будущие занятия. Текущий долг смотрите в блоке «За проведённые занятия».
                </p>
              </div>
              <a
                href={exportHref}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-900"
              >
                <Download className="size-4" />
                Скачать отчёт для Excel
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard
                label="Стоимость всех занятий"
                value={formatMoney(totalStudentAmount)}
                hint={`${reportItems.length} подтверждённых записей`}
              />
              <SummaryCard
                label="Получено от учеников"
                value={formatMoney(paidAmount)}
                hint={`${paidCount} записей с оплатой`}
                tone="emerald"
              />
              <SummaryCard
                label="Общий долг"
                value={formatMoney(debtAmount)}
                hint="За проведённые и будущие занятия"
                tone="amber"
              />
            </div>

            <ExamRouteDetails items={examRouteItems} />

            <div className="grid gap-3 md:grid-cols-2">
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardHeader className="pb-3">
                  <CardTitle>За проведённые занятия</CardTitle>
                  <CardDescription>
                    Это фактический долг за уже проведённую работу.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-3">
                  <MetricTile
                    label="Стоимость"
                    value={formatMoney(earnedAmount)}
                    hint={`${completedItems.length} занятий`}
                  />
                  <MetricTile
                    label="Получено"
                    value={formatMoney(completedPaidAmount)}
                    hint={`${completedItems.filter((item) => getItemPaidAmount(item) > 0).length} занятий с оплатой`}
                    tone="emerald"
                  />
                  <MetricTile
                    label="Осталось получить"
                    value={formatMoney(completedDebtAmount)}
                    hint={`${completedItems.filter((item) => getItemDebtAmount(item) > 0).length} занятий с долгом`}
                    tone="amber"
                  />
                </CardContent>
              </Card>
              <Card className="border-sky-200 bg-sky-50/50">
                <CardHeader className="pb-3">
                  <CardTitle>Будущие занятия</CardTitle>
                  <CardDescription>
                    Эта сумма ещё не является текущим долгом за проведённую работу.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-3">
                  <MetricTile
                    label="Стоимость"
                    value={formatMoney(plannedAmount)}
                    hint={`${plannedItems.length} занятий`}
                  />
                  <MetricTile
                    label="Оплачено заранее"
                    value={formatMoney(plannedPaidAmount)}
                    hint={`${plannedItems.filter((item) => getItemPaidAmount(item) > 0).length} занятий с оплатой`}
                    tone="emerald"
                  />
                  <MetricTile
                    label="Не оплачено"
                    value={formatMoney(plannedDebtAmount)}
                    hint={`${plannedItems.filter((item) => getItemDebtAmount(item) > 0).length} занятий с долгом`}
                    tone="amber"
                  />
                </CardContent>
              </Card>
            </div>

            {zeroPriceItems.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-3">
                  <CardTitle>Занятия без стоимости</CardTitle>
                  <CardDescription>
                    Эти записи входят в общее количество занятий, но не входят ни в оплату, ни в долг.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <MetricTile
                      label="Всего занятий без стоимости"
                      value={`${zeroPriceItems.length}`}
                      hint="Стоимость каждой записи — 0 ₽"
                      tone="amber"
                    />
                    <MetricTile
                      label="Учеников"
                      value={`${zeroPriceStudentGroups.length}`}
                      hint="Есть хотя бы одна запись без стоимости"
                    />
                  </div>
                  <div className="divide-y rounded-xl border bg-white">
                    {zeroPriceStudentGroups.map((student) => (
                      <div
                        key={student.label}
                        className="flex flex-col gap-1 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <StudentCardLink
                            studentAccessId={student.id}
                            className="font-semibold"
                          >
                            {student.label}
                          </StudentCardLink>
                          <p className="text-muted-foreground text-xs">
                            {student.sources.size > 0
                              ? [...student.sources].join(", ")
                              : "Источник не указан"}
                          </p>
                        </div>
                        <p className="text-amber-900 sm:text-right">
                          <span className="font-semibold">{student.count} занятий</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            {student.completedCount} проведено, {student.scheduledCount} запланировано
                          </span>
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </section>
        ) : (
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
        )}

        {!isInstructorPayoutReport && (
          <SourceSettlementsCard
            groups={sourceSettlementGroups}
            from={from}
            to={to}
            instructorId={selectedInstructor?.id ?? ""}
          />
        )}

        {!isInstructorPayoutReport && missingPriceCount > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            В отчёте есть записи без суммы. Обычно это старые записи, созданные
            до добавления цен. Их можно учитывать как 0 ₽ или позже добавить
            ручное редактирование суммы.
          </div>
        )}

        {!isInstructorPayoutReport && (
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
                        <StudentCardLink
                          studentAccessId={group.studentAccessId}
                          className="block truncate font-semibold"
                        >
                          {group.label}
                        </StudentCardLink>
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {group.count} неоплаченных занятий
                        </p>
                        {group.sourceSummaries.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {group.sourceSummaries.map((source) => (
                              <span
                                key={source.id}
                                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700"
                              >
                                {source.color && (
                                  <span
                                    className="size-1.5 rounded-full"
                                    style={{ backgroundColor: source.color }}
                                  />
                                )}
                                {source.label}
                              </span>
                            ))}
                          </div>
                        )}
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
        )}

        {!isInstructorPayoutReport && (
          <>
            <GroupTable
              title="По типам занятий"
              description="Физический тип слота: вождение или теория."
              groups={lessonTypeGroups}
            />

            <GroupTable
              title="По категориям записей"
              description="Обычные, дополнительные и подарочные занятия."
              groups={bookingCategoryGroups}
            />

            <GroupTable
              title="По автошколам"
              description="Источник занятия: автошкола или частные записи."
              groups={schoolGroups}
            />
          </>
        )}

        {false && membership.isOwnerOrAdmin && selectedInstructorId === "all" && (
          <GroupTable
            title="По инструкторам"
            description="Сводка по каждому инструктору в выбранном периоде."
            groups={instructorGroups}
          />
        )}

        {!isInstructorPayoutReport && (
          <GroupTable
            title="По ученикам"
            description="По метке ученика или учебному доступу."
            groups={studentGroups}
            showSources
          />
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Все записи за период</CardTitle>
            <CardDescription>
              {isInstructorPayoutReport
                ? "Список занятий за выбранный период без клиентских оплат."
                : "Полный список с возможностью отметить оплату прямо здесь."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sortedReportItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                Нет записей за выбранный период.
              </div>
            ) : selectedSchoolId === "all" ? (
              <div className="space-y-3">
                {reportItemGroupsBySource.map((group) => (
                  <section
                    key={group.id}
                    className="overflow-hidden rounded-2xl border bg-zinc-50/70"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b bg-white px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {group.color && (
                            <span
                              className="size-2.5 rounded-full border border-black/10"
                              style={{ backgroundColor: group.color }}
                            />
                          )}
                          <h3 className="truncate text-sm font-semibold">
                            {group.label}
                          </h3>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs">
                          {group.items.length} записей
                        </p>
                      </div>
                      {!isInstructorPayoutReport && (
                        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-zinc-700">
                            К оплате {formatMoney(group.amount)}
                          </span>
                          <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">
                            Получено {formatMoney(group.paidAmount)}
                          </span>
                          {group.debtAmount > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                              Долг {formatMoney(group.debtAmount)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="divide-y bg-white">
                      {group.items.map((item) => (
                        <ReportItemRow
                          key={item.id}
                          item={item}
                          showMoney={!isInstructorPayoutReport}
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {sortedReportItems.map((item) => (
                  <ReportItemRow
                    key={item.id}
                    item={item}
                    showMoney={!isInstructorPayoutReport}
                  />
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
            {isInstructorPayoutReport
              ? "Начислено показывает сумму за занятия выбранного периода, и проведённые, и непроведённые. Выплачено показывает деньги, которые руководитель уже отметил как выданные, то есть вы их уже получили. Осталось получить — сколько ещё школа должна вам; считается только по фактически проведённым занятиям."
              : "План считается по запланированным занятиям. Заработано считается только по проведённым занятиям. Получено и долг считаются по всем подтверждённым записям выбранного периода, потому что оплату могут внести до занятия."}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
