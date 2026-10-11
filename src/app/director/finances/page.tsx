import Link from "next/link";
import {
  CircleDollarSign,
  FileClock,
  GraduationCap,
  UsersRound,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import { queryRows } from "@/lib/db/postgres";
import { formatMoney, formatNumericDate } from "@/lib/formatters";
import { FinanceStudentPaymentsTable } from "@/components/director/finance-student-payments-table";
import {
  FinanceInstructorSettlements,
  type FinanceInstructorItem,
} from "@/components/director/finance-instructor-settlements";
import {
  FinanceOperationsTable,
  type FinanceOperation,
} from "@/components/director/finance-operations-table";

export const dynamic = "force-dynamic";

type FinanceView = "overview" | "student-payments" | "instructor-settlements" | "operations";
type FinancePeriod = "all" | "day" | "week" | "month" | "custom";

type PeriodBounds = { start: string; end: string };

type StudentPaymentRow = {
  id: string;
  student_access_id: string;
  student_label: string;
  instructor_name: string;
  school_name: string;
  lesson_type_name: string;
  school_id: string;
  lesson_type_id: string;
  quantity: number;
  used_quantity: number;
  final_total_amount: number;
  final_unit_price: number;
  refunded_amount: number;
  refunds: Array<{
    id: string;
    amount: number;
    refunded_at: string;
    refund_note: string | null;
    cancelled_at: string | null;
    cancellation_note: string | null;
  }>;
  adjustments: Array<{
    id: string;
    previous_quantity: number;
    previous_final_total_amount: number;
    new_quantity: number;
    new_final_total_amount: number;
    reason: string;
    created_at: string;
  }>;
  status: "active" | "cancelled";
  paid_at: string;
  payment_note: string | null;
};

type StudentPaymentOption = {
  id: string;
  label: string;
  school_id: string | null;
  lesson_type_ids: string[];
};

type PaymentSchool = { id: string; name: string };
type PaymentLessonType = { id: string; name: string };
type PaymentPrice = { school_id: string; lesson_type_id: string; price_amount: number };

type InstructorSettlementRow = {
  id: string;
  instructor_name: string;
  planned_amount: number;
  paid_amount: number;
  remaining_amount: number;
};

type InstructorStudentSettlementRow = {
  instructor_id: string;
  student_access_id: string | null;
  student_name: string;
  remaining_amount: number;
  booking_count: number;
  booking_units: number;
  prepaid_units: number;
  adjustment_count: number;
};

type InstructorPaymentRow = {
  id: string;
  instructor_id: string;
  amount: number;
  paid_at: string;
  payment_note: string | null;
};

const views: Array<{
  key: FinanceView;
  label: string;
  description: string;
  icon: typeof GraduationCap;
}> = [
  { key: "overview", label: "Обзор", description: "Главные суммы по школе", icon: CircleDollarSign },
  { key: "student-payments", label: "Оплаты учеников", description: "Предоплаты, остатки и возвраты", icon: GraduationCap },
  { key: "instructor-settlements", label: "Инструкторы и выплаты", description: "Начислено, выдано и осталось", icon: UsersRound },
  { key: "operations", label: "История операций", description: "Кто и что менял", icon: FileClock },
];

function getView(value: string | undefined): FinanceView {
  if (value === "student-payments" || value === "instructor-settlements" || value === "operations") return value;
  return "overview";
}

function getPeriod(value: string | undefined): FinancePeriod {
  if (value === "day" || value === "week" || value === "month" || value === "custom") return value;
  return "all";
}

function getPeriodBounds(period: FinancePeriod, from?: string, to?: string): PeriodBounds | null {
  if (period === "all") return null;

  if (period === "custom") {
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return null;
    const offsetMs = 8 * 60 * 60 * 1000;
    const startLocal = new Date(`${from}T00:00:00.000Z`);
    const endLocal = new Date(`${to}T00:00:00.000Z`);
    endLocal.setUTCDate(endLocal.getUTCDate() + 1);
    return {
      start: new Date(startLocal.getTime() - offsetMs).toISOString(),
      end: new Date(endLocal.getTime() - offsetMs).toISOString(),
    };
  }

  const offsetMs = 8 * 60 * 60 * 1000;
  const now = new Date(Date.now() + offsetMs);
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const date = now.getUTCDate();
  const dayOfWeek = now.getUTCDay();
  const mondayOffset = (dayOfWeek + 6) % 7;
  const startDay = period === "week" ? date - mondayOffset : period === "month" ? 1 : date;
  const startLocal = new Date(Date.UTC(year, month, startDay));
  const endLocal = period === "month"
    ? new Date(Date.UTC(year, month + 1, 1))
    : period === "week"
      ? new Date(startLocal.getTime() + 7 * 24 * 60 * 60 * 1000)
      : new Date(startLocal.getTime() + 24 * 60 * 60 * 1000);

  return {
    start: new Date(startLocal.getTime() - offsetMs).toISOString(),
    end: new Date(endLocal.getTime() - offsetMs).toISOString(),
  };
}

function financeHref(view: FinanceView, period: FinancePeriod = "all", from?: string, to?: string) {
  const params = new URLSearchParams({ view });
  if (period !== "all") params.set("period", period);
  if (period === "custom" && from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  return `/director/finances?${params.toString()}`;
}

const periodOptions: Array<{ value: FinancePeriod; label: string }> = [
  { value: "all", label: "Всё время" },
  { value: "day", label: "Сегодня" },
  { value: "week", label: "Эта неделя" },
  { value: "month", label: "Этот месяц" },
  { value: "custom", label: "Свой период" },
];

function SummaryLink({
  href,
  label,
  value,
  tone = "default",
}: {
  href: string;
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const toneClass = tone === "emerald"
    ? "border-emerald-200 bg-emerald-50/60 text-emerald-900"
    : tone === "amber"
      ? "border-amber-200 bg-amber-50/60 text-amber-900"
      : "border-zinc-200 bg-white text-zinc-950";

  return (
    <Link href={href} className={`rounded-xl border p-4 transition-shadow hover:shadow-md ${toneClass}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-2 text-2xl font-semibold underline decoration-current/30 underline-offset-4">{value}</p>
    </Link>
  );
}

export default async function DirectorFinancesPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; section?: string; period?: string; from?: string; to?: string }>;
}) {
  const membership = await requireDirectorAccess();
  const params = (await searchParams) ?? {};
  const view = getView(params.view ?? params.section);
  const period = getPeriod(params.period);
  const periodBounds = getPeriodBounds(period, params.from, params.to);
  const periodStartFilter = periodBounds ? "and {column} >= $2::timestamptz and {column} < $3::timestamptz" : "";
  const periodParams = periodBounds ? [membership.organizationId, periodBounds.start, periodBounds.end] : [membership.organizationId];
  const periodLabel = period === "custom" && periodBounds ? `Свой период: ${formatNumericDate(params.from!)} — ${formatNumericDate(params.to!)}` : periodOptions.find((option) => option.value === period)?.label ?? "Всё время";
  const currentFinanceHref = (target: FinanceView) => financeHref(target, period, params.from, params.to);
  const financeReturnPath = currentFinanceHref("instructor-settlements");

  const [summary, studentPayments, instructorSettlements, instructorStudentSettlements, instructorPayments, instructorDirectIncome, operations, paymentOptions, paymentSchools, paymentLessonTypes, paymentPrices] = await Promise.all([
    queryRows<{
      student_paid: number;
      student_refunded: number;
      instructor_accrued: number;
      instructor_paid: number;
      instructor_remaining: number;
    }>(
      `
        select
          (select coalesce(sum(final_total_amount), 0)::integer from public.student_prepaid_credits where organization_id = $1 ${periodStartFilter.replaceAll("{column}", "paid_at")}) as student_paid,
          (select coalesce(sum(refunds.amount), 0)::integer from public.student_prepaid_refunds refunds join public.student_prepaid_credits credits on credits.id = refunds.credit_id where refunds.organization_id = $1 and refunds.cancelled_at is null ${periodStartFilter.replaceAll("{column}", "refunds.refunded_at")}) as student_refunded,
          (select coalesce(sum(amount), 0)::integer from public.instructor_payout_entry_balances where organization_id = $1 and status = 'planned' ${periodStartFilter.replaceAll("{column}", "coalesce(event_at, planned_at)")}) as instructor_accrued,
          (select coalesce(sum(allocations.amount), 0)::integer from public.instructor_payout_payment_allocations allocations join public.instructor_payout_payments payments on payments.id = allocations.payment_id where payments.organization_id = $1 ${periodStartFilter.replaceAll("{column}", "payments.paid_at")}) as instructor_paid,
          (select coalesce(sum(remaining_amount), 0)::integer from public.instructor_payout_entry_balances where organization_id = $1 and status = 'planned') as instructor_remaining
      `,
      periodParams,
    ),
    queryRows<StudentPaymentRow>(
      `
        select credits.id::text, accesses.id::text as student_access_id, accesses.display_label as student_label,
               coalesce(instructors.public_name, instructors.name) as instructor_name,
               schools.name as school_name, lesson_types.name as lesson_type_name,
               credits.school_id::text, credits.lesson_type_id::text,
               credits.quantity, coalesce(usages.used_quantity, 0)::integer as used_quantity,
               credits.final_total_amount::integer,
               credits.final_unit_price::integer,
               coalesce(refunds.refunded_amount, 0)::integer as refunded_amount,
               coalesce(refund_rows.refunds, '[]'::jsonb) as refunds,
               coalesce(adjustment_rows.adjustments, '[]'::jsonb) as adjustments,
               credits.status, credits.paid_at::text, credits.payment_note
        from public.student_prepaid_credits credits
        join public.student_accesses accesses on accesses.id = credits.student_access_id
        join public.instructors instructors on instructors.id = credits.instructor_id
        join public.schools schools on schools.id = credits.school_id
        join public.lesson_types lesson_types on lesson_types.id = credits.lesson_type_id
        left join lateral (
          select count(*)::integer as used_quantity from public.student_prepaid_credit_usages
          where credit_id = credits.id and status = 'active'
        ) usages on true
        left join lateral (
          select coalesce(sum(amount), 0)::integer as refunded_amount from public.student_prepaid_refunds
          where credit_id = credits.id and cancelled_at is null
        ) refunds on true
        left join lateral (
          select jsonb_agg(jsonb_build_object(
            'id', student_refunds.id,
            'amount', student_refunds.amount,
            'refunded_at', student_refunds.refunded_at,
            'refund_note', student_refunds.refund_note,
            'cancelled_at', student_refunds.cancelled_at,
            'cancellation_note', student_refunds.cancellation_note
          ) order by student_refunds.refunded_at desc) as refunds
          from public.student_prepaid_refunds student_refunds
          where student_refunds.credit_id = credits.id
        ) refund_rows on true
        left join lateral (
          select jsonb_agg(jsonb_build_object(
            'id', adjustments.id,
            'previous_quantity', adjustments.previous_quantity,
            'previous_final_total_amount', adjustments.previous_final_total_amount,
            'new_quantity', adjustments.new_quantity,
            'new_final_total_amount', adjustments.new_final_total_amount,
            'reason', adjustments.reason,
            'created_at', adjustments.created_at
          ) order by adjustments.created_at desc) as adjustments
          from public.student_prepaid_credit_adjustments adjustments
          where adjustments.credit_id = credits.id
        ) adjustment_rows on true
        where credits.organization_id = $1 ${periodStartFilter.replaceAll("{column}", "credits.paid_at")}
        order by credits.paid_at desc, credits.created_at desc
      `,
      periodParams,
    ),
    queryRows<InstructorSettlementRow>(
      `
        select instructors.id::text,
               coalesce(instructors.public_name, instructors.name) as instructor_name,
               coalesce(sum(balances.amount) filter (where balances.status = 'planned'), 0)::integer as planned_amount,
               coalesce(sum(balances.paid_amount) filter (where balances.status = 'planned'), 0)::integer as paid_amount,
               coalesce(sum(balances.remaining_amount) filter (where balances.status = 'planned'), 0)::integer as remaining_amount
        from public.instructors instructors
        left join public.instructor_payout_entry_balances balances
          on balances.instructor_id = instructors.id and balances.organization_id = instructors.organization_id
          ${periodBounds ? periodStartFilter.replaceAll("{column}", "coalesce(balances.event_at, balances.planned_at)") : ""}
        where instructors.organization_id = $1 and instructors.is_active = true
        group by instructors.id, instructors.public_name, instructors.name
        order by remaining_amount desc, instructor_name
      `,
      periodParams,
    ),
    queryRows<InstructorStudentSettlementRow>(
      `
        select entries.instructor_id::text,
               entries.student_access_id::text,
               coalesce(accesses.display_label, 'Без ученика') as student_name,
               coalesce(sum(balances.remaining_amount), 0)::integer as remaining_amount,
               count(*) filter (where entries.entry_type = 'booking_accrual')::integer as booking_count,
               coalesce(sum(case when entries.entry_type = 'booking_accrual' then coalesce(bookings.lesson_units, 1) else 0 end), 0)::integer as booking_units,
               coalesce(sum(case when entries.entry_type = 'prepaid_credit_accrual' then coalesce(credits.quantity, 0) else 0 end), 0)::integer as prepaid_units,
               count(*) filter (where entries.entry_type = 'adjustment')::integer as adjustment_count
        from public.instructor_payout_entry_balances balances
        join public.instructor_payout_entries entries on entries.id = balances.id
        left join public.student_accesses accesses on accesses.id = entries.student_access_id
        left join public.bookings bookings on bookings.id = entries.booking_id
        left join public.student_prepaid_credits credits on credits.id = entries.student_prepaid_credit_id
        where entries.organization_id = $1
          and entries.status = 'planned'
          ${periodBounds ? periodStartFilter.replaceAll("{column}", "coalesce(entries.event_at, entries.planned_at)") : ""}
        group by entries.instructor_id, entries.student_access_id, accesses.display_label
        having coalesce(sum(balances.remaining_amount), 0) <> 0
        order by entries.instructor_id, remaining_amount desc, student_name
      `,
      periodParams,
    ),
    queryRows<InstructorPaymentRow>(
      `
        select id::text, instructor_id::text, amount::integer,
               paid_at::text, payment_note
        from public.instructor_payout_payments
        where organization_id = $1 ${periodStartFilter.replaceAll("{column}", "paid_at")}
        order by paid_at desc
      `,
      periodParams,
    ),
    queryRows<{ instructor_id: string; amount: number }>(
      `
        select s.instructor_id::text,
               coalesce(sum(b.direct_instructor_income_amount), 0)::integer as amount
        from public.bookings b
        join public.slots s on s.id = b.slot_id
        join public.instructors i on i.id = s.instructor_id
        where i.organization_id = $1
          and b.direct_instructor_income_amount is not null
          and b.direct_instructor_income_recognized_at is not null
          ${periodBounds ? periodStartFilter.replaceAll("{column}", "b.direct_instructor_income_recognized_at") : ""}
        group by s.instructor_id
      `,
      periodParams,
    ),
    queryRows<FinanceOperation>(
      `
        select audit_logs.id::text, audit_logs.action, audit_logs.entity_type, audit_logs.actor_role, audit_logs.metadata, audit_logs.created_at::text
             , coalesce(student_direct.id, student_credit_access.id)::text as student_id
             , coalesce(student_direct.display_label, student_credit_access.display_label) as student_name
             , instructor_subject.id::text as instructor_id
             , coalesce(instructor_subject.public_name, instructor_subject.name) as instructor_name
        from public.audit_logs
        left join public.student_prepaid_credits credit_subject
          on credit_subject.id::text = audit_logs.entity_id
         and audit_logs.entity_type = 'student_prepaid_credit'
        left join public.student_accesses student_direct
          on student_direct.id::text = audit_logs.metadata->>'student_access_id'
        left join public.student_accesses student_credit_access
          on student_credit_access.id = credit_subject.student_access_id
        left join public.instructors instructor_subject
          on instructor_subject.id::text = audit_logs.metadata->>'instructor_id'
        where audit_logs.organization_id = $1
          and (audit_logs.action like 'student_prepaid_%' or audit_logs.action like 'director_report_payout_%' or audit_logs.action like 'instructor_payout_%' or audit_logs.action = 'booking.source_settlement_completed')
          ${periodBounds ? periodStartFilter.replaceAll("{column}", "audit_logs.created_at") : ""}
        order by audit_logs.created_at desc limit 100
      `,
      periodParams,
    ),
    queryRows<StudentPaymentOption>(
      `
        select accesses.id::text, accesses.display_label as label, accesses.school_id::text,
               coalesce(array_agg(access_lesson_types.lesson_type_id::text order by access_lesson_types.lesson_type_id)
                 filter (where access_lesson_types.lesson_type_id is not null), '{}') as lesson_type_ids
        from public.student_accesses accesses
        left join public.student_access_lesson_types access_lesson_types
          on access_lesson_types.student_access_id = accesses.id
        where accesses.organization_id = $1 and accesses.is_active = true and accesses.is_archived = false
        group by accesses.id, accesses.display_label, accesses.school_id
        order by accesses.display_label
      `,
      [membership.organizationId],
    ),
    queryRows<PaymentSchool>(
      `select id::text, name from public.schools where organization_id = $1 and is_active = true order by name`,
      [membership.organizationId],
    ),
    queryRows<PaymentLessonType>(
      `select id::text, name from public.lesson_types where is_active = true order by sort_order, name`,
    ),
    queryRows<PaymentPrice>(
      `select school_id::text, lesson_type_id::text, price_amount::integer from public.school_lesson_type_prices where organization_id = $1`,
      [membership.organizationId],
    ),
  ]);

  const totals = summary[0] ?? { student_paid: 0, student_refunded: 0, instructor_accrued: 0, instructor_paid: 0, instructor_remaining: 0 };
  const studentRemaining = Math.max(totals.student_paid - totals.student_refunded, 0);
  const studentsWithPayments = new Set(studentPayments.map((payment) => payment.student_access_id)).size;
  const activePaymentCount = studentPayments.filter((payment) => payment.status === "active").length;
  const closedPaymentCount = studentPayments.filter((payment) => payment.status === "cancelled").length;
  const availableStudentUnits = studentPayments.reduce((sum, payment) => (
    sum + (payment.status === "active" ? Math.max(payment.quantity - payment.used_quantity, 0) : 0)
  ), 0);
  const financeInstructorItems: FinanceInstructorItem[] = instructorSettlements.map((item) => ({
    id: item.id,
    name: item.instructor_name,
    plannedAmount: item.planned_amount,
    paidAmount: item.paid_amount,
    remainingAmount: item.remaining_amount,
    directIncomeAmount:
      instructorDirectIncome.find((income) => income.instructor_id === item.id)?.amount ?? 0,
    students: instructorStudentSettlements
      .filter((student) => student.instructor_id === item.id)
      .map((student) => ({
        id: student.student_access_id,
        name: student.student_name,
        remainingAmount: student.remaining_amount,
        bookingCount: student.booking_count,
        bookingUnits: student.booking_units,
        prepaidUnits: student.prepaid_units,
        adjustmentCount: student.adjustment_count,
      })),
    payments: instructorPayments
      .filter((payment) => payment.instructor_id === item.id)
      .map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        paidAt: payment.paid_at,
        note: payment.payment_note,
      })),
  }));
  const instructorsWithOpenBalance = financeInstructorItems.filter((item) => item.remainingAmount > 0).length;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4 sm:space-y-6">
        <header className="rounded-2xl bg-white p-5 shadow-sm sm:p-7">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-zinc-900 p-2.5 text-white"><CircleDollarSign className="size-5" /></div>
            <div>
              <p className="text-sm font-medium text-zinc-500">Финансовый раздел</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Финансы</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">Здесь собраны оплаты учеников, расчёты с инструкторами и история денежных операций. Нажмите на сумму или нужный раздел, чтобы перейти к подробностям.</p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Период финансов</p>
              <p className="mt-1 text-xs text-zinc-500">Сейчас показано: {periodLabel}. «Всё время» показывает полный расчёт.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex" aria-label="Период финансов">
              {periodOptions.map((option) => (
                <Link key={option.value} href={option.value === "custom" ? currentFinanceHref(view) : financeHref(view, option.value)} className={`rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors ${period === option.value ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"}`}>
                  {option.label}
                </Link>
              ))}
            </div>
          </div>
          <form method="get" className="mt-3 grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <input type="hidden" name="view" value={view} />
            <input type="hidden" name="period" value="custom" />
            <label className="text-xs font-medium text-zinc-600">
              С даты
              <input name="from" type="date" defaultValue={period === "custom" ? params.from : ""} required className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900" />
            </label>
            <label className="text-xs font-medium text-zinc-600">
              По дату
              <input name="to" type="date" defaultValue={period === "custom" ? params.to : ""} required className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-900" />
            </label>
            <button type="submit" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700">Показать период</button>
          </form>
        </section>

        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Финансовые разделы">
          {views.map(({ key, label, description, icon: Icon }) => (
            <Link key={key} href={currentFinanceHref(key)} className={`rounded-xl border p-3 transition-colors ${view === key ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white text-zinc-800 hover:bg-zinc-50"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" />{label}</span>
              <span className={`mt-1 block text-xs ${view === key ? "text-zinc-300" : "text-zinc-500"}`}>{description}</span>
            </Link>
          ))}
        </nav>

        {view === "overview" && <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryLink href={currentFinanceHref("student-payments")} label="Оплачено учениками" value={formatMoney(totals.student_paid)} tone="emerald" />
          <SummaryLink href={currentFinanceHref("student-payments")} label="Возвращено ученикам" value={formatMoney(totals.student_refunded)} tone="amber" />
          <SummaryLink href={currentFinanceHref("student-payments")} label="Деньги после возвратов" value={formatMoney(studentRemaining)} />
          <SummaryLink href={currentFinanceHref("instructor-settlements")} label="Начислено инструкторам" value={formatMoney(totals.instructor_accrued)} />
          <SummaryLink href={currentFinanceHref("instructor-settlements")} label="К выдаче инструкторам" value={formatMoney(totals.instructor_remaining)} tone="amber" />
        </section>}

        {view === "overview" && (
          <div className="space-y-4">
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4"><p className="text-xs font-medium text-emerald-800">Ученики с оплатами</p><p className="mt-2 text-2xl font-semibold text-emerald-950">{studentsWithPayments}</p><p className="mt-1 text-xs text-emerald-800">учеников внесли деньги</p></div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4"><p className="text-xs font-medium text-sky-800">Активные оплаты</p><p className="mt-2 text-2xl font-semibold text-sky-950">{activePaymentCount}</p><p className="mt-1 text-xs text-sky-800">платежей можно использовать</p></div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4"><p className="text-xs font-medium text-amber-800">Доступно занятий</p><p className="mt-2 text-2xl font-semibold text-amber-950">{availableStudentUnits}</p><p className="mt-1 text-xs text-amber-800">можно записать учеников</p></div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4"><p className="text-xs font-medium text-rose-800">Закрытые оплаты</p><p className="mt-2 text-2xl font-semibold text-rose-950">{closedPaymentCount}</p><p className="mt-1 text-xs text-rose-800">остаток по ним закрыт</p></div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Что сейчас происходит с деньгами</CardTitle><CardDescription>Деньги после возвратов = все внесённые деньги минус фактические возвраты. Закрытые оплаты тоже входят в эту сумму.</CardDescription></CardHeader>
                <CardContent>
                  <dl className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white text-sm">
                    <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-zinc-600">Ученики внесли</dt><dd className="font-semibold text-emerald-800">{formatMoney(totals.student_paid)}</dd></div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-zinc-600">Ученикам фактически возвращено</dt><dd className="font-semibold text-amber-800">{formatMoney(totals.student_refunded)}</dd></div>
                    <div className="flex items-center justify-between gap-4 px-4 py-3"><dt className="text-zinc-600">Деньги после возвратов</dt><dd className="font-semibold">{formatMoney(studentRemaining)}</dd></div>
                  </dl>
                  <Link href={currentFinanceHref("student-payments")} className="mt-3 inline-block text-sm font-semibold text-zinc-800 underline underline-offset-4">Открыть оплаты учеников</Link>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Что требует внимания</CardTitle><CardDescription>Сюда попадают суммы, по которым может понадобиться действие.</CardDescription></CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div className={`rounded-lg border px-3 py-2 ${totals.instructor_remaining > 0 ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
                      {totals.instructor_remaining > 0 ? <><strong>К выдаче инструкторам: {formatMoney(totals.instructor_remaining)}</strong><p className="mt-1 text-xs">Открытых расчётов: {instructorsWithOpenBalance}. Перед выдачей откройте раздел выплат.</p></> : <strong>Открытых выплат инструкторам нет.</strong>}
                    </div>
                    <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sky-950"><strong>Занятий доступно для записи: {availableStudentUnits}</strong><p className="mt-1 text-xs">Это оплаченные, но ещё не использованные занятия учеников.</p></div>
                  </div>
                  <Link href={currentFinanceHref("instructor-settlements")} className="mt-3 inline-block text-sm font-semibold text-zinc-800 underline underline-offset-4">Открыть расчёты с инструкторами</Link>
                </CardContent>
              </Card>
            </section>

            <Card>
              <CardHeader><CardTitle>Последние финансовые действия</CardTitle><CardDescription>Последние изменения по оплатам, возвратам и выплатам. Нажмите на строку, чтобы открыть подробности.</CardDescription></CardHeader>
              <CardContent><FinanceOperationsTable operations={operations.slice(0, 5)} /><Link href={currentFinanceHref("operations")} className="mt-3 inline-block text-sm font-semibold text-zinc-800 underline underline-offset-4">Открыть всю историю операций</Link></CardContent>
            </Card>
          </div>
        )}

        {view === "student-payments" && (
          <Card><CardHeader><CardTitle>Оплаты учеников</CardTitle><CardDescription>Период: {periodLabel}. Предоплаты, их использование и фактически отмеченные возвраты.</CardDescription></CardHeader><CardContent><FinanceStudentPaymentsTable payments={studentPayments} students={paymentOptions} schools={paymentSchools} lessonTypes={paymentLessonTypes} prices={paymentPrices} /></CardContent></Card>
        )}

        {view === "instructor-settlements" && (
          <Card>
            <CardHeader>
              <CardTitle>Инструкторы и выплаты</CardTitle>
              <CardDescription>
                Период: {periodLabel}.{" "}
                Здесь видно, сколько начислено, сколько уже выдано, из чего сложился расчёт и какое действие нужно выполнить.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FinanceInstructorSettlements items={financeInstructorItems} period={period} returnPath={financeReturnPath} />
            </CardContent>
          </Card>
        )}

        {view === "operations" && (
          <Card><CardHeader><CardTitle>История денежных операций</CardTitle><CardDescription>Период: {periodLabel}. Последние изменения по оплатам, возвратам и расчётам.</CardDescription></CardHeader><CardContent><FinanceOperationsTable operations={operations} /></CardContent></Card>
        )}
      </div>
    </main>
  );
}
