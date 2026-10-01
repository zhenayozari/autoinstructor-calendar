import Link from "next/link";
import {
  Archive,
  ChevronDown,
  CircleDollarSign,
  Filter,
  LayoutGrid,
  List,
  RefreshCw,
  Trash2,
  UserRoundCheck,
  UsersRound,
} from "lucide-react";
import {
  deleteStudentAccessDirectAction,
  restoreStudentAccessDirectAction,
} from "@/app/admin/students/actions";
import { StudentAvatar } from "@/components/student/student-avatar";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import { requireDirectorAccess } from "@/lib/director-auth";
import { formatMoney, selectClassName } from "@/lib/formatters";
import { buildActiveInstructorsQuery } from "@/lib/queries";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Instructor,
  LessonState,
  LessonType,
  School,
  SchoolLessonTypePrice,
  Slot,
  StudentAccess,
  StudentPrepaidCredit,
} from "@/lib/types";
import { StudentPrepaidCreditsPanel } from "@/components/admin/student-prepaid-credits-panel";
import { StudentProfileEditor } from "@/components/director/student-profile-editor";
import { StudentExamStatusEditor } from "@/components/director/student-exam-status-editor";

export const dynamic = "force-dynamic";

type DirectorStudentsPageProps = {
  searchParams?: Promise<{
    instructor?: string;
    school?: string;
    status?: string;
    debt?: string;
    delete_status?: string;
    restore_status?: string;
    view?: string;
    student?: string;
  }>;
};

type StudentAccessRow = Omit<StudentAccess, "lesson_type_ids">;

type StudentAccessLessonTypeRow = {
  student_access_id: string;
  lesson_type_id: string;
};

type StudentBookingRow = Pick<
  Booking,
  "id" | "slot_id" | "student_access_id"
> & {
  student_access_id: string;
  price_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean;
  lesson_state: LessonState;
};

type StudentSlotRow = Pick<Slot, "id" | "start_time" | "end_time">;

type StudentSummary = {
  plannedCount: number;
  completedCount: number;
  noShowCount: number;
  paidAmount: number;
  debtAmount: number;
};

type DirectorStudent = StudentAccessRow & {
  instructor: Instructor | null;
  school: School | null;
  lesson_type_ids: string[];
  prepaidCredits: StudentPrepaidCredit[];
  summary: StudentSummary;
};

function createEmptySummary(): StudentSummary {
  return {
    plannedCount: 0,
    completedCount: 0,
    noShowCount: 0,
    paidAmount: 0,
    debtAmount: 0,
  };
}

function getDebtAmount(
  booking: Pick<StudentBookingRow, "price_amount" | "paid_amount">,
) {
  return Math.max((booking.price_amount ?? 0) - (booking.paid_amount ?? 0), 0);
}

function MetricCard({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-zinc-950">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
    </div>
  );
}

function getActionStatusMessage(status?: string) {
  switch (status) {
    case "student-restored":
      return {
        tone: "success" as const,
        text: "Ученик восстановлен из архива.",
      };
    case "restore-error":
      return {
        tone: "error" as const,
        text: "Не удалось восстановить ученика. Обновите страницу и попробуйте ещё раз.",
      };
    case "student-deleted":
      return {
        tone: "success" as const,
        text: "Ученик удалён вместе с его записями.",
      };
    case "delete-error":
      return {
        tone: "error" as const,
        text: "Не удалось удалить ученика. Обновите страницу и попробуйте ещё раз.",
      };
    default:
      return null;
  }
}

function ActionStatusMessage({ status }: { status?: string }) {
  const message = getActionStatusMessage(status);

  if (!message) return null;

  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm ${
        message.tone === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {message.text}
    </div>
  );
}

function StatusPill({ student }: { student: DirectorStudent }) {
  if (student.is_archived) {
    return (
      <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
        Архив
      </span>
    );
  }

  return (
    <span
      className={
        student.is_active
          ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
          : "rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800"
      }
    >
      {student.is_active ? "Активен" : "Отключён"}
    </span>
  );
}

function StudentAccessActions({ student }: { student: DirectorStudent }) {
  return (
    <>
      {student.is_archived && (
        <form action={restoreStudentAccessDirectAction} className="mt-3">
          <input type="hidden" name="student_access_id" value={student.id} />
          <Button
            type="submit"
            variant="outline"
            className="h-10 w-full border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <RefreshCw className="size-4" />
            Восстановить из архива
          </Button>
        </form>
      )}

      <details className="mt-3 rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
        <summary className="cursor-pointer list-none text-sm font-semibold text-red-700">
          Удалить ученика
        </summary>
        <form action={deleteStudentAccessDirectAction} className="mt-3 space-y-3">
          <input type="hidden" name="student_access_id" value={student.id} />
          <label className="flex items-start gap-2 text-xs text-red-800">
            <input
              type="checkbox"
              name="confirm_delete"
              value="yes"
              required
              className="mt-0.5 size-4 shrink-0"
            />
            <span>
              Удалить ученика «{student.display_label}» вместе с его записями.
              Это действие нельзя отменить.
            </span>
          </label>
          <Button
            type="submit"
            variant="outline"
            className="h-10 w-full border-red-200 bg-white text-red-700 hover:bg-red-50 hover:text-red-800"
          >
            <Trash2 className="size-4" />
            Удалить навсегда
          </Button>
        </form>
      </details>
    </>
  );
}

function StudentCard({
  student,
  schools,
  lessonTypes,
  prices,
}: {
  student: DirectorStudent;
  schools: School[];
  lessonTypes: LessonType[];
  prices: SchoolLessonTypePrice[];
}) {
  return (
    <article
      id={`student-${student.id}`}
      className="scroll-mt-4 rounded-2xl border bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <StudentAvatar
            label={student.display_label}
            photoUrl={student.student_photo_url}
          />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">
              {student.display_label}
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              {student.instructor?.public_name ??
                student.instructor?.name ??
                "Инструктор не найден"}
            </p>
          </div>
        </div>
        <StatusPill student={student} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          {student.school?.name ?? "Частный ученик"}
        </span>
        {student.student_phone && (
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {student.student_phone}
          </span>
        )}
        <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
          Логин: {student.login}
        </span>
      </div>

      <StudentProfileEditor student={student} />
      <StudentExamStatusEditor student={student} />

      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">План</p>
          <p className="mt-1 text-lg font-semibold">
            {student.summary.plannedCount}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Проведено</p>
          <p className="mt-1 text-lg font-semibold">
            {student.summary.completedCount}
          </p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Неявки</p>
          <p className="mt-1 text-lg font-semibold">
            {student.summary.noShowCount}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
          <p className="text-xs font-medium text-emerald-700">Получено</p>
          <p className="mt-1 font-semibold text-emerald-950">
            {formatMoney(student.summary.paidAmount)}
          </p>
        </div>
        <div
          className={
            student.summary.debtAmount > 0
              ? "rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2"
              : "rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2"
          }
        >
          <p
            className={
              student.summary.debtAmount > 0
                ? "text-xs font-medium text-amber-700"
                : "text-xs font-medium text-zinc-500"
            }
          >
            Долг
          </p>
          <p
            className={
              student.summary.debtAmount > 0
                ? "mt-1 font-semibold text-amber-950"
                : "mt-1 font-semibold text-zinc-950"
            }
          >
            {formatMoney(student.summary.debtAmount)}
          </p>
        </div>
      </div>

      <div className="mt-3">
        <StudentPrepaidCreditsPanel
          accessId={student.id}
          accessSchoolId={student.school_id}
          accessLessonTypeIds={student.lesson_type_ids}
          credits={student.prepaidCredits}
          schools={student.school_id ? schools.filter((school) => school.id === student.school_id) : schools}
          lessonTypes={lessonTypes}
          prices={prices}
          canManage
        />
      </div>

      <StudentAccessActions student={student} />
    </article>
  );
}

function StudentListMetric({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "emerald" | "amber";
}) {
  const className =
    tone === "emerald"
      ? "border-emerald-100 bg-emerald-50/70 text-emerald-950"
      : tone === "amber"
        ? "border-amber-100 bg-amber-50/70 text-amber-950"
        : "border-zinc-100 bg-zinc-50 text-zinc-950";

  return (
    <div className={`rounded-xl border px-3 py-2 ${className}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function StudentListItem({
  student,
  schools,
  lessonTypes,
  prices,
  isInitiallyOpen = false,
}: {
  student: DirectorStudent;
  schools: School[];
  lessonTypes: LessonType[];
  prices: SchoolLessonTypePrice[];
  isInitiallyOpen?: boolean;
}) {
  const instructorName =
    student.instructor?.public_name ??
    student.instructor?.name ??
    "Инструктор не найден";
  const sourceName = student.school?.name ?? "Частный ученик";

  return (
    <details
      id={`student-${student.id}`}
      open={isInitiallyOpen}
      className="group scroll-mt-4 rounded-2xl border bg-white shadow-sm open:shadow-md"
    >
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-start gap-3">
          <StudentAvatar
            label={student.display_label}
            photoUrl={student.student_photo_url}
            className="size-10"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">
                {student.display_label}
              </h2>
              <StatusPill student={student} />
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
              <span>{instructorName}</span>
              <span>·</span>
              <span>{sourceName}</span>
              {student.student_phone && (
                <>
                  <span>·</span>
                  <span>{student.student_phone}</span>
                </>
              )}
              <span>·</span>
              <span>Логин: {student.login}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:min-w-[520px] sm:grid-cols-[90px_90px_110px_110px_32px] sm:items-center">
          <StudentListMetric
            label="План"
            value={`${student.summary.plannedCount}`}
          />
          <StudentListMetric
            label="Проведено"
            value={`${student.summary.completedCount}`}
          />
          <StudentListMetric
            label="Получено"
            value={formatMoney(student.summary.paidAmount)}
            tone="emerald"
          />
          <StudentListMetric
            label="Долг"
            value={formatMoney(student.summary.debtAmount)}
            tone={student.summary.debtAmount > 0 ? "amber" : "default"}
          />
          <ChevronDown className="hidden size-5 text-zinc-400 transition group-open:rotate-180 sm:block" />
        </div>
      </summary>

      <div className="border-t px-4 py-4">
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <StudentListMetric
            label="План"
            value={`${student.summary.plannedCount}`}
          />
          <StudentListMetric
            label="Проведено"
            value={`${student.summary.completedCount}`}
          />
          <StudentListMetric
            label="Неявки"
            value={`${student.summary.noShowCount}`}
          />
          <StudentListMetric
            label="Получено"
            value={formatMoney(student.summary.paidAmount)}
            tone="emerald"
          />
          <StudentListMetric
            label="Долг"
            value={formatMoney(student.summary.debtAmount)}
            tone={student.summary.debtAmount > 0 ? "amber" : "default"}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            {sourceName}
          </span>
          {student.student_phone && (
            <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
              {student.student_phone}
            </span>
          )}
          <span className="rounded-full bg-zinc-100 px-2 py-1 font-medium">
            Логин: {student.login}
          </span>
        </div>

        <StudentProfileEditor student={student} />
        <StudentExamStatusEditor student={student} />

        <div className="mt-3">
          <StudentPrepaidCreditsPanel
            accessId={student.id}
            accessSchoolId={student.school_id}
            accessLessonTypeIds={student.lesson_type_ids}
            credits={student.prepaidCredits}
            schools={student.school_id ? schools.filter((school) => school.id === student.school_id) : schools}
            lessonTypes={lessonTypes}
            prices={prices}
            canManage
          />
        </div>

        <StudentAccessActions student={student} />
      </div>
    </details>
  );
}

export default async function DirectorStudentsPage({
  searchParams,
}: DirectorStudentsPageProps) {
  const params = (await searchParams) ?? {};
  const membership = await requireDirectorAccess();
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend || hasSupabaseAdminKey();
  let instructors: Instructor[] = [];
  let schools: School[] = [];
  let accesses: StudentAccessRow[] = [];
  let bookings: StudentBookingRow[] = [];
  let slots: StudentSlotRow[] = [];
  let lessonTypes: LessonType[] = [];
  let schoolLessonTypePrices: SchoolLessonTypePrice[] = [];
  let prepaidCredits: StudentPrepaidCredit[] = [];
  let accessLessonTypeRows: StudentAccessLessonTypeRow[] = [];
  let loadError: { message: string } | null = null;

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
    const { data: instructorData, error: instructorError } =
      await buildActiveInstructorsQuery(
        supabase,
        membership,
        "id, name, slug, public_name, timezone, is_active",
    );

    instructors = (instructorData ?? []) as Instructor[];
    loadError = instructorError;
  }

  const instructorIds = instructors.map((instructor) => instructor.id);
  await autoCompletePastBookings({ instructorIds });

  if (postgresBackend) {
    [schools, accesses] = await Promise.all([
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
      instructorIds.length > 0
        ? queryRows<StudentAccessRow>(
            `
              select id, instructor_id, display_label, first_name, last_name,
                     student_phone,
                     student_photo_url, login,
                     total_lesson_limit, weekly_lesson_limit, school_id,
                     is_active, passed_exam, is_archived, archived_at::text as archived_at,
                     created_at::text as created_at, updated_at::text as updated_at
              from public.student_accesses
              where organization_id = $1
                and instructor_id = any($2::uuid[])
              order by display_label
            `,
            [membership.organizationId, instructorIds],
          )
        : Promise.resolve([]),
    ]);
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const [
      { data: schoolData, error: schoolError },
      { data: accessData, error: accessError },
    ] = await Promise.all([
      supabase
        .from("schools")
        .select("id, organization_id, name, color, default_price, is_active, created_at, updated_at")
        .eq("organization_id", membership.organizationId)
        .order("name"),
      instructorIds.length > 0
        ? supabase
            .from("student_accesses")
            .select(
              "id, instructor_id, display_label, first_name, last_name, student_phone, student_photo_url, login, total_lesson_limit, weekly_lesson_limit, school_id, is_active, passed_exam, is_archived, archived_at, created_at, updated_at",
            )
            .eq("organization_id", membership.organizationId)
            .in("instructor_id", instructorIds)
            .order("display_label")
        : Promise.resolve({ data: [], error: null }),
    ]);

    schools = (schoolData ?? []) as School[];
    accesses = (accessData ?? []) as StudentAccessRow[];
    loadError = loadError ?? schoolError ?? accessError;
  }

  const accessIds = accesses.map((access) => access.id);

  if (postgresBackend) {
    [lessonTypes, schoolLessonTypePrices, prepaidCredits, accessLessonTypeRows] =
      await Promise.all([
        queryRows<LessonType>(
          `
            select id, code, name, color, kind, tags, sort_order, is_active,
                   default_duration_minutes, default_price_amount, requires_vehicle
            from public.lesson_types
            order by sort_order, name
          `,
        ),
        queryRows<SchoolLessonTypePrice>(
          `
            select id, organization_id, school_id, lesson_type_id, price_amount,
                   created_at::text as created_at, updated_at::text as updated_at
            from public.school_lesson_type_prices
            where organization_id = $1
          `,
          [membership.organizationId],
        ),
        accessIds.length > 0
          ? queryRows<StudentPrepaidCredit>(
              `
                select credits.id,
                       credits.organization_id,
                       credits.student_access_id,
                       credits.instructor_id,
                       credits.school_id,
                       credits.lesson_type_id,
                       credits.quantity,
                       credits.calculated_unit_price,
                       credits.calculated_total_amount,
                       credits.final_unit_price,
                       credits.final_total_amount,
                       credits.paid_at::text as paid_at,
                       credits.payment_note,
                       credits.status,
                       credits.cancelled_at::text as cancelled_at,
                       credits.cancellation_note,
                       (
                         select coalesce(sum(refunds.amount), 0)::integer
                         from public.student_prepaid_refunds refunds
                         where refunds.credit_id = credits.id
                           and refunds.cancelled_at is null
                       ) as refunded_amount,
                       coalesce((
                         select jsonb_agg(
                           jsonb_build_object(
                             'id', refunds.id,
                             'amount', refunds.amount,
                             'refunded_at', refunds.refunded_at,
                             'refund_note', refunds.refund_note,
                             'cancelled_at', refunds.cancelled_at,
                             'cancellation_note', refunds.cancellation_note
                           )
                           order by refunds.refunded_at desc, refunds.created_at desc
                         )
                         from public.student_prepaid_refunds refunds
                         where refunds.credit_id = credits.id
                       ), '[]'::jsonb) as refunds,
                       coalesce((
                         select jsonb_agg(
                           jsonb_build_object(
                             'id', adjustments.id,
                             'previous_quantity', adjustments.previous_quantity,
                             'previous_final_total_amount', adjustments.previous_final_total_amount,
                             'new_quantity', adjustments.new_quantity,
                             'new_final_total_amount', adjustments.new_final_total_amount,
                             'reason', adjustments.reason,
                             'created_at', adjustments.created_at
                           )
                           order by adjustments.created_at desc
                         )
                         from public.student_prepaid_credit_adjustments adjustments
                         where adjustments.credit_id = credits.id
                       ), '[]'::jsonb) as adjustments,
                       credits.created_at::text as created_at,
                       credits.updated_at::text as updated_at,
                       count(usages.id) filter (where usages.status = 'active')::integer
                         as used_quantity
                from public.student_prepaid_credits credits
                left join public.student_prepaid_credit_usages usages
                  on usages.credit_id = credits.id
                where credits.organization_id = $1
                  and credits.student_access_id = any($2::uuid[])
                group by credits.id
                order by credits.paid_at desc, credits.created_at desc
              `,
              [membership.organizationId, accessIds],
            )
          : Promise.resolve([]),
        accessIds.length > 0
          ? queryRows<StudentAccessLessonTypeRow>(
              `
                select student_access_id, lesson_type_id
                from public.student_access_lesson_types
                where student_access_id = any($1::uuid[])
              `,
              [accessIds],
            )
          : Promise.resolve([]),
      ]);
  }

  if (postgresBackend) {
    bookings =
      accessIds.length > 0
        ? await queryRows<StudentBookingRow>(
            `
              select id, slot_id, student_access_id, price_amount, paid_amount,
                     is_paid, lesson_state
              from public.bookings
              where student_access_id = any($1::uuid[])
                and status = 'confirmed'
            `,
            [accessIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: bookingData, error: bookingError } =
      accessIds.length > 0
        ? await supabase
            .from("bookings")
            .select(
              "id, slot_id, student_access_id, price_amount, paid_amount, is_paid, lesson_state",
            )
            .in("student_access_id", accessIds)
            .eq("status", "confirmed")
        : { data: [], error: null };

    bookings = (bookingData ?? []) as StudentBookingRow[];
    loadError = loadError ?? bookingError;
  }

  const slotIds = bookings.map((booking) => booking.slot_id);

  if (postgresBackend) {
    slots =
      slotIds.length > 0
        ? await queryRows<StudentSlotRow>(
            `
              select id, start_time::text as start_time, end_time::text as end_time
              from public.slots
              where id = any($1::uuid[])
            `,
            [slotIds],
          )
        : [];
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: slotData, error: slotError } =
      slotIds.length > 0
        ? await supabase
            .from("slots")
            .select("id, start_time, end_time")
            .in("id", slotIds)
        : { data: [], error: null };

    slots = (slotData ?? []) as StudentSlotRow[];
    loadError = loadError ?? slotError;
  }

  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const schoolsById = new Map(schools.map((school) => [school.id, school]));
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const bookingsByAccessId = new Map<string, StudentBookingRow[]>();
  const lessonTypeIdsByAccessId = new Map<string, string[]>();
  const prepaidCreditsByAccessId = new Map<string, StudentPrepaidCredit[]>();

  for (const row of accessLessonTypeRows) {
    const ids = lessonTypeIdsByAccessId.get(row.student_access_id) ?? [];
    ids.push(row.lesson_type_id);
    lessonTypeIdsByAccessId.set(row.student_access_id, ids);
  }

  for (const credit of prepaidCredits) {
    const credits = prepaidCreditsByAccessId.get(credit.student_access_id) ?? [];
    credits.push(credit);
    prepaidCreditsByAccessId.set(credit.student_access_id, credits);
  }

  for (const booking of bookings) {
    const items = bookingsByAccessId.get(booking.student_access_id) ?? [];
    items.push(booking);
    bookingsByAccessId.set(booking.student_access_id, items);
  }

  const students = accesses.map((access): DirectorStudent => {
    const accessBookings = bookingsByAccessId.get(access.id) ?? [];
    const summary = createEmptySummary();

    for (const booking of accessBookings) {
      if (!slotsById.has(booking.slot_id)) continue;

      if (booking.lesson_state === "scheduled") summary.plannedCount += 1;
      if (booking.lesson_state === "completed") summary.completedCount += 1;
      if (booking.lesson_state === "no_show") summary.noShowCount += 1;

      summary.paidAmount += booking.paid_amount ?? 0;
      summary.debtAmount += getDebtAmount(booking);
    }

    return {
      ...access,
      instructor: instructorsById.get(access.instructor_id) ?? null,
      school: access.school_id ? schoolsById.get(access.school_id) ?? null : null,
      lesson_type_ids: lessonTypeIdsByAccessId.get(access.id) ?? [],
      prepaidCredits: prepaidCreditsByAccessId.get(access.id) ?? [],
      summary,
    };
  });
  const selectedInstructorId =
    params.instructor && params.instructor !== "all" ? params.instructor : "all";
  const selectedSchoolId =
    params.school && params.school !== "all" ? params.school : "all";
  const selectedStatus =
    params.status === "archived" || params.status === "disabled"
      ? params.status
      : "active";
  const selectedDebt = params.debt === "debt" ? "debt" : "all";
  const selectedView = params.view === "list" ? "list" : "grid";
  const filteredStudents = students.filter((student) => {
    if (
      selectedInstructorId !== "all" &&
      student.instructor_id !== selectedInstructorId
    ) {
      return false;
    }

    if (selectedSchoolId !== "all" && student.school_id !== selectedSchoolId) {
      return false;
    }

    if (selectedStatus === "active" && (student.is_archived || !student.is_active)) {
      return false;
    }

    if (selectedStatus === "archived" && !student.is_archived) {
      return false;
    }

    if (selectedStatus === "disabled" && (student.is_archived || student.is_active)) {
      return false;
    }

    if (selectedDebt === "debt" && student.summary.debtAmount <= 0) {
      return false;
    }

    return true;
  });
  const activeStudents = students.filter(
    (student) => student.is_active && !student.is_archived,
  );
  const archivedStudents = students.filter((student) => student.is_archived);
  const totalDebt = students.reduce(
    (sum, student) => sum + student.summary.debtAmount,
    0,
  );
  const studentsWithDebt = students.filter(
    (student) => student.summary.debtAmount > 0,
  ).length;
  const getViewHref = (view: "grid" | "list") => {
    const query = new URLSearchParams();

    if (selectedInstructorId !== "all") {
      query.set("instructor", selectedInstructorId);
    }

    if (selectedSchoolId !== "all") {
      query.set("school", selectedSchoolId);
    }

    if (selectedStatus !== "active") {
      query.set("status", selectedStatus);
    }

    if (selectedDebt !== "all") {
      query.set("debt", selectedDebt);
    }

    query.set("view", view);

    return `/director/students?${query.toString()}`;
  };

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ученики школы
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Общий список учеников. Доступы по-прежнему выдают инструкторы.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <ActionStatusMessage status={params.restore_status} />
        <ActionStatusMessage status={params.delete_status} />

        <section className="grid gap-2 sm:grid-cols-4">
          <MetricCard
            label="Активные"
            value={`${activeStudents.length}`}
            description={`${archivedStudents.length} в архиве`}
          />
          <MetricCard
            label="Всего"
            value={`${students.length}`}
            description="Все доступы учеников"
          />
          <MetricCard
            label="С долгом"
            value={`${studentsWithDebt}`}
            description={formatMoney(totalDebt)}
          />
          <MetricCard
            label="Показано"
            value={`${filteredStudents.length}`}
            description="После фильтров"
          />
        </section>

        <section className="rounded-2xl border bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-3 flex items-start gap-2">
            <Filter className="mt-1 size-4 shrink-0" />
            <div>
              <h2 className="font-semibold">Фильтры</h2>
              <p className="text-muted-foreground mt-1 text-sm">
                Быстрый способ найти учеников по инструктору, источнику и долгу.
              </p>
            </div>
          </div>
          <form className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="view" value={selectedView} />
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-instructor">
                Инструктор
              </label>
              <select
                id="students-instructor"
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
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-school">
                Источник
              </label>
              <select
                id="students-school"
                name="school"
                className={selectClassName}
                defaultValue={selectedSchoolId}
              >
                <option value="all">Все источники</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-status">
                Статус
              </label>
              <select
                id="students-status"
                name="status"
                className={selectClassName}
                defaultValue={selectedStatus}
              >
                <option value="active">Активные</option>
                <option value="disabled">Отключённые</option>
                <option value="archived">Архив</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="students-debt">
                Долг
              </label>
              <select
                id="students-debt"
                name="debt"
                className={selectClassName}
                defaultValue={selectedDebt}
              >
                <option value="all">Все</option>
                <option value="debt">Только с долгом</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="h-10 w-full">
                Показать
              </Button>
            </div>
          </form>
        </section>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UserRoundCheck className="size-4" />
                  Список учеников
                </CardTitle>
                <CardDescription>
                  Просмотр для руководителя. Редактирование остаётся у инструктора.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <div className="grid grid-cols-2 rounded-xl border bg-zinc-50 p-1">
                  <Button
                    nativeButton={false}
                    render={<Link href={getViewHref("grid")} />}
                    variant={selectedView === "grid" ? "default" : "ghost"}
                    size="sm"
                    className="h-8"
                  >
                    <LayoutGrid className="size-4" />
                    Сетка
                  </Button>
                  <Button
                    nativeButton={false}
                    render={<Link href={getViewHref("list")} />}
                    variant={selectedView === "list" ? "default" : "ghost"}
                    size="sm"
                    className="h-8"
                  >
                    <List className="size-4" />
                    Список
                  </Button>
                </div>
                <Button
                  nativeButton={false}
                  render={<Link href="/director/reports" />}
                  variant="outline"
                  className="h-9 w-full shadow-sm sm:w-auto"
                >
                  <CircleDollarSign className="size-4" />
                  Итоги
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredStudents.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                По выбранным фильтрам учеников нет.
              </div>
            ) : (
              selectedView === "list" ? (
                <div className="space-y-2">
                  {filteredStudents.map((student) => (
                    <StudentListItem
                      key={student.id}
                      student={student}
                      schools={schools}
                      lessonTypes={lessonTypes}
                      prices={schoolLessonTypePrices}
                      isInitiallyOpen={params.student === student.id}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {filteredStudents.map((student) => (
                    <StudentCard
                      key={student.id}
                      student={student}
                      schools={schools}
                      lessonTypes={lessonTypes}
                      prices={schoolLessonTypePrices}
                    />
                  ))}
                </div>
              )
            )}
          </CardContent>
        </Card>

        <section className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="size-4" />
                Инструкторы
              </CardTitle>
              <CardDescription>
                У каждого ученика видно, за каким инструктором он закреплён.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Archive className="size-4" />
                Архив
              </CardTitle>
              <CardDescription>
                Архивные ученики скрыты по умолчанию, но доступны фильтром.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CircleDollarSign className="size-4" />
                Долги
              </CardTitle>
              <CardDescription>
                Долг считается по всем подтверждённым записям ученика.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </div>
    </main>
  );
}
