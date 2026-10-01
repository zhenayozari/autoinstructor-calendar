import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  FileClock,
  GraduationCap,
  UsersRound,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import { FinanceStudentPaymentsTable } from "@/components/director/finance-student-payments-table";

export const dynamic = "force-dynamic";

type FinanceView = "overview" | "student-payments" | "instructor-settlements" | "operations";

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

type OperationRow = {
  id: string;
  action: string;
  entity_type: string;
  actor_role: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
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

function financeHref(view: FinanceView) {
  return `/director/finances?view=${view}`;
}

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

function MetadataAmount({ metadata }: { metadata: Record<string, unknown> | null }) {
  const amount = metadata?.amount;
  return typeof amount === "number" ? <span className="font-semibold">{formatMoney(amount)}</span> : null;
}

export default async function DirectorFinancesPage({
  searchParams,
}: {
  searchParams?: Promise<{ view?: string; section?: string }>;
}) {
  const membership = await requireDirectorAccess();
  const params = (await searchParams) ?? {};
  const view = getView(params.view ?? params.section);

  if (!isPostgresBackend()) {
    return (
      <main className="px-3 py-4 sm:px-6 sm:py-8">
        <div className="mx-auto max-w-6xl rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
          Финансовый раздел работает с новой базой PostgreSQL. Старые отчёты доступны в разделе «Итоги».
        </div>
      </main>
    );
  }

  const [summary, studentPayments, instructorSettlements, operations, paymentOptions, paymentSchools, paymentLessonTypes, paymentPrices] = await Promise.all([
    queryRows<{
      student_paid: number;
      student_refunded: number;
      instructor_accrued: number;
      instructor_paid: number;
      instructor_remaining: number;
    }>(
      `
        select
          (select coalesce(sum(final_total_amount), 0)::integer from public.student_prepaid_credits where organization_id = $1) as student_paid,
          (select coalesce(sum(refunds.amount), 0)::integer from public.student_prepaid_refunds refunds join public.student_prepaid_credits credits on credits.id = refunds.credit_id where refunds.organization_id = $1 and refunds.cancelled_at is null) as student_refunded,
          (select coalesce(sum(amount), 0)::integer from public.instructor_payout_entry_balances where organization_id = $1 and status = 'planned') as instructor_accrued,
          (select coalesce(sum(paid_amount), 0)::integer from public.instructor_payout_entry_balances where organization_id = $1 and status = 'planned') as instructor_paid,
          (select coalesce(sum(remaining_amount), 0)::integer from public.instructor_payout_entry_balances where organization_id = $1 and status = 'planned') as instructor_remaining
      `,
      [membership.organizationId],
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
        where credits.organization_id = $1
        order by credits.paid_at desc, credits.created_at desc
      `,
      [membership.organizationId],
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
        where instructors.organization_id = $1 and instructors.is_active = true
        group by instructors.id, instructors.public_name, instructors.name
        order by remaining_amount desc, instructor_name
      `,
      [membership.organizationId],
    ),
    queryRows<OperationRow>(
      `
        select id::text, action, entity_type, actor_role, metadata, created_at::text
        from public.audit_logs
        where organization_id = $1
          and (action like 'student_prepaid_%' or action like 'director_report_payout_%' or action like 'instructor_payout_%' or action = 'booking.source_settlement_completed')
        order by created_at desc limit 100
      `,
      [membership.organizationId],
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

        <nav className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" aria-label="Финансовые разделы">
          {views.map(({ key, label, description, icon: Icon }) => (
            <Link key={key} href={financeHref(key)} className={`rounded-xl border p-3 transition-colors ${view === key ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white text-zinc-800 hover:bg-zinc-50"}`}>
              <span className="flex items-center gap-2 text-sm font-semibold"><Icon className="size-4" />{label}</span>
              <span className={`mt-1 block text-xs ${view === key ? "text-zinc-300" : "text-zinc-500"}`}>{description}</span>
            </Link>
          ))}
        </nav>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryLink href={financeHref("student-payments")} label="Оплачено учениками" value={formatMoney(totals.student_paid)} tone="emerald" />
          <SummaryLink href={financeHref("student-payments")} label="Возвращено ученикам" value={formatMoney(totals.student_refunded)} tone="amber" />
          <SummaryLink href={financeHref("student-payments")} label="Осталось после возвратов" value={formatMoney(studentRemaining)} />
          <SummaryLink href={financeHref("instructor-settlements")} label="Начислено инструкторам" value={formatMoney(totals.instructor_accrued)} />
          <SummaryLink href={financeHref("instructor-settlements")} label="К выдаче инструкторам" value={formatMoney(totals.instructor_remaining)} tone="amber" />
        </section>

        {view === "overview" && (
          <Card><CardHeader><CardTitle>Что здесь можно посмотреть</CardTitle><CardDescription>Выберите один из финансовых блоков выше.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">
            {views.slice(1).map(({ key, label, description, icon: Icon }) => <Link key={key} href={financeHref(key)} className="rounded-xl border bg-white p-4 hover:bg-zinc-50"><Icon className="size-5 text-zinc-700" /><p className="mt-3 font-semibold">{label}</p><p className="mt-1 text-sm leading-5 text-zinc-500">{description}</p><span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold underline underline-offset-4">Открыть <ArrowRight className="size-4" /></span></Link>)}
          </CardContent></Card>
        )}

        {view === "student-payments" && (
          <Card><CardHeader><CardTitle>Оплаты учеников</CardTitle><CardDescription>Предоплаты, их использование и фактически отмеченные возвраты.</CardDescription></CardHeader><CardContent><FinanceStudentPaymentsTable payments={studentPayments} students={paymentOptions} schools={paymentSchools} lessonTypes={paymentLessonTypes} prices={paymentPrices} /></CardContent></Card>
        )}

        {view === "instructor-settlements" && (
          <Card><CardHeader><CardTitle>Расчёты с инструкторами</CardTitle><CardDescription>Суммы рассчитаны по всем текущим начислениям.</CardDescription></CardHeader><CardContent className="space-y-2">
            {instructorSettlements.map((item) => <Link key={item.id} href="/director/reports" className="block rounded-xl border bg-white p-4 hover:bg-zinc-50"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{item.instructor_name}</p><span className="font-semibold underline underline-offset-4">{formatMoney(item.remaining_amount)}</span></div><div className="mt-3 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3"><span>Начислено: {formatMoney(item.planned_amount)}</span><span>Выдано: {formatMoney(item.paid_amount)}</span><span>Осталось: {formatMoney(item.remaining_amount)}</span></div></Link>)}
          </CardContent></Card>
        )}

        {view === "operations" && (
          <Card><CardHeader><CardTitle>История денежных операций</CardTitle><CardDescription>Последние изменения по оплатам, возвратам и расчётам.</CardDescription></CardHeader><CardContent className="space-y-2">
            {operations.map((item) => <div key={item.id} className="flex flex-col gap-2 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{item.action}</p><p className="mt-1 text-sm text-zinc-500">{item.entity_type} · {item.actor_role}</p></div><div className="flex items-center gap-3 text-sm text-zinc-500"><MetadataAmount metadata={item.metadata} /><span>{formatDateTime(item.created_at, "Asia/Irkutsk")}</span></div></div>)}
          </CardContent></Card>
        )}
      </div>
    </main>
  );
}
