import Link from "next/link";
import { CircleDollarSign, Download } from "lucide-react";
import {
  cancelDirectorReportPayoutPaymentAction,
  createDirectorInstructorReturnAction,
  createDirectorReportPayoutPaymentAction,
  markDirectorInstructorDebtWithholdingAction,
} from "@/app/director/reports/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { CancelPayoutButton } from "@/components/director/cancel-payout-button";
import { InstructorDebtActions } from "@/components/director/instructor-debt-actions";
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
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import { isPostgresBackend } from "@/lib/backend-mode";
import {
  formatDateValue,
  formatHours,
  formatMoney,
  formatNumericDate,
  formatTime,
  getLocalDate,
  selectClassName,
} from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { getBookingCategoryLabel } from "@/lib/booking-categories";
import { queryRows } from "@/lib/db/postgres";
import {
  getOwnerInstructorIds,
  getOwnerPayoutPolicy,
} from "@/lib/instructor-payouts";
import {
  getStudentPrepaymentCashGroups,
  type StudentPrepaymentCashGroup,
} from "@/lib/student-prepayment-report";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type {
  Booking,
  BookingCategory,
  Instructor,
  LessonState,
  ScheduleDay,
  School,
  Slot,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type DirectorReportsPageProps = {
  searchParams?: Promise<{
    period?: string;
    from?: string;
    to?: string;
    instructor?: string;
    payout?: string;
  }>;
};

type ReportSlot = Pick<
  Slot,
  "id" | "instructor_id" | "schedule_day_id" | "start_time" | "end_time"
>;

type ReportBooking = Pick<Booking, "id" | "slot_id" | "student_label"> & {
  student_access_id: string | null;
  school_id: string | null;
  price_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean;
  booking_category: BookingCategory;
  lesson_state: LessonState;
  direct_instructor_income_amount: number | null;
  direct_instructor_income_recognized_at: string | null;
  prepaid_credit_id: string | null;
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
  totalStudentAmount: number;
  plannedAmount: number;
  earnedAmount: number;
  paidAmount: number;
  debtAmount: number;
  instructorPayoutAmount: number;
  instructorPaidAmount: number;
  instructorRemainingAmount: number;
  directInstructorIncomeAmount: number;
  directStudentPaidAmount: number;
  directStudentPriceAmount: number;
  marginAmount: number;
};

type PayoutGroup = {
  id: string;
  amount: number;
  paid_amount: number;
  remaining_amount: number;
  prepaid_lesson_count?: number;
  prepaid_amount?: number;
  prepaid_unit_amount_min?: number | null;
  prepaid_unit_amount_max?: number | null;
  withhold_amount?: number;
};

type PayoutStudentBalanceItem = {
  instructor_id: string;
  student_access_id: string | null;
  student_label: string;
  remaining_amount: number;
  booking_entry_count: number;
  prepaid_entry_count: number;
  adjustment_entry_count: number;
};

type PayoutSummary = {
  amount: number;
  paid_amount: number;
  remaining_amount: number;
};

type InstructorPayoutQuickItem = PayoutGroup & {
  instructor: Instructor;
  studentBalances: PayoutStudentBalanceItem[];
};

type PayoutPaymentPeriodItem = {
  id: string;
  instructor_id: string;
  paid_at: string | null;
  amount: number;
  payment_note: string | null;
};

type PayoutReturnPeriodItem = {
  id: string;
  instructor_id: string;
  returned_at: string | null;
  amount: number;
  return_note: string | null;
};

type PrepaidCreditReportItem = {
  id: string;
  student_access_id: string;
  student_label: string;
  instructor_id: string;
  instructor_name: string;
  school_name: string;
  lesson_type_name: string;
  quantity: number;
  used_quantity: number;
  final_total_amount: number;
  paid_at: string;
  status: "active" | "cancelled";
  instructor_amount: number;
  instructor_paid_amount: number;
  instructor_returned_amount: number;
  instructor_remaining_amount: number;
  student_refunded_amount: number;
  student_refund_remaining_amount: number;
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

function formatPayoutDateTime(value: string | null) {
  if (!value) {
    return "Дата не указана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatStudentCount(count: number) {
  const remainder100 = count % 100;
  const remainder10 = count % 10;
  const label =
    remainder100 >= 11 && remainder100 <= 14
      ? "учеников"
      : remainder10 === 1
        ? "ученик"
        : remainder10 >= 2 && remainder10 <= 4
          ? "ученика"
          : "учеников";

  return `${count} ${label}`;
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

function getSchoolBookingPaidAmount(
  item: Pick<ReportBooking, "paid_amount" | "prepaid_credit_id">,
) {
  return item.prepaid_credit_id ? 0 : getPaidAmount(item);
}

function getDebtAmount(
  item: Pick<ReportBooking, "price_amount" | "paid_amount">,
) {
  return Math.max((item.price_amount ?? 0) - (item.paid_amount ?? 0), 0);
}

function hasDirectInstructorIncome(
  item: Pick<ReportBooking, "direct_instructor_income_amount">,
) {
  return item.direct_instructor_income_amount !== null;
}

function getRecognizedDirectIncomeAmount(
  item: Pick<
    ReportBooking,
    "direct_instructor_income_amount" | "direct_instructor_income_recognized_at"
  >,
) {
  return item.direct_instructor_income_recognized_at
    ? (item.direct_instructor_income_amount ?? 0)
    : 0;
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
      totalStudentAmount: 0,
      plannedAmount: 0,
      earnedAmount: 0,
      paidAmount: 0,
      debtAmount: 0,
      instructorPayoutAmount: 0,
      instructorPaidAmount: 0,
      instructorRemainingAmount: 0,
      directInstructorIncomeAmount: 0,
      directStudentPaidAmount: 0,
      directStudentPriceAmount: 0,
      marginAmount: 0,
    } satisfies MoneyGroup);

  current.count += 1;
  current.totalStudentAmount += item.price_amount ?? 0;
  current.paidAmount += getSchoolBookingPaidAmount(item);
  current.debtAmount += getDebtAmount(item);

  if (hasDirectInstructorIncome(item)) {
    current.directInstructorIncomeAmount +=
      getRecognizedDirectIncomeAmount(item);
    current.directStudentPaidAmount += getSchoolBookingPaidAmount(item);
    current.directStudentPriceAmount += item.price_amount ?? 0;
  }

  if (item.lesson_state === "scheduled") {
    current.plannedAmount += item.price_amount ?? 0;
  }

  if (item.lesson_state === "completed") {
    current.completedCount += 1;
    current.hours += getDurationHours(item.slot);
    current.earnedAmount += item.price_amount ?? 0;
  }

  current.marginAmount =
    current.paidAmount -
    current.directStudentPaidAmount -
    current.instructorPayoutAmount;

  map.set(key, current);
}

function addPrepaymentCashToGroup(
  map: Map<string, MoneyGroup>,
  key: string,
  label: string,
  cash: Pick<StudentPrepaymentCashGroup, "net_amount">,
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
      totalStudentAmount: 0,
      plannedAmount: 0,
      earnedAmount: 0,
      paidAmount: 0,
      debtAmount: 0,
      instructorPayoutAmount: 0,
      instructorPaidAmount: 0,
      instructorRemainingAmount: 0,
      directInstructorIncomeAmount: 0,
      directStudentPaidAmount: 0,
      directStudentPriceAmount: 0,
      marginAmount: 0,
    } satisfies MoneyGroup);

  current.paidAmount += cash.net_amount;
  current.marginAmount =
    current.paidAmount -
    current.directStudentPaidAmount -
    current.instructorPayoutAmount;
  map.set(key, current);
}

function attachPayoutsToGroups(
  groups: Map<string, MoneyGroup>,
  payoutGroups: PayoutGroup[],
) {
  for (const payout of payoutGroups) {
    const group = groups.get(payout.id);

    if (!group) {
      continue;
    }

    group.instructorPayoutAmount = payout.amount;
    group.instructorPaidAmount = payout.paid_amount;
    group.instructorRemainingAmount = payout.remaining_amount;
    group.marginAmount =
      group.paidAmount - group.directStudentPaidAmount - payout.amount;
  }
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

function MoneyGroupMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber" | "blue" | "red";
}) {
  const toneClassName =
    tone === "emerald"
      ? "bg-emerald-50 text-emerald-800"
      : tone === "amber"
        ? "bg-amber-50 text-amber-800"
        : tone === "blue"
          ? "bg-blue-50 text-blue-800"
          : tone === "red"
            ? "bg-red-50 text-red-800"
            : "bg-zinc-50 text-zinc-800";

  return (
    <div className={`rounded-xl px-3 py-2 ${toneClassName}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="mt-1 whitespace-nowrap text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function PayoutReturnFields({
  selectedPeriod,
  from,
  to,
  selectedInstructorId,
}: {
  selectedPeriod: string;
  from: string;
  to: string;
  selectedInstructorId: string;
}) {
  return (
    <>
      <input type="hidden" name="return_period" value={selectedPeriod} />
      <input type="hidden" name="return_from" value={from} />
      <input type="hidden" name="return_to" value={to} />
      <input type="hidden" name="return_instructor" value={selectedInstructorId} />
    </>
  );
}

function InstructorPayoutQuickPanel({
  items,
  selectedPeriod,
  from,
  to,
  selectedInstructorId,
  status,
}: {
  items: InstructorPayoutQuickItem[];
  selectedPeriod: string;
  from: string;
  to: string;
  selectedInstructorId: string;
  status?: string;
}) {
  if (items.length === 0 && !status) {
    return null;
  }

  const statusMessage =
    status === "paid"
      ? "Выдача денег инструктору отмечена."
      : status === "returned"
        ? "Возврат денег от инструктора отмечен."
      : status === "withheld"
        ? "Долг будет удержан из следующих выплат инструктору."
      : status === "cancelled"
        ? "Отметка выплаты отменена. Сумма снова доступна к выдаче."
      : status === "error"
        ? "Не удалось сохранить операцию. Проверьте сумму и текущий остаток."
        : null;

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Расчёты с инструкторами</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Открытый остаток по выплатам за всё время. Выдачу можно отметить прямо здесь.
          </p>
        </div>
        {statusMessage && (
          <div
            className={`rounded-xl px-3 py-2 text-sm ${
              status === "error"
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-800"
            }`}
          >
            {statusMessage}
          </div>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          По инструкторам нет открытого остатка к выдаче.
        </div>
      ) : (
        <div className="mt-3 grid gap-3">
          {items.map((item) => {
            const instructorName =
              item.instructor.public_name ?? item.instructor.name;
            const schoolOwesInstructor = item.remaining_amount > 0;
            const prepaidSummary =
              (item.prepaid_lesson_count ?? 0) > 0
                ? `В том числе предоплата инструктору: ${item.prepaid_lesson_count} занятий · ставка ${formatMoney(item.prepaid_unit_amount_min ?? 0)} за занятие · всего ${formatMoney(item.prepaid_amount ?? 0)}`
                : null;
            const studentCount = item.studentBalances.filter(
              (balance) =>
                balance.student_access_id || balance.student_label !== "Без ученика",
            ).length;

            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-3 ${
                  schoolOwesInstructor
                    ? "border-amber-200 bg-amber-50/70"
                    : "border-red-200 bg-red-50/70"
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{instructorName}</p>
                    <p
                      className={`mt-1 text-sm ${
                        schoolOwesInstructor ? "text-amber-800" : "text-red-800"
                      }`}
                    >
                      {schoolOwesInstructor
                        ? `Школа должна: ${formatMoney(item.remaining_amount)}`
                        : `Инструктор должен школе: ${formatMoney(Math.abs(item.remaining_amount))}`}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Начислено {formatMoney(item.amount)} · выдано{" "}
                      {formatMoney(item.paid_amount)}
                    </p>
                  </div>

                  {prepaidSummary && (
                    <p className="mt-1 text-xs text-blue-800">{prepaidSummary}</p>
                  )}

                  {item.studentBalances.length > 0 && (
                    <details className="rounded-xl border border-black/5 bg-white/70">
                      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-zinc-800">
                        Из чего сложился остаток · {studentCount > 0
                          ? formatStudentCount(studentCount)
                          : "без привязки к ученику"}
                      </summary>
                      <div className="divide-y border-t border-black/5">
                        {item.studentBalances.map((balance) => {
                          const sources = [
                            balance.booking_entry_count > 0 ? "занятия" : null,
                            balance.prepaid_entry_count > 0 ? "предоплата" : null,
                            balance.adjustment_entry_count > 0 ? "корректировка" : null,
                          ].filter((value): value is string => Boolean(value));
                          const schoolOwesForStudent = balance.remaining_amount > 0;

                          return (
                            <div
                              key={`${balance.student_access_id ?? "without-student"}-${balance.student_label}`}
                              className="grid gap-1 px-3 py-2 text-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                            >
                              <div className="min-w-0">
                                {balance.student_access_id ? (
                                  <Link
                                    href={`/director/students?view=list&student=${balance.student_access_id}#student-${balance.student_access_id}`}
                                    className="font-semibold text-blue-700 hover:underline"
                                  >
                                    {balance.student_label}
                                  </Link>
                                ) : (
                                  <span className="font-semibold text-zinc-700">
                                    {balance.student_label}
                                  </span>
                                )}
                                <p className="mt-0.5 text-zinc-500">
                                  {sources.join(" · ") || "прочее начисление"}
                                </p>
                              </div>
                              <p
                                className={`font-semibold ${
                                  schoolOwesForStudent ? "text-amber-800" : "text-red-700"
                                }`}
                              >
                                {schoolOwesForStudent ? "Школа должна " : "Инструктор должен "}
                                {formatMoney(Math.abs(balance.remaining_amount))}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}

                  {schoolOwesInstructor ? (
                    <form
                      action={createDirectorReportPayoutPaymentAction}
                      className="grid gap-2 sm:grid-cols-[120px_minmax(0,1fr)_auto] sm:items-end"
                    >
                      <PayoutReturnFields
                        selectedPeriod={selectedPeriod}
                        from={from}
                        to={to}
                        selectedInstructorId={selectedInstructorId}
                      />
                      <input
                        type="hidden"
                        name="instructor_id"
                        value={item.instructor.id}
                      />
                      <label className="space-y-1 text-xs font-medium">
                        <span>Сумма</span>
                        <input
                          type="number"
                          name="amount"
                          min={1}
                          max={item.remaining_amount}
                          defaultValue={item.remaining_amount}
                          className="h-9 w-full rounded-xl border bg-white px-3 text-sm"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-medium">
                        <span>Комментарий</span>
                        <input
                          name="payment_note"
                          maxLength={500}
                          placeholder="Например: переводом"
                          className="h-9 w-full rounded-xl border bg-white px-3 text-sm"
                        />
                      </label>
                      <Button type="submit" className="h-9 shadow-md shadow-emerald-950/15">
                        Отметить выдачу
                      </Button>
                    </form>
                  ) : (
                    <InstructorDebtActions
                      returnAction={createDirectorInstructorReturnAction}
                      withholdAction={markDirectorInstructorDebtWithholdingAction}
                      instructorId={item.instructor.id}
                      debtAmount={Math.abs(item.remaining_amount)}
                      returnedAt={getLocalDate(item.instructor.timezone ?? DEFAULT_TIMEZONE)}
                      isWithholding={(item.withhold_amount ?? 0) > 0}
                      selectedPeriod={selectedPeriod}
                      from={from}
                      to={to}
                      selectedInstructorId={selectedInstructorId}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <details className="mt-4 rounded-xl border border-blue-200 bg-blue-50/60">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-blue-950">
          Как читать расчёты и когда ничего не нужно делать
        </summary>
        <div className="space-y-4 border-t border-blue-200 px-4 py-4 text-sm leading-6 text-zinc-700">
          <p className="rounded-lg bg-white px-3 py-2 font-medium text-blue-950">
            Главное правило: красная сумма не означает «срочно заберите деньги
            у инструктора». Она означает только, что сейчас по расчёту получился
            минус. Сначала нажмите на имя ученика и посмотрите, что произошло.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="font-semibold text-zinc-900">Школа должна инструктору</p>
              <p className="mt-1">
                Инструктор заработал деньги, но школа ещё не отметила их выдачу.
                Например: инструктору начислили 2 400 ₽, а выдали только 1 200 ₽.
                Значит, школа должна ещё 1 200 ₽. Когда деньги действительно
                переданы инструктору, нажмите «Отметить выдачу».
              </p>
            </div>
            <div>
              <p className="font-semibold text-zinc-900">Инструктор должен школе</p>
              <p className="mt-1">
                Инструктору уже выдали деньги, а потом начисление уменьшилось.
                Например: инструктору заранее выдали 2 400 ₽ за два занятия.
                Одно неиспользованное занятие отменили, поэтому начисление стало
                1 200 ₽. Получается временный минус 1 200 ₽.
              </p>
            </div>
          </div>

          <div>
            <p className="font-semibold text-zinc-900">
              Если ученик ещё продолжает обучение
            </p>
            <p className="mt-1">
              Не спешите требовать деньги у инструктора. Сначала проверьте,
              будет ли ученик заниматься дальше. Например: сейчас у инструктора
              минус 1 200 ₽. Ученик проводит следующее занятие, инструктору снова
              начисляется 1 200 ₽, и минус становится равен нулю. Пока обучение
              продолжается, можно ничего не нажимать.
            </p>
          </div>

          <div>
            <p className="font-semibold text-zinc-900">Как выбрать действие</p>
            <p className="mt-1">
              «Инструктор вернул деньги» нажимайте только после настоящего
              возврата денег школе (например, инструктор перевёл 1 200 ₽ на счёт
              школы). «Удержать из следующих выплат» выбирайте, если деньги
              сейчас не возвращают (например, следующая выплата инструктору
              составит 5 000 ₽, из неё вычтут минус 1 200 ₽ и выдадут 3 800 ₽).
              Если решение ещё не принято, ничего не нажимайте: сумма никуда не
              пропадёт.
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
            <p className="font-semibold">Не путайте две отмены</p>
            <p className="mt-1">
              Обычная отмена записи означает: ученик отменил конкретное занятие,
              но деньги за него остаются в школе. Например, у ученика было 10
              оплаченных занятий, после записи осталось 9, а после отмены снова
              стало 10. Ничего с деньгами делать не нужно.
            </p>
            <p className="mt-2">
              «Отменить остаток предоплаты» означает: ученик больше не будет
              использовать оставшиеся занятия. Например, из 10 занятий ученик
              прошёл 6, а оставшиеся 4 полностью отменяются. Эту кнопку не нужно
              нажимать при обычной отмене одной записи.
            </p>
            <p className="mt-2">
              «Отметить возврат ученику» нажимайте только после того, как школа
              действительно вернула ему деньги (например, перевод уже отправлен
              ученику). Эта кнопка фиксирует совершённый возврат, а не обещание
              вернуть деньги позже.
            </p>
          </div>
        </div>
      </details>
    </section>
  );
}

function PayoutPaymentHistory({
  items,
  instructorsById,
  selectedPeriod,
  from,
  to,
  selectedInstructorId,
}: {
  items: PayoutPaymentPeriodItem[];
  instructorsById: Map<string, Instructor>;
  selectedPeriod: string;
  from: string;
  to: string;
  selectedInstructorId: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Выплаты за период</CardTitle>
        <CardDescription>
          Дата, инструктор, сумма и комментарий по отмеченным выплатам.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
            За выбранный период выплат инструкторам нет.
          </div>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {items.map((item) => {
              const instructor = instructorsById.get(item.instructor_id);
              const instructorName =
                instructor?.public_name ?? instructor?.name ?? "Инструктор удалён";

              return (
                <div
                  key={item.id}
                  className="grid gap-3 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{instructorName}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {formatPayoutDateTime(item.paid_at)}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.payment_note?.trim() || "Без комментария"}
                    </p>
                  </div>
                  <p className="text-right font-semibold text-emerald-900">
                    {formatMoney(item.amount)}
                  </p>
                  <CancelPayoutButton
                    action={cancelDirectorReportPayoutPaymentAction}
                    paymentId={item.id}
                    returnPeriod={selectedPeriod}
                    returnFrom={from}
                    returnTo={to}
                    returnInstructor={selectedInstructorId}
                  />
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PayoutReturnHistory({
  items,
  instructorsById,
}: {
  items: PayoutReturnPeriodItem[];
  instructorsById: Map<string, Instructor>;
}) {
  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Возвраты от инструкторов</CardTitle>
        <CardDescription>
          Фактически возвращённые деньги за выбранный период.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y rounded-xl border bg-white">
          {items.map((item) => {
            const instructor = instructorsById.get(item.instructor_id);
            const instructorName =
              instructor?.public_name ?? instructor?.name ?? "Инструктор удалён";

            return (
              <div
                key={item.id}
                className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold">{instructorName}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatPayoutDateTime(item.returned_at)} · {item.return_note?.trim() || "Без комментария"}
                  </p>
                </div>
                <p className="font-semibold text-blue-900">
                  Возвращено {formatMoney(item.amount)}
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function PrepaidCreditsReport({
  items,
}: {
  items: PrepaidCreditReportItem[];
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Предоплаты учеников</CardTitle>
        <CardDescription>
          Оплаты учеников и связанные с ними расчёты с инструкторами за выбранный период.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
            За выбранный период предоплат нет.
          </div>
        ) : (
          <div className="divide-y rounded-xl border bg-white">
            {items.map((item) => {
              const remainingQuantity =
                item.status === "active"
                  ? Math.max(item.quantity - item.used_quantity, 0)
                  : 0;

              return (
                <div
                  key={item.id}
                  className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(220px,1.3fr)] lg:items-center"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/director/students?view=list&student=${item.student_access_id}#student-${item.student_access_id}`}
                      className="font-semibold text-blue-700 hover:underline"
                    >
                      {item.student_label}
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      {item.instructor_name} · {item.school_name} · {item.lesson_type_name}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Оплачено {formatPayoutDateTime(item.paid_at)}
                    </p>
                  </div>
                  <div className="text-xs leading-5 text-zinc-600">
                    <p>Ученик оплатил: {formatMoney(item.final_total_amount)}</p>
                    <p>
                      Занятий: {item.quantity} · использовано {item.used_quantity} · осталось {remainingQuantity}
                    </p>
                    <p className={item.status === "active" ? "text-emerald-700" : "text-red-700"}>
                      {item.status === "active" ? "Предоплата активна" : "Остаток отменён"}
                    </p>
                    {item.status === "cancelled" && (
                      <>
                        <p>
                          Возвращено ученику: {formatMoney(item.student_refunded_amount)}
                        </p>
                        <p className="font-semibold text-zinc-900">
                          Осталось вернуть ученику: {formatMoney(item.student_refund_remaining_amount)}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="text-xs leading-5 text-zinc-600">
                    <p>Начислено инструктору: {formatMoney(item.instructor_amount)}</p>
                    <p>Выдано: {formatMoney(item.instructor_paid_amount)}</p>
                    {item.instructor_returned_amount > 0 && (
                      <p>Возвращено: {formatMoney(item.instructor_returned_amount)}</p>
                    )}
                    <p className="font-semibold text-zinc-900">
                      Остаток расчёта: {formatMoney(item.instructor_remaining_amount)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PrivateExtraIncomeReport({ items }: { items: ReportItem[] }) {
  if (items.length === 0) {
    return null;
  }

  const groupedItems = new Map<
    string,
    { instructor: Instructor; amount: number; items: ReportItem[] }
  >();

  for (const item of items) {
    const current = groupedItems.get(item.instructor.id) ?? {
      instructor: item.instructor,
      amount: 0,
      items: [],
    };
    current.amount += item.direct_instructor_income_amount ?? 0;
    current.items.push(item);
    groupedItems.set(item.instructor.id, current);
  }

  const groups = [...groupedItems.values()].sort(
    (first, second) => second.amount - first.amount,
  );
  const totalAmount = groups.reduce((sum, group) => sum + group.amount, 0);

  return (
    <Card className="border-emerald-200 bg-emerald-50/30">
      <CardHeader className="pb-3">
        <CardTitle>Частный доп. заработок сотрудников</CardTitle>
        <CardDescription>
          100% индивидуальной цены частных дополнительных занятий. Эти суммы
          сотрудник получает самостоятельно, школа их не выдаёт.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-3 py-3">
          <span className="text-sm font-medium text-emerald-800">
            Всего за выбранный период
          </span>
          <span className="text-lg font-semibold text-emerald-950">
            {formatMoney(totalAmount)}
          </span>
        </div>

        {groups.map((group) => {
          const instructorName =
            group.instructor.public_name ?? group.instructor.name;
          const timezone = group.instructor.timezone ?? DEFAULT_TIMEZONE;

          return (
            <details
              key={group.instructor.id}
              className="rounded-xl border border-emerald-100 bg-white"
            >
              <summary className="grid cursor-pointer list-none gap-1 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {instructorName}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {group.items.length} частных дополнительных занятий
                  </span>
                </span>
                <span className="font-semibold text-emerald-800">
                  {formatMoney(group.amount)}
                </span>
              </summary>
              <div className="divide-y border-t border-emerald-100">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                  >
                    <div className="min-w-0">
                      {item.student_access_id ? (
                        <Link
                          href={`/director/students?view=list&student=${item.student_access_id}#student-${item.student_access_id}`}
                          className="font-semibold text-blue-700 hover:underline"
                        >
                          {item.student_label}
                        </Link>
                      ) : (
                        <span className="font-semibold">{item.student_label}</span>
                      )}
                      <p className="mt-1 text-xs text-zinc-500">
                        {formatNumericDate(item.scheduleDay.date)} ·{" "}
                        {formatTime(item.slot.start_time, timezone)} ·{" "}
                        {item.school?.name ?? "Частные ученики"}
                      </p>
                    </div>
                    <span className="font-semibold text-emerald-800">
                      {formatMoney(item.direct_instructor_income_amount ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
      </CardContent>
    </Card>
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
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.id} className="rounded-2xl border bg-white p-3">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {group.color && (
                        <span
                          className="size-3 shrink-0 rounded-full border border-black/10"
                          style={{ backgroundColor: group.color }}
                        />
                      )}
                      <h3 className="truncate text-sm font-semibold">
                        {group.label}
                      </h3>
                    </div>
                    <p className="text-muted-foreground mt-1 text-xs">
                      {group.count} занятий · {group.completedCount} проведено ·{" "}
                      {formatHours(group.hours)} ч
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                    <MoneyGroupMetric
                      label="Стоимость"
                      value={formatMoney(group.totalStudentAmount)}
                    />
                    <MoneyGroupMetric
                      label="Получено"
                      value={formatMoney(group.paidAmount)}
                      tone="emerald"
                    />
                    <MoneyGroupMetric
                      label="Начислено"
                      value={formatMoney(group.instructorPayoutAmount)}
                      tone="blue"
                    />
                    <MoneyGroupMetric
                      label="Выдано"
                      value={formatMoney(group.instructorPaidAmount)}
                      tone="emerald"
                    />
                    <MoneyGroupMetric
                      label="К выдаче"
                      value={formatMoney(group.instructorRemainingAmount)}
                      tone="amber"
                    />
                    <MoneyGroupMetric
                      label="Частный доход"
                      value={formatMoney(group.directInstructorIncomeAmount)}
                      tone="emerald"
                    />
                    <MoneyGroupMetric
                      label="Маржа"
                      value={formatMoney(group.marginAmount)}
                      tone={group.marginAmount < 0 ? "red" : "default"}
                    />
                    <MoneyGroupMetric
                      label="Долг"
                      value={formatMoney(group.debtAmount)}
                      tone="amber"
                    />
                  </div>
                </div>
              </div>
            ))}
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
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend || hasSupabaseAdminKey();
  let instructors: Instructor[] = [];
  let instructorError: { message: string } | null = null;

  if (postgresBackend) {
    instructors = await queryRows<Instructor>(
      `
        select id, name, slug, public_name, timezone, is_active
        from public.instructors
        where organization_id = $1
          and is_active = true
        order by name
      `,
      [membership.organizationId],
    );
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data, error } = await buildActiveInstructorsQuery(
      supabase,
      membership,
      "id, name, slug, public_name, timezone, is_active",
    );
    instructors = (data ?? []) as Instructor[];
    instructorError = error;
  }

  const timezone = instructors[0]?.timezone ?? DEFAULT_TIMEZONE;
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
  const [includeOwnerInPayouts, ownerInstructorIds] = postgresBackend
    ? await Promise.all([
        getOwnerPayoutPolicy({ organizationId: membership.organizationId }),
        getOwnerInstructorIds({ organizationId: membership.organizationId }),
      ])
    : [true, []];
  const ownerInstructorIdSet = new Set(ownerInstructorIds);
  const payoutInstructorIds = includeOwnerInPayouts
    ? reportInstructorIds
    : reportInstructorIds.filter(
        (instructorId) => !ownerInstructorIdSet.has(instructorId),
      );
  await autoCompletePastBookings({ instructorIds: reportInstructorIds });

  let schools: School[] = [];
  let scheduleDays: Pick<ScheduleDay, "id" | "instructor_id" | "date">[] = [];
  let studentAccesses: {
    id: string;
    instructor_id: string;
    school_id: string | null;
  }[] = [];
  let schoolError: { message: string } | null = null;
  let scheduleDayError: { message: string } | null = null;
  let studentAccessError: { message: string } | null = null;

  if (postgresBackend) {
    [schools, scheduleDays, studentAccesses] = await Promise.all([
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
        ? queryRows<Pick<ScheduleDay, "id" | "instructor_id" | "date">>(
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
      reportInstructorIds.length > 0
        ? queryRows<{
            id: string;
            instructor_id: string;
            school_id: string | null;
          }>(
            `
              select id, school_id, instructor_id
              from public.student_accesses
              where organization_id = $1
                and instructor_id = any($2::uuid[])
            `,
            [membership.organizationId, reportInstructorIds],
          )
        : Promise.resolve([]),
    ]);
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const [
      { data: schoolData, error: schoolLoadError },
      { data: scheduleDayData, error: scheduleDayLoadError },
      { data: studentAccessData, error: studentAccessLoadError },
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
      reportInstructorIds.length > 0
        ? supabase
            .from("student_accesses")
            .select("id, school_id, instructor_id")
            .eq("organization_id", membership.organizationId)
            .in("instructor_id", reportInstructorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    schools = (schoolData ?? []) as School[];
    scheduleDays = (scheduleDayData ?? []) as Pick<
      ScheduleDay,
      "id" | "instructor_id" | "date"
    >[];
    studentAccesses = (studentAccessData ?? []) as {
      id: string;
      instructor_id: string;
      school_id: string | null;
    }[];
    schoolError = schoolLoadError;
    scheduleDayError = scheduleDayLoadError;
    studentAccessError = studentAccessLoadError;
  }

  const scheduleDayIds = scheduleDays.map((day) => day.id);
  let slots: ReportSlot[] = [];
  let slotError: { message: string } | null = null;

  if (postgresBackend) {
    slots =
      scheduleDayIds.length > 0
        ? await queryRows<ReportSlot>(
            `
              select id, instructor_id, schedule_day_id,
                     start_time::text as start_time, end_time::text as end_time
              from public.slots
              where schedule_day_id = any($1::uuid[])
                and status <> 'cancelled'
            `,
            [scheduleDayIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: slotData, error: slotLoadError } =
      scheduleDayIds.length > 0
        ? await supabase
            .from("slots")
            .select("id, instructor_id, schedule_day_id, start_time, end_time")
            .in("schedule_day_id", scheduleDayIds)
            .neq("status", "cancelled")
        : { data: [], error: null };
    slots = (slotData ?? []) as ReportSlot[];
    slotError = slotLoadError;
  }

  const slotIds = slots.map((slot) => slot.id);
  let bookings: ReportBooking[] = [];
  let bookingError: { message: string } | null = null;

  if (postgresBackend) {
    bookings =
      slotIds.length > 0
        ? await queryRows<ReportBooking>(
            `
              select bookings.id, bookings.slot_id, bookings.student_label,
                     bookings.student_access_id, bookings.school_id,
                     bookings.price_amount, bookings.paid_amount,
                     bookings.is_paid, bookings.booking_category,
                     bookings.lesson_state, bookings.direct_instructor_income_amount,
                     bookings.direct_instructor_income_recognized_at::text
                       as direct_instructor_income_recognized_at,
                     prepaid_usages.credit_id::text as prepaid_credit_id
              from public.bookings bookings
              left join public.student_prepaid_credit_usages prepaid_usages
                on prepaid_usages.booking_id = bookings.id
               and prepaid_usages.status = 'active'
              where bookings.slot_id = any($1::uuid[])
                and bookings.status = 'confirmed'
            `,
            [slotIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: bookingData, error: bookingLoadError } =
      slotIds.length > 0
        ? await supabase
            .from("bookings")
            .select("id, slot_id, student_label, student_access_id, school_id, price_amount, paid_amount, is_paid, booking_category, lesson_state")
            .in("slot_id", slotIds)
            .eq("status", "confirmed")
        : { data: [], error: null };
    bookings = (bookingData ?? []) as ReportBooking[];
    bookingError = bookingLoadError;
  }

  const loadError =
    instructorError ??
    schoolError ??
    scheduleDayError ??
    studentAccessError ??
    slotError ??
    bookingError;
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const studentAccessesById = new Map(
    studentAccesses.map((access) => [access.id, access]),
  );
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
      const access = booking.student_access_id
        ? studentAccessesById.get(booking.student_access_id)
        : null;

      return {
        ...booking,
        slot,
        scheduleDay,
        instructor,
        school: booking.school_id
          ? schoolsById.get(booking.school_id) ?? null
          : access?.school_id
            ? schoolsById.get(access.school_id) ?? null
            : null,
      };
    })
    .filter((item): item is ReportItem => Boolean(item));
  const completedItems = reportItems.filter(
    (item) => item.lesson_state === "completed",
  );
  const directIncomeItems = reportItems.filter(
    (item) =>
      hasDirectInstructorIncome(item) &&
      Boolean(item.direct_instructor_income_recognized_at),
  );
  const directIncomeAmount = directIncomeItems.reduce(
    (sum, item) => sum + (item.direct_instructor_income_amount ?? 0),
    0,
  );
  const directStudentPaidAmount = reportItems.reduce(
    (sum, item) =>
      sum +
      (hasDirectInstructorIncome(item)
        ? getSchoolBookingPaidAmount(item)
        : 0),
    0,
  );
  const directStudentPriceAmount = reportItems.reduce(
    (sum, item) =>
      sum +
      (hasDirectInstructorIncome(item) ? (item.price_amount ?? 0) : 0),
    0,
  );
  const regularPaidAmount = reportItems.reduce(
    (sum, item) => sum + getSchoolBookingPaidAmount(item),
    0,
  );
  const debtAmount = reportItems.reduce(
    (sum, item) => sum + getDebtAmount(item),
    0,
  );
  const paidItemsCount = reportItems.filter(
    (item) => getSchoolBookingPaidAmount(item) > 0,
  ).length;
  const debtItems = reportItems.filter((item) => getDebtAmount(item) > 0);
  const hours = completedItems.reduce(
    (sum, item) => sum + getDurationHours(item.slot),
    0,
  );
  const [
    payoutSummary,
    payoutByInstructor,
    payoutBySchool,
    payoutByBookingCategory,
    allTimePayoutByInstructor,
    payoutPayments,
    payoutReturns,
    prepaidCreditReport,
    payoutStudentBalances,
    studentPrepaymentCashGroups,
  ] =
    postgresBackend && payoutInstructorIds.length > 0
      ? await Promise.all([
          queryRows<PayoutSummary>(
            `
              select coalesce(sum(amount), 0)::integer as amount,
                     coalesce(sum(paid_amount), 0)::integer as paid_amount,
                     coalesce(sum(remaining_amount), 0)::integer as remaining_amount
              from public.instructor_payout_entry_balances
              where organization_id = $1
                and instructor_id = any($2::uuid[])
                and status = 'planned'
                and coalesce(event_at, planned_at)::date >= $3::date
                and coalesce(event_at, planned_at)::date <= $4::date
            `,
            [membership.organizationId, payoutInstructorIds, from, to],
          ).then(
            (rows) =>
              rows[0] ?? {
                amount: 0,
                paid_amount: 0,
                remaining_amount: 0,
              },
          ),
          queryRows<PayoutGroup>(
            `
              select instructor_id::text as id,
                     coalesce(sum(amount), 0)::integer as amount,
                     coalesce(sum(paid_amount), 0)::integer as paid_amount,
                     coalesce(sum(remaining_amount), 0)::integer as remaining_amount
              from public.instructor_payout_entry_balances
              where organization_id = $1
                and instructor_id = any($2::uuid[])
                and status = 'planned'
                and coalesce(event_at, planned_at)::date >= $3::date
                and coalesce(event_at, planned_at)::date <= $4::date
              group by instructor_id
            `,
            [membership.organizationId, payoutInstructorIds, from, to],
          ),
          queryRows<PayoutGroup>(
            `
              select coalesce(school_id::text, 'without-school') as id,
                     coalesce(sum(amount), 0)::integer as amount,
                     coalesce(sum(paid_amount), 0)::integer as paid_amount,
                     coalesce(sum(remaining_amount), 0)::integer as remaining_amount
              from public.instructor_payout_entry_balances
              where organization_id = $1
                and instructor_id = any($2::uuid[])
                and status = 'planned'
                and coalesce(event_at, planned_at)::date >= $3::date
                and coalesce(event_at, planned_at)::date <= $4::date
              group by coalesce(school_id::text, 'without-school')
            `,
            [membership.organizationId, payoutInstructorIds, from, to],
          ),
          queryRows<PayoutGroup>(
            `
              select coalesce(bookings.booking_category, 'without-category') as id,
                     coalesce(sum(entries.amount), 0)::integer as amount,
                     coalesce(sum(entries.paid_amount), 0)::integer as paid_amount,
                     coalesce(sum(entries.remaining_amount), 0)::integer as remaining_amount
              from public.instructor_payout_entry_balances entries
              left join public.bookings bookings on bookings.id = entries.booking_id
              where entries.organization_id = $1
                and entries.instructor_id = any($2::uuid[])
                and entries.status = 'planned'
                and coalesce(entries.event_at, entries.planned_at)::date >= $3::date
                and coalesce(entries.event_at, entries.planned_at)::date <= $4::date
              group by coalesce(bookings.booking_category, 'without-category')
            `,
            [membership.organizationId, payoutInstructorIds, from, to],
          ),
          queryRows<PayoutGroup>(
            `
              select entries.instructor_id::text as id,
                     coalesce(sum(entries.amount), 0)::integer as amount,
                     coalesce(sum(entries.paid_amount), 0)::integer as paid_amount,
                     coalesce(sum(entries.remaining_amount), 0)::integer as remaining_amount,
                     coalesce(sum(
                       case
                         when entries.entry_type = 'prepaid_credit_accrual' and credits.status = 'active'
                           then credits.quantity
                         when entries.entry_type = 'prepaid_credit_accrual' and credits.status = 'cancelled'
                           then coalesce(usages.used_quantity, 0)
                         else 0
                       end
                     ), 0)::integer as prepaid_lesson_count,
                     coalesce(sum(
                       case
                         when entries.entry_type in ('prepaid_credit_accrual', 'cancellation_adjustment')
                           and entries.student_prepaid_credit_id is not null
                           then entries.amount
                         else 0
                       end
                     ), 0)::integer as prepaid_amount,
                     min(case when entries.entry_type = 'prepaid_credit_accrual' then round(entries.amount::numeric / nullif(credits.quantity, 0))::integer end) as prepaid_unit_amount_min,
                     max(case when entries.entry_type = 'prepaid_credit_accrual' then round(entries.amount::numeric / nullif(credits.quantity, 0))::integer end) as prepaid_unit_amount_max,
                     coalesce(sum(
                       case
                         when entries.amount < 0
                           and entries.debt_resolution = 'withhold'
                           and entries.remaining_amount < 0
                           then abs(entries.remaining_amount)
                         else 0
                       end
                     ), 0)::integer as withhold_amount
              from public.instructor_payout_entry_balances entries
              left join public.student_prepaid_credits credits on credits.id = entries.student_prepaid_credit_id
              left join lateral (
                select count(*)::integer as used_quantity
                from public.student_prepaid_credit_usages credit_usages
                where credit_usages.credit_id = credits.id
                  and credit_usages.status = 'active'
              ) usages on true
              where entries.organization_id = $1
                and entries.instructor_id = any($2::uuid[])
                and entries.status = 'planned'
              group by entries.instructor_id
              having coalesce(sum(entries.remaining_amount), 0) <> 0
              order by coalesce(sum(entries.remaining_amount), 0) desc
            `,
            [membership.organizationId, payoutInstructorIds],
          ),
          queryRows<PayoutPaymentPeriodItem>(
            `
              with period_entries as (
                select id
                from public.instructor_payout_entries
                where organization_id = $1
                  and instructor_id = any($2::uuid[])
                  and status = 'planned'
                  and coalesce(event_at, planned_at)::date >= $3::date
                  and coalesce(event_at, planned_at)::date <= $4::date
              )
              select payments.id::text,
                     payments.instructor_id::text,
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
            [membership.organizationId, payoutInstructorIds, from, to],
          ),
          queryRows<PayoutReturnPeriodItem>(
            `
              select returns.id::text,
                     returns.instructor_id::text,
                     returns.returned_at::text,
                     returns.amount,
                     returns.return_note
              from public.instructor_payout_returns returns
              where returns.organization_id = $1
                and returns.instructor_id = any($2::uuid[])
                and returns.returned_at::date >= $3::date
                and returns.returned_at::date <= $4::date
              order by returns.returned_at desc, returns.created_at desc
            `,
            [membership.organizationId, payoutInstructorIds, from, to],
          ),
          queryRows<PrepaidCreditReportItem>(
            `
              select credits.id::text,
                     credits.student_access_id::text,
                     accesses.display_label as student_label,
                     credits.instructor_id::text,
                     coalesce(instructors.public_name, instructors.name) as instructor_name,
                     schools.name as school_name,
                     lesson_types.name as lesson_type_name,
                     credits.quantity,
                     coalesce(usages.used_quantity, 0)::integer as used_quantity,
                     credits.final_total_amount::integer,
                     credits.paid_at::text,
                     credits.status,
                     coalesce(payouts.amount, 0)::integer as instructor_amount,
                     coalesce(payouts.paid_amount, 0)::integer as instructor_paid_amount,
                     coalesce(payouts.returned_amount, 0)::integer as instructor_returned_amount,
                     coalesce(payouts.remaining_amount, 0)::integer as instructor_remaining_amount,
                     coalesce(student_refunds.refunded_amount, 0)::integer as student_refunded_amount,
                     greatest(
                       case
                         when credits.status = 'cancelled'
                           then credits.final_unit_price * (credits.quantity - coalesce(usages.used_quantity, 0))
                         else 0
                       end - coalesce(student_refunds.refunded_amount, 0),
                       0
                     )::integer as student_refund_remaining_amount
              from public.student_prepaid_credits credits
              join public.student_accesses accesses on accesses.id = credits.student_access_id
              join public.instructors instructors on instructors.id = credits.instructor_id
              join public.schools schools on schools.id = credits.school_id
              join public.lesson_types lesson_types on lesson_types.id = credits.lesson_type_id
              left join lateral (
                select count(*)::integer as used_quantity
                from public.student_prepaid_credit_usages credit_usages
                where credit_usages.credit_id = credits.id
                  and credit_usages.status = 'active'
              ) usages on true
              left join lateral (
                select coalesce(sum(entries.amount), 0)::integer as amount,
                       coalesce(sum(entries.paid_amount), 0)::integer as paid_amount,
                       coalesce(sum(entries.returned_amount), 0)::integer as returned_amount,
                       coalesce(sum(entries.remaining_amount), 0)::integer as remaining_amount
                from public.instructor_payout_entry_balances entries
                where entries.student_prepaid_credit_id = credits.id
                  and entries.status = 'planned'
              ) payouts on true
              left join lateral (
                select coalesce(sum(refunds.amount), 0)::integer as refunded_amount
                from public.student_prepaid_refunds refunds
                where refunds.credit_id = credits.id
                  and refunds.cancelled_at is null
              ) student_refunds on true
              where credits.organization_id = $1
                and credits.instructor_id = any($2::uuid[])
                and credits.paid_at::date >= $3::date
                and credits.paid_at::date <= $4::date
              order by credits.paid_at desc, credits.created_at desc
            `,
            [membership.organizationId, payoutInstructorIds, from, to],
          ),
          queryRows<PayoutStudentBalanceItem>(
            `
              with detailed_entries as (
                select entries.*,
                       coalesce(accesses.display_label, bookings.student_label, 'Без ученика') as student_label
                from public.instructor_payout_entry_balances entries
                left join public.student_accesses accesses
                  on accesses.id = entries.student_access_id
                left join public.bookings bookings
                  on bookings.id = entries.booking_id
                where entries.organization_id = $1
                  and entries.instructor_id = any($2::uuid[])
                  and entries.status = 'planned'
                  and entries.remaining_amount <> 0
              )
              select entries.instructor_id::text,
                     entries.student_access_id::text,
                     entries.student_label,
                     coalesce(sum(entries.remaining_amount), 0)::integer as remaining_amount,
                     count(*) filter (
                       where entries.booking_id is not null
                         and entries.entry_type = 'booking_accrual'
                     )::integer as booking_entry_count,
                     count(*) filter (
                       where entries.student_prepaid_credit_id is not null
                     )::integer as prepaid_entry_count,
                     count(*) filter (
                       where entries.entry_type in (
                         'manual_adjustment',
                         'cancellation_adjustment',
                         'no_show_adjustment'
                       )
                     )::integer as adjustment_entry_count
              from detailed_entries entries
              group by entries.instructor_id, entries.student_access_id, entries.student_label
              having coalesce(sum(entries.remaining_amount), 0) <> 0
              order by entries.instructor_id,
                       abs(coalesce(sum(entries.remaining_amount), 0)) desc,
                       entries.student_label
            `,
            [membership.organizationId, payoutInstructorIds],
          ),
          getStudentPrepaymentCashGroups({
            organizationId: membership.organizationId,
            instructorIds: payoutInstructorIds,
            from,
            to,
          }),
        ])
      : [
          { amount: 0, paid_amount: 0, remaining_amount: 0 },
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
          [],
        ];
  const studentPrepaidAmount = studentPrepaymentCashGroups.reduce(
    (sum, group) => sum + group.prepaid_amount,
    0,
  );
  const studentRefundedAmount = studentPrepaymentCashGroups.reduce(
    (sum, group) => sum + group.refunded_amount,
    0,
  );
  const studentPrepaymentNetAmount = studentPrepaymentCashGroups.reduce(
    (sum, group) => sum + group.net_amount,
    0,
  );
  const studentPrepaymentCount = studentPrepaymentCashGroups.reduce(
    (sum, group) => sum + group.credit_count,
    0,
  );
  const paidAmount = regularPaidAmount + studentPrepaymentNetAmount;
  const totalStudentAmount = reportItems.reduce(
    (sum, item) => sum + (item.price_amount ?? 0),
    0,
  );
  const marginAmount =
    paidAmount - directStudentPaidAmount - payoutSummary.amount;
  const potentialMarginAmount =
    Math.max(
      totalStudentAmount - directStudentPriceAmount,
      paidAmount - directStudentPaidAmount,
    ) - payoutSummary.amount;
  const byInstructor = new Map<string, MoneyGroup>();
  const bySchool = new Map<string, MoneyGroup>();
  const byStudent = new Map<string, MoneyGroup>();
  const byBookingCategory = new Map<string, MoneyGroup>();

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
    addToGroup(
      byBookingCategory,
      item.booking_category,
      getBookingCategoryLabel(item.booking_category),
      item,
    );
    addToGroup(byStudent, item.student_label, item.student_label, item);
  }

  for (const cashGroup of studentPrepaymentCashGroups) {
    const instructor = instructorsById.get(cashGroup.instructor_id);
    const school = schoolsById.get(cashGroup.school_id);

    addPrepaymentCashToGroup(
      byInstructor,
      cashGroup.instructor_id,
      instructor?.public_name ?? instructor?.name ?? "Инструктор",
      cashGroup,
    );
    addPrepaymentCashToGroup(
      bySchool,
      cashGroup.school_id,
      school?.name ?? "Без источника",
      cashGroup,
      school?.color,
    );
    addPrepaymentCashToGroup(
      byBookingCategory,
      "without-category",
      "Предоплаты учеников",
      cashGroup,
    );
  }

  attachPayoutsToGroups(byInstructor, payoutByInstructor);
  attachPayoutsToGroups(bySchool, payoutBySchool);
  attachPayoutsToGroups(byBookingCategory, payoutByBookingCategory);
  const instructorPayoutQuickItems = allTimePayoutByInstructor
    .map((item) => {
      const instructor = instructorsById.get(item.id);

      if (!instructor) {
        return null;
      }

      return {
        ...item,
        instructor,
        studentBalances: payoutStudentBalances.filter(
          (balance) => balance.instructor_id === item.id,
        ),
      };
    })
    .filter((item): item is InstructorPayoutQuickItem => Boolean(item));

  const instructorGroups = [...byInstructor.values()].sort(
    (first, second) => second.totalStudentAmount - first.totalStudentAmount,
  );
  const schoolGroups = [...bySchool.values()].sort(
    (first, second) => second.totalStudentAmount - first.totalStudentAmount,
  );
  const bookingCategoryGroups = [...byBookingCategory.values()].sort(
    (first, second) => second.totalStudentAmount - first.totalStudentAmount,
  );
  const topDebtGroups = [...byStudent.values()]
    .filter((group) => group.debtAmount > 0)
    .sort((first, second) => second.debtAmount - first.debtAmount)
    .slice(0, 8);
  const exportParams = new URLSearchParams({
    from,
    to,
    instructor: selectedInstructorId,
  });

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
            Деньги и занятия за период: {formatNumericDate(from)} -{" "}
            {formatNumericDate(to)}.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Фильтры</h2>
                <p className="text-muted-foreground mt-1 text-sm">
                  Быстрый период или точная настройка дат.
                </p>
              </div>
              <Link
                href={`/director/reports/export?${exportParams.toString()}`}
                className={buttonVariants({ variant: "accent", size: "lg" })}
              >
                <Download aria-hidden="true" />
                Скачать Excel
              </Link>
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
                  <Button type="submit" className="h-10 w-full shadow-md shadow-zinc-950/15">
                    Показать
                  </Button>
                </div>
              </form>
            </details>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Стоимость занятий"
            value={formatMoney(totalStudentAmount)}
            hint={`${reportItems.length} записей за период`}
          />
          <SummaryCard
            label="Получено от учеников"
            value={formatMoney(paidAmount)}
            hint={`${paidItemsCount} обычных оплат · ${studentPrepaymentCount} предоплат на ${formatMoney(studentPrepaidAmount)} · возвраты ${formatMoney(studentRefundedAmount)}`}
            tone="emerald"
          />
          <SummaryCard
            label="Долг учеников"
            value={formatMoney(debtAmount)}
            hint={`${debtItems.length} записей с долгом`}
            tone="amber"
          />
          <SummaryCard
            label="Начислено инструкторам"
            value={formatMoney(payoutSummary.amount)}
            hint={`${completedItems.length} проведено · ${formatHours(hours)} ч`}
          />
          <SummaryCard
            label="Выдано инструкторам"
            value={formatMoney(payoutSummary.paid_amount)}
            hint="Отмечено руководителем как выдано"
            tone="emerald"
          />
          <SummaryCard
            label="К выдаче инструкторам"
            value={formatMoney(payoutSummary.remaining_amount)}
            hint="Начислено минус выдано"
            tone="amber"
          />
          <SummaryCard
            label="Частный доп. заработок"
            value={formatMoney(directIncomeAmount)}
            hint={`${directIncomeItems.length} занятий · школа не выдаёт эти деньги`}
            tone="emerald"
          />
          <SummaryCard
            label="Маржа"
            value={formatMoney(marginAmount)}
            hint="Обычные оплаты и предоплаты минус возвраты и начисления инструкторам"
            tone={marginAmount < 0 ? "amber" : "default"}
          />
          <SummaryCard
            label="Потенциальная маржа"
            value={formatMoney(potentialMarginAmount)}
            hint="Не меньше фактически полученной школой суммы минус начисления"
          />
        </section>

        <Card className="border-blue-200 bg-blue-50/60">
          <CardContent className="p-4 text-sm leading-6 text-blue-950">
            Начислено — сумма по ставкам инструкторов за выбранный период.
            Выдано — выплаты, которыми закрыли эти начисления. К выдаче —
            остаток, который ещё нужно отдать. Частный доп. заработок считается
            отдельно, не требует выдачи руководителем и не входит в маржу школы.
          </CardContent>
        </Card>

        <InstructorPayoutQuickPanel
          items={instructorPayoutQuickItems}
          selectedPeriod={selectedPeriod}
          from={from}
          to={to}
          selectedInstructorId={selectedInstructorId}
          status={params.payout}
        />

        <PrivateExtraIncomeReport items={directIncomeItems} />

        <PayoutPaymentHistory
          items={payoutPayments}
          instructorsById={instructorsById}
          selectedPeriod={selectedPeriod}
          from={from}
          to={to}
          selectedInstructorId={selectedInstructorId}
        />

        <PayoutReturnHistory
          items={payoutReturns}
          instructorsById={instructorsById}
        />

        <PrepaidCreditsReport items={prepaidCreditReport} />

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
          <MoneyGroupTable
            title="По категориям записей"
            description="Обычные, дополнительные и подарочные занятия."
            groups={bookingCategoryGroups}
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
