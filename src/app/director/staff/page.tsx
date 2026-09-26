import Link from "next/link";
import { headers } from "next/headers";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Link2,
  X,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  approveStaffInvitationAction,
  backfillStaffPayoutEntriesAction,
  createStaffPayoutPaymentAction,
  createStaffPayoutRateRuleAction,
  createStaffInvitationAction,
  deleteStaffInvitationAction,
  deleteStaffInstructorAction,
  disableStaffPayoutRateRuleAction,
  rejectStaffInvitationAction,
  updateStaffPayoutSettingsAction,
  updateOwnerPayoutPolicyAction,
  updateStaffInstructorStatusAction,
} from "@/app/director/staff/actions";
import { Button } from "@/components/ui/button";
import { StaffInvitationLinkCopy } from "@/components/director/staff-invitation-link-copy";
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
  addUtcDays,
  formatDate,
  formatDateValue,
  formatLocalDateTime,
  formatMoney,
  getLocalDate,
  getUtcWeekStart,
} from "@/lib/formatters";
import { getPublicOrigin } from "@/lib/public-origin";
import { autoCompletePastBookings } from "@/lib/auto-complete-bookings";
import { isPostgresBackend } from "@/lib/backend-mode";
import { queryRows } from "@/lib/db/postgres";
import {
  ensureInstructorPayoutSettingsForOrganization,
  getInstructorPayoutSetup,
  getOwnerPayoutPolicy,
  type InstructorPayoutSetup,
} from "@/lib/instructor-payouts";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type {
  Booking,
  BookingCategory,
  Instructor,
  InstructorPayoutRateRule,
  LessonType,
  LessonState,
  ScheduleDay,
  School,
  Slot,
  StaffInvitation,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type StaffInstructor = Instructor & {
  organization_id: string;
  is_active: boolean;
  photo_url: string | null;
};

type StaffBooking = Pick<Booking, "id" | "slot_id"> & {
  price_amount: number | null;
  paid_amount: number | null;
  lesson_state: LessonState;
};

type StaffMember = {
  id: string;
  instructor_id: string | null;
  role: "owner" | "admin" | "instructor";
  is_active: boolean;
};

type StaffContact = {
  email: string | null;
  phone: string | null;
};

type StaffStats = {
  studentCount: number;
  weekSlots: number;
  weekBookings: number;
  weekCompleted: number;
  weekPaidAmount: number;
  weekDebtAmount: number;
};

type StaffPayoutPanelProps = {
  instructor: StaffInstructor;
  payoutSetup: InstructorPayoutSetup | null;
  schools: School[];
  lessonTypes: LessonType[];
  currentDate: string;
  defaultOpen?: boolean;
};

type DirectorStaffPageProps = {
  searchParams?: Promise<{
    invite?: string;
    staff?: string;
  }>;
};

function createEmptyStats(): StaffStats {
  return {
    studentCount: 0,
    weekSlots: 0,
    weekBookings: 0,
    weekCompleted: 0,
    weekPaidAmount: 0,
    weekDebtAmount: 0,
  };
}

function getDebtAmount(booking: Pick<StaffBooking, "price_amount" | "paid_amount">) {
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

function StatusPill({
  isActive,
  isPending,
}: {
  isActive: boolean;
  isPending?: boolean;
}) {
  if (isPending) {
    return (
      <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
        Ждёт подтверждения
      </span>
    );
  }

  return (
    <span
      className={
        isActive
          ? "rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800"
          : "rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
      }
    >
      {isActive ? "Активен" : "Архив"}
    </span>
  );
}

function getInviteStatusMessage(status?: string) {
  switch (status) {
    case "created":
      return "Приглашение создано. Ссылку можно отправить сотруднику.";
    case "invitation-deleted":
      return "Ссылка приглашения удалена.";
    case "approved":
      return "Сотрудник подтверждён. Теперь он может войти как инструктор.";
    case "rejected":
      return "Заявка сотрудника отклонена.";
    case "staff-updated":
      return "Доступ сотрудника обновлён.";
    case "staff-deleted":
      return "Сотрудник удалён из школы.";
    case "payout-updated":
      return "Настройки выплат сотруднику сохранены.";
    case "payout-rate-created":
      return "Ставка выплаты сотруднику добавлена.";
    case "payout-rate-disabled":
      return "Ставка выплаты сотруднику отключена.";
    case "payout-paid":
      return "Выдача денег сотруднику отмечена.";
    case "payout-backfilled":
      return "Начисления по старым записям обновлены.";
    case "owner-payout-updated":
      return "Настройка выплат владельцу сохранена.";
    case "error":
      return "Не удалось выполнить действие. Проверьте миграцию и служебный ключ проекта.";
    default:
      return null;
  }
}

function getAccrualPolicyLabel(value: string) {
  return value === "prepaid" ? "Предоплата" : "Постоплата";
}

function getSourceVisibilityLabel(value: string) {
  return value === "selected_only" ? "Только выбранные" : "Все активные";
}

function getBookingCategoryLabel(value: BookingCategory | null) {
  if (value === "regular") return "обычная запись";
  if (value === "extra") return "доп. занятие";
  if (value === "gift") return "подарочное";
  return "любая запись";
}

function getRuleLabel(
  rule: InstructorPayoutRateRule,
  schoolById: Map<string, School>,
  lessonTypeById: Map<string, LessonType>,
) {
  const source = rule.school_id
    ? schoolById.get(rule.school_id)?.name ?? "источник удалён"
    : "любой источник";
  const lessonType = rule.lesson_type_id
    ? lessonTypeById.get(rule.lesson_type_id)?.name ?? "тип удалён"
    : "любой тип";

  return `${source} · ${lessonType} · ${getBookingCategoryLabel(rule.booking_category)}`;
}

function StaffPayoutPanel({
  instructor,
  payoutSetup,
  schools,
  lessonTypes,
  currentDate,
  defaultOpen = false,
}: StaffPayoutPanelProps) {
  if (!payoutSetup) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
        Выплаты появятся после применения миграции PostgreSQL.
      </div>
    );
  }

  const activeSchools = schools.filter((school) => school.is_active !== false);
  const activeLessonTypes = lessonTypes.filter(
    (lessonType) => lessonType.is_active !== false,
  );
  const visibleSchoolIds = new Set(
    payoutSetup.sourceVisibility
      .filter((item) => item.is_visible)
      .map((item) => item.school_id),
  );
  const schoolById = new Map(schools.map((school) => [school.id, school]));
  const lessonTypeById = new Map(
    lessonTypes.map((lessonType) => [lessonType.id, lessonType]),
  );
  const activeRateRules = payoutSetup.rateRules.filter((rule) => rule.is_active);
  const inactiveRateCount = payoutSetup.rateRules.length - activeRateRules.length;

  return (
    <details
      className="group mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 shadow-sm open:bg-zinc-50/70"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-100/80">
        <span>Выплаты</span>
        <ChevronDown className="size-4 text-emerald-700 transition group-open:rotate-180" />
      </summary>

      <div className="mt-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Начислено</p>
            <p className="font-semibold">
              {formatMoney(payoutSetup.summary.planned_amount)}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">Выдано</p>
            <p className="font-semibold">
              {formatMoney(payoutSetup.summary.paid_amount)}
            </p>
          </div>
          <div className="rounded-xl bg-white px-3 py-2">
            <p className="text-xs text-zinc-500">К выдаче</p>
            <p className="font-semibold">
              {formatMoney(payoutSetup.summary.remaining_amount)}
            </p>
          </div>
        </div>

        {payoutSetup.summary.remaining_amount > 0 && (
          <form
            action={createStaffPayoutPaymentAction}
            className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"
          >
            <input type="hidden" name="instructor_id" value={instructor.id} />
            <div className="grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end">
              <label className="space-y-2 text-sm font-medium">
                <span>Выдано, ₽</span>
                <input
                  type="number"
                  name="amount"
                  min={1}
                  max={payoutSetup.summary.remaining_amount}
                  defaultValue={payoutSetup.summary.remaining_amount}
                  className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                />
              </label>
              <label className="space-y-2 text-sm font-medium">
                <span>Комментарий</span>
                <input
                  name="payment_note"
                  maxLength={500}
                  placeholder="Например: переводом за неделю"
                  className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
                />
              </label>
              <Button type="submit" className="h-10 shadow-md shadow-emerald-950/15">
                Отметить выдачу
              </Button>
            </div>
            <p className="text-xs leading-5 text-emerald-900">
              После сохранения сумма перейдёт из “к выдаче” в “выдано”. Если
              указать часть суммы, остаток останется к выдаче.
            </p>
          </form>
        )}

        <form action={updateStaffPayoutSettingsAction} className="space-y-3 rounded-xl border bg-white p-3">
          <input type="hidden" name="instructor_id" value={instructor.id} />

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>Когда начислять инструктору</span>
              <select
                name="accrual_policy"
                defaultValue={payoutSetup.settings.accrual_policy}
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="postpaid">Постоплата: после проведённого занятия</option>
                <option value="prepaid">Предоплата: сразу после записи ученика</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Лимит занятий в неделю</span>
              <input
                type="number"
                name="weekly_lesson_limit"
                min={1}
                max={200}
                defaultValue={payoutSetup.settings.weekly_lesson_limit ?? ""}
                placeholder="Без лимита"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Источники в кабинете инструктора</span>
              <select
                name="source_visibility_mode"
                defaultValue={payoutSetup.settings.source_visibility_mode}
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="all_active">Показывать все активные</option>
                <option value="selected_only">Показывать только выбранные</option>
              </select>
            </label>

            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                name="show_client_prices"
                value="true"
                defaultChecked={payoutSetup.settings.show_client_prices}
                className="size-4"
              />
              Инструктор видит цены ученика
            </label>

            <label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium">
              <input
                type="checkbox"
                name="can_manage_student_packages"
                value="true"
                defaultChecked={payoutSetup.settings.can_manage_student_packages}
                className="size-4"
              />
              Может добавлять и менять доп. доступы учеников
            </label>
          </div>

          {activeSchools.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-600">
                Какие источники доступны сотруднику, если выбран режим “только выбранные”
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeSchools.map((school) => (
                  <label
                    key={school.id}
                    className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm font-medium"
                  >
                    <input
                      type="checkbox"
                      name="visible_school_id"
                      value={school.id}
                      defaultChecked={
                        payoutSetup.settings.source_visibility_mode === "all_active" ||
                        visibleSchoolIds.has(school.id)
                      }
                      className="size-4"
                    />
                    {school.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          <Button type="submit" variant="accent" className="h-10 w-full">
            Сохранить выплаты и источники
          </Button>
        </form>

        <form action={createStaffPayoutRateRuleAction} className="space-y-3 rounded-xl border bg-white p-3">
          <input type="hidden" name="instructor_id" value={instructor.id} />
          <p className="text-sm font-semibold">Добавить ставку</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-medium">
              <span>Сумма инструктору за занятие</span>
              <input
                type="number"
                name="amount"
                min={0}
                max={10000000}
                required
                placeholder="1200"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Действует с даты</span>
              <input
                type="date"
                name="effective_from"
                required
                defaultValue={currentDate}
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              />
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Источник</span>
              <select
                name="school_id"
                defaultValue="all"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="all">Любой источник</option>
                {activeSchools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Тип занятия</span>
              <select
                name="lesson_type_id"
                defaultValue="all"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="all">Любой тип</option>
                {activeLessonTypes.map((lessonType) => (
                  <option key={lessonType.id} value={lessonType.id}>
                    {lessonType.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Категория записи</span>
              <select
                name="booking_category"
                defaultValue="all"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              >
                <option value="all">Любая запись</option>
                <option value="regular">Обычная</option>
                <option value="extra">Доп. занятие</option>
                <option value="gift">Подарочная</option>
              </select>
            </label>

            <label className="space-y-2 text-sm font-medium">
              <span>Действует до даты</span>
              <input
                type="date"
                name="effective_to"
                className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
              />
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium">
            <span>Комментарий</span>
            <input
              name="note"
              maxLength={300}
              placeholder="Например: базовая ставка"
              className="h-10 w-full rounded-xl border bg-white px-3 text-sm"
            />
          </label>

          <Button type="submit" className="h-10 w-full shadow-md shadow-zinc-950/15">
            Добавить ставку
          </Button>
        </form>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Активные ставки</p>
            <p className="text-xs text-zinc-500">
              {getAccrualPolicyLabel(payoutSetup.settings.accrual_policy)} ·{" "}
              {getSourceVisibilityLabel(payoutSetup.settings.source_visibility_mode)}
            </p>
          </div>

          {activeRateRules.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white px-3 py-4 text-center text-sm text-zinc-500">
              Ставок пока нет. Начисления не будут создаваться, пока руководитель
              не задаст сумму.
            </div>
          ) : (
            <div className="space-y-2">
              {activeRateRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-col gap-3 rounded-xl border bg-white px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{formatMoney(rule.amount)}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {getRuleLabel(rule, schoolById, lessonTypeById)}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      c {formatDate(rule.effective_from)}
                      {rule.effective_to ? ` до ${formatDate(rule.effective_to)}` : ""}
                      {rule.note ? ` · ${rule.note}` : ""}
                    </p>
                  </div>
                  <form action={disableStaffPayoutRateRuleAction}>
                    <input type="hidden" name="rule_id" value={rule.id} />
                    <Button type="submit" variant="outline" className="h-9 w-full sm:w-auto">
                      Отключить
                    </Button>
                  </form>
                </div>
              ))}
            </div>
          )}

          {inactiveRateCount > 0 && (
            <p className="text-xs text-zinc-500">
              Отключённых ставок: {inactiveRateCount}. Они оставлены в истории.
            </p>
          )}
        </div>

        <form
          action={backfillStaffPayoutEntriesAction}
          className="rounded-xl border border-blue-200 bg-blue-50/70 p-3"
        >
          <input type="hidden" name="instructor_id" value={instructor.id} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-blue-950">
                Начисления по старым записям
              </p>
              <p className="mt-1 text-xs leading-5 text-blue-900">
                Используйте после настройки ставок. Повторный запуск не создаст
                дубли по тем записям, где начисление уже есть.
              </p>
            </div>
            <Button type="submit" variant="accent" className="h-10">
              Начислить старые записи
            </Button>
          </div>
        </form>
      </div>
    </details>
  );
}

function InviteStatusMessage({ status }: { status?: string }) {
  const message = getInviteStatusMessage(status);

  if (!message) return null;

  return (
    <div
      className={`rounded-xl px-4 py-3 text-sm ${
        status === "error"
          ? "bg-red-50 text-red-700"
          : "bg-emerald-50 text-emerald-700"
      }`}
    >
      {message}
    </div>
  );
}

function getInvitationLabel(invitation: StaffInvitation) {
  return (
    invitation.submitted_name ??
    invitation.invited_name ??
    invitation.submitted_email ??
    invitation.invited_email ??
    "Новый сотрудник"
  );
}

function InvitationLinkCard({
  invitation,
  origin,
}: {
  invitation: StaffInvitation;
  origin: string;
}) {
  const href = `${origin}/staff/register?token=${invitation.token}`;

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">
            {getInvitationLabel(invitation)}
          </h3>
          <p className="mt-1 text-sm text-zinc-500">
            До {formatLocalDateTime(invitation.expires_at)}
          </p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600">
          Ссылка
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input className="h-10 text-sm" value={href} readOnly />
        <StaffInvitationLinkCopy href={href} />
      </div>
      <form action={deleteStaffInvitationAction} className="mt-3">
        <input type="hidden" name="invitation_id" value={invitation.id} />
        <Button
          type="submit"
          variant="outline"
          className="h-10 w-full border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
        >
          <Trash2 className="size-4" />
          Удалить ссылку
        </Button>
      </form>
    </article>
  );
}

function SubmittedInvitationCard({ invitation }: { invitation: StaffInvitation }) {
  return (
    <article className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">
          {getInvitationLabel(invitation)}
        </h3>
        <p className="text-sm text-zinc-600">
            {invitation.submitted_email ?? invitation.invited_email ?? "Эл. почта не указана"}
        </p>
        {invitation.submitted_phone && (
          <p className="text-sm text-zinc-600">{invitation.submitted_phone}</p>
        )}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <form action={approveStaffInvitationAction}>
          <input type="hidden" name="invitation_id" value={invitation.id} />
          <Button type="submit" className="h-10 w-full">
            <Check className="size-4" />
            Подтвердить
          </Button>
        </form>
        <form action={rejectStaffInvitationAction}>
          <input type="hidden" name="invitation_id" value={invitation.id} />
          <Button type="submit" variant="outline" className="h-10 w-full">
            <X className="size-4" />
            Отклонить
          </Button>
        </form>
      </div>
    </article>
  );
}

function StaffCard({
  instructor,
  stats,
  isPending,
  member,
  contact,
  payoutSetup,
  schools,
  lessonTypes,
  currentDate,
  includeOwnerInPayouts,
  defaultOpen = false,
}: {
  instructor: StaffInstructor;
  stats: StaffStats;
  isPending?: boolean;
  member?: StaffMember;
  contact?: StaffContact;
  payoutSetup?: InstructorPayoutSetup | null;
  schools: School[];
  lessonTypes: LessonType[];
  currentDate: string;
  includeOwnerInPayouts: boolean;
  defaultOpen?: boolean;
}) {
  const isOwner = member?.role === "owner";
  const contactItems = [contact?.email, contact?.phone].filter(
    (item): item is string => Boolean(item),
  );
  const payoutRemaining = payoutSetup?.summary.remaining_amount ?? 0;
  const instructorName = instructor.public_name ?? instructor.name;
  const initials = instructorName.trim().slice(0, 1).toUpperCase() || "И";

  return (
    <details
      className="group rounded-2xl border bg-white shadow-sm"
      open={defaultOpen}
    >
      <summary className="grid cursor-pointer list-none gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1.2fr)_auto] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-zinc-100 text-sm font-semibold text-zinc-600 shadow-sm">
            {instructor.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={instructor.photo_url}
                alt={instructorName}
                className="size-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-semibold">
                {instructorName}
              </h2>
              {isOwner ? (
                <span className="rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white">
                  Руководитель
                </span>
              ) : (
                <StatusPill
                  isActive={instructor.is_active}
                  isPending={isPending}
                />
              )}
            </div>
            <p className="text-muted-foreground mt-1 truncate text-sm">
              {contactItems.length > 0
                ? contactItems.join(" · ")
                : "Контакты не указаны"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm sm:min-w-[420px]">
          <div className="rounded-xl bg-zinc-50 px-3 py-2">
            <p className="text-xs text-zinc-500">Ученики</p>
            <p className="font-semibold">{stats.studentCount}</p>
          </div>
          <div className="rounded-xl bg-zinc-50 px-3 py-2">
            <p className="text-xs text-zinc-500">Записи</p>
            <p className="font-semibold">{stats.weekBookings}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 px-3 py-2">
            <p className="text-xs text-emerald-700">
              {isOwner ? "Неделя" : "К выдаче"}
            </p>
            <p className="font-semibold text-emerald-950">
              {formatMoney(isOwner ? stats.weekPaidAmount : payoutRemaining)}
            </p>
          </div>
        </div>
      </summary>

      <div className="border-t px-4 pb-4 pt-4">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Ученики</p>
          <p className="mt-1 text-lg font-semibold">{stats.studentCount}</p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Слоты недели</p>
          <p className="mt-1 text-lg font-semibold">{stats.weekSlots}</p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Записи</p>
          <p className="mt-1 text-lg font-semibold">{stats.weekBookings}</p>
        </div>
        <div className="rounded-xl bg-zinc-50 px-3 py-2">
          <p className="text-xs text-zinc-500">Проведено</p>
          <p className="mt-1 text-lg font-semibold">{stats.weekCompleted}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2">
        <p className="text-xs font-medium text-emerald-700">Получено за неделю</p>
        <p className="mt-1 font-semibold text-emerald-950">
          {formatMoney(stats.weekPaidAmount)}
        </p>
      </div>
      {stats.weekDebtAmount > 0 && (
        <div className="mt-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2">
          <p className="text-xs font-medium text-amber-700">Долг недели</p>
          <p className="mt-1 font-semibold text-amber-950">
            {formatMoney(stats.weekDebtAmount)}
          </p>
        </div>
      )}

      {isOwner && !includeOwnerInPayouts && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
          Выплаты владельцу выключены. Занятия руководителя не уменьшают маржу
          школы и не попадают в начисления.
        </div>
      )}

      {(!isOwner || includeOwnerInPayouts) && !isPending && (
        <StaffPayoutPanel
          instructor={instructor}
          payoutSetup={payoutSetup ?? null}
          schools={schools}
          lessonTypes={lessonTypes}
          currentDate={currentDate}
          defaultOpen={defaultOpen}
        />
      )}

      {!isOwner && !isPending && (
        <div className="mt-3 space-y-3">
          <form action={updateStaffInstructorStatusAction}>
            <input type="hidden" name="instructor_id" value={instructor.id} />
            <input
              type="hidden"
              name="next_active"
              value={instructor.is_active ? "false" : "true"}
            />
            <Button
              type="submit"
              variant={instructor.is_active ? "outline" : "default"}
              className="h-10 w-full"
            >
              {instructor.is_active ? "Отключить доступ" : "Вернуть доступ"}
            </Button>
          </form>

          <details className="rounded-xl border border-red-100 bg-red-50/60 px-3 py-2">
            <summary className="cursor-pointer list-none text-sm font-semibold text-red-700">
              Удалить сотрудника
            </summary>
            <form action={deleteStaffInstructorAction} className="mt-3 space-y-3">
              <input type="hidden" name="instructor_id" value={instructor.id} />
              <label className="flex items-start gap-2 text-xs text-red-800">
                <input
                  type="checkbox"
                  name="confirm_delete"
                  value="yes"
                  required
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  Удалить сотрудника, его расписание, слоты, записи и учеников.
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
        </div>
      )}
      </div>
    </details>
  );
}

export default async function DirectorStaffPage({
  searchParams,
}: DirectorStaffPageProps) {
  const membership = await requireDirectorAccess();
  const params = await searchParams;
  const requestHeaders = await headers();
  const postgresBackend = isPostgresBackend();
  const adminEnabled = postgresBackend || hasSupabaseAdminKey();
  const origin = getPublicOrigin(requestHeaders);
  const timezone = DEFAULT_TIMEZONE;
  const currentDate = getLocalDate(timezone);
  const weekStart = getUtcWeekStart(currentDate);
  const weekEnd = addUtcDays(weekStart, 6);
  const from = formatDateValue(weekStart);
  const to = formatDateValue(weekEnd);

  let instructors: StaffInstructor[] = [];
  let instructorError: { message: string } | null = null;
  let includeOwnerInPayouts = false;

  if (postgresBackend) {
    includeOwnerInPayouts = await getOwnerPayoutPolicy({
      organizationId: membership.organizationId,
    });

    instructors = await queryRows<StaffInstructor>(
      `
        select id, organization_id, name, slug, public_name, timezone, is_active,
               photo_url
        from public.instructors
        where organization_id = $1
        order by name
      `,
      [membership.organizationId],
    );
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: instructorData, error } = await supabase
      .from("instructors")
      .select("id, organization_id, name, slug, public_name, timezone, is_active, photo_url")
      .eq("organization_id", membership.organizationId)
      .order("name");
    instructors = (instructorData ?? []) as StaffInstructor[];
    instructorError = error;
  }

  await autoCompletePastBookings({
    instructorIds: instructors.map((instructor) => instructor.id),
  });
  const instructorIds = instructors.map((instructor) => instructor.id);
  let studentAccessData: {
    id: string;
    instructor_id: string;
    is_active: boolean;
    is_archived: boolean;
  }[] = [];
  let scheduleDays: Pick<ScheduleDay, "id" | "instructor_id" | "date">[] = [];
  let memberData: StaffMember[] = [];
  let studentAccessError: { message: string } | null = null;
  let scheduleDayError: { message: string } | null = null;
  let memberError: { message: string } | null = null;

  if (postgresBackend) {
    [studentAccessData, scheduleDays, memberData] = await Promise.all([
      instructorIds.length > 0
        ? queryRows<{
            id: string;
            instructor_id: string;
            is_active: boolean;
            is_archived: boolean;
          }>(
            `
              select id, instructor_id, is_active, is_archived
              from public.student_accesses
              where instructor_id = any($1::uuid[])
            `,
            [instructorIds],
          )
        : Promise.resolve([]),
      instructorIds.length > 0
        ? queryRows<Pick<ScheduleDay, "id" | "instructor_id" | "date">>(
            `
              select id, instructor_id, date::text as date
              from public.schedule_days
              where instructor_id = any($1::uuid[])
                and date >= $2::date
                and date <= $3::date
            `,
            [instructorIds, from, to],
          )
        : Promise.resolve([]),
      instructorIds.length > 0
        ? queryRows<StaffMember>(
            `
              select id, instructor_id, role, is_active
              from public.organization_members
              where organization_id = $1
                and instructor_id = any($2::uuid[])
            `,
            [membership.organizationId, instructorIds],
          )
        : Promise.resolve([]),
    ]);
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const [
      { data: studentAccessResult, error: studentAccessLoadError },
      { data: scheduleDayResult, error: scheduleDayLoadError },
      { data: memberResult, error: memberLoadError },
    ] = await Promise.all([
      instructorIds.length > 0
        ? supabase
            .from("student_accesses")
            .select("id, instructor_id, is_active, is_archived")
            .in("instructor_id", instructorIds)
        : Promise.resolve({ data: [], error: null }),
      instructorIds.length > 0
        ? supabase
            .from("schedule_days")
            .select("id, instructor_id, date")
            .in("instructor_id", instructorIds)
            .gte("date", from)
            .lte("date", to)
        : Promise.resolve({ data: [], error: null }),
      instructorIds.length > 0
        ? supabase
            .from("organization_members")
            .select("id, instructor_id, role, is_active")
            .eq("organization_id", membership.organizationId)
            .in("instructor_id", instructorIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    studentAccessData = (studentAccessResult ?? []) as {
      id: string;
      instructor_id: string;
      is_active: boolean;
      is_archived: boolean;
    }[];
    scheduleDays = (scheduleDayResult ?? []) as Pick<
      ScheduleDay,
      "id" | "instructor_id" | "date"
    >[];
    memberData = (memberResult ?? []) as StaffMember[];
    studentAccessError = studentAccessLoadError;
    scheduleDayError = scheduleDayLoadError;
    memberError = memberLoadError;
  }

  const scheduleDayIds = scheduleDays.map((day) => day.id);
  let slots: Pick<
    Slot,
    "id" | "instructor_id" | "schedule_day_id" | "start_time" | "end_time" | "status"
  >[] = [];
  let slotError: { message: string } | null = null;

  if (postgresBackend) {
    slots =
      scheduleDayIds.length > 0
        ? await queryRows<
            Pick<
              Slot,
              | "id"
              | "instructor_id"
              | "schedule_day_id"
              | "start_time"
              | "end_time"
              | "status"
            >
          >(
            `
              select id, instructor_id, schedule_day_id,
                     start_time::text as start_time, end_time::text as end_time,
                     status
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
            .select("id, instructor_id, schedule_day_id, start_time, end_time, status")
            .in("schedule_day_id", scheduleDayIds)
            .neq("status", "cancelled")
        : { data: [], error: null };
    slots = (slotData ?? []) as Pick<
      Slot,
      "id" | "instructor_id" | "schedule_day_id" | "start_time" | "end_time" | "status"
    >[];
    slotError = slotLoadError;
  }

  const slotIds = slots.map((slot) => slot.id);
  let bookingData: StaffBooking[] = [];
  let invitationData: StaffInvitation[] = [];
  let schools: School[] = [];
  let lessonTypes: LessonType[] = [];
  const payoutSetupByInstructorId = new Map<string, InstructorPayoutSetup>();
  let bookingError: { message: string } | null = null;
  let invitationError: { message: string } | null = null;

  if (postgresBackend) {
    [bookingData, invitationData, schools, lessonTypes] = await Promise.all([
      slotIds.length > 0
        ? queryRows<StaffBooking>(
            `
              select id, slot_id, price_amount, paid_amount, lesson_state
              from public.bookings
              where slot_id = any($1::uuid[])
                and status = 'confirmed'
            `,
            [slotIds],
          )
        : Promise.resolve([]),
      queryRows<StaffInvitation>(
        `
          select id, organization_id, invited_by_member_id, token, status,
                 invited_name, invited_email, invited_phone, submitted_name,
                 submitted_email, submitted_phone, user_id, instructor_id,
                 expires_at::text as expires_at, submitted_at::text as submitted_at,
                 reviewed_at::text as reviewed_at, created_at::text as created_at,
                 updated_at::text as updated_at
          from public.staff_invitations
          where organization_id = $1
          order by created_at desc
          limit 20
        `,
        [membership.organizationId],
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
      queryRows<LessonType>(
        `
          select id, code, name, color, kind, description,
                 default_duration_minutes, default_price_amount, tags,
                 sort_order, is_active, requires_vehicle
          from public.lesson_types
          order by sort_order, name
        `,
      ),
    ]);

    if (instructorIds.length > 0) {
      await ensureInstructorPayoutSettingsForOrganization(
        membership.organizationId,
      );

      const payoutSetups = await Promise.all(
        instructorIds.map((instructorId) =>
          getInstructorPayoutSetup({
            organizationId: membership.organizationId,
            instructorId,
          }),
        ),
      );

      for (const payoutSetup of payoutSetups) {
        payoutSetupByInstructorId.set(
          payoutSetup.settings.instructor_id,
          payoutSetup,
        );
      }
    }
  } else {
    const supabase = adminEnabled ? createAdminClient() : await createClient();
    const { data: bookingResult, error: bookingLoadError } =
      slotIds.length > 0
        ? await supabase
            .from("bookings")
            .select("id, slot_id, price_amount, paid_amount, lesson_state")
            .in("slot_id", slotIds)
            .eq("status", "confirmed")
        : { data: [], error: null };
    const { data: invitationResult, error: invitationLoadError } = adminEnabled
      ? await supabase
          .from("staff_invitations")
          .select("*")
          .eq("organization_id", membership.organizationId)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [], error: null };

    bookingData = (bookingResult ?? []) as StaffBooking[];
    invitationData = (invitationResult ?? []) as StaffInvitation[];
    bookingError = bookingLoadError;
    invitationError = invitationLoadError;
  }

  const loadError =
    instructorError ??
    studentAccessError ??
    scheduleDayError ??
    memberError ??
    slotError ??
    bookingError ??
    invitationError;
  const statsByInstructorId = new Map<string, StaffStats>();

  for (const instructor of instructors) {
    statsByInstructorId.set(instructor.id, createEmptyStats());
  }

  for (const access of studentAccessData) {
    if (!access.is_active || access.is_archived) continue;

    const stats = statsByInstructorId.get(access.instructor_id);
    if (stats) stats.studentCount += 1;
  }

  for (const slot of slots) {
    const stats = statsByInstructorId.get(slot.instructor_id);
    if (stats) stats.weekSlots += 1;
  }

  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  for (const booking of bookingData) {
    const slot = slotsById.get(booking.slot_id);
    if (!slot) continue;

    const stats = statsByInstructorId.get(slot.instructor_id);
    if (!stats) continue;

    stats.weekBookings += 1;
    stats.weekPaidAmount += booking.paid_amount ?? 0;
    stats.weekDebtAmount += getDebtAmount(booking);

    if (booking.lesson_state === "completed") {
      stats.weekCompleted += 1;
    }
  }

  const activeInstructors = instructors.filter((instructor) => instructor.is_active);
  const archivedInstructors = instructors.filter((instructor) => !instructor.is_active);
  const totalStudents = [...statsByInstructorId.values()].reduce(
    (sum, stats) => sum + stats.studentCount,
    0,
  );
  const weekBookings = [...statsByInstructorId.values()].reduce(
    (sum, stats) => sum + stats.weekBookings,
    0,
  );
  const weekPaidAmount = [...statsByInstructorId.values()].reduce(
    (sum, stats) => sum + stats.weekPaidAmount,
    0,
  );
  const invitations = invitationData;
  const contactsByInstructorId = new Map<string, StaffContact>();

  for (const invitation of invitations) {
    if (!invitation.instructor_id || invitation.status !== "approved") {
      continue;
    }

    if (contactsByInstructorId.has(invitation.instructor_id)) {
      continue;
    }

    contactsByInstructorId.set(invitation.instructor_id, {
      email: invitation.submitted_email ?? invitation.invited_email ?? null,
      phone: invitation.submitted_phone ?? invitation.invited_phone ?? null,
    });
  }

  const membersByInstructorId = new Map(
    memberData
      .filter((member) => member.instructor_id)
      .map((member) => [member.instructor_id as string, member]),
  );

  for (const [instructorId, member] of membersByInstructorId.entries()) {
    if (member.role === "owner" && !contactsByInstructorId.has(instructorId)) {
      contactsByInstructorId.set(instructorId, {
        email: membership.user.email ?? null,
        phone: null,
      });
    }
  }

  const nowIso = new Date().toISOString();
  const openInvitations = invitations.filter(
    (invitation) =>
      invitation.status === "invited" &&
      invitation.expires_at >= nowIso,
  );
  const submittedInvitations = invitations.filter(
    (invitation) => invitation.status === "submitted",
  );
  const pendingInstructorIds = new Set(
    submittedInvitations
      .map((invitation) => invitation.instructor_id)
      .filter(Boolean),
  );

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
          <p className="text-muted-foreground text-sm font-medium">
            Кабинет руководителя
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Сотрудники
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Инструкторы школы и их недельная загрузка: {formatDate(from)} -{" "}
            {formatDate(to)}.
          </p>
        </header>

        {loadError && (
          <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            Не удалось загрузить часть данных: {loadError.message}
          </div>
        )}

        <InviteStatusMessage status={params?.invite} />

        <section className="grid gap-2 sm:grid-cols-4">
          <MetricCard
            label="Инструкторы"
            value={`${activeInstructors.length}`}
            description={`${archivedInstructors.length} в архиве`}
          />
          <MetricCard
            label="Ученики"
            value={`${totalStudents}`}
            description="Активные доступы"
          />
          <MetricCard
            label="Записи недели"
            value={`${weekBookings}`}
            description={`${slots.length} слотов всего`}
          />
          <MetricCard
            label="Получено"
            value={formatMoney(weekPaidAmount)}
            description="По записям недели"
          />
        </section>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Выплаты владельцу</CardTitle>
            <CardDescription>
              Управляет тем, уменьшают ли занятия руководителя маржу школы.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!postgresBackend ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Настройка доступна после перехода на PostgreSQL.
              </div>
            ) : (
              <form action={updateOwnerPayoutPolicyAction} className="space-y-3">
                <label className="flex items-start gap-3 rounded-xl border bg-zinc-50 px-3 py-3">
                  <input
                    type="checkbox"
                    name="include_owner_in_payouts"
                    value="true"
                    defaultChecked={includeOwnerInPayouts}
                    className="mt-1 size-4 shrink-0"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-zinc-950">
                      Учитывать занятия владельца в выплатах
                    </span>
                    <span className="mt-1 block text-sm leading-5 text-zinc-600">
                      Если выключено, руководитель остаётся владельцем школы, но
                      его занятия не считаются зарплатой и не уменьшают маржу.
                      Если включено, владельцу можно настроить ставку, начислять
                      выплаты и отмечать выдачу денег как обычному инструктору.
                    </span>
                  </span>
                </label>
                <Button type="submit" variant="accent" className="h-10">
                  Сохранить настройку
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <UsersRound className="size-4" />
                  Инструкторы
                </CardTitle>
                <CardDescription>
                  Список сотрудников без отдельной роли администратора.
                </CardDescription>
              </div>
              <Button
                nativeButton={false}
                render={<Link href="/director/schedule" />}
                variant="outline"
                className="h-9 shadow-sm"
              >
                <CalendarDays className="size-4" />
                Открыть расписание
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {instructors.length === 0 ? (
              <div className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
                Сотрудников пока нет.
              </div>
            ) : (
              <div className="space-y-3">
                {instructors.map((instructor) => (
                  <StaffCard
                    key={instructor.id}
                    instructor={instructor}
                    isPending={pendingInstructorIds.has(instructor.id)}
                    member={membersByInstructorId.get(instructor.id)}
                    contact={contactsByInstructorId.get(instructor.id)}
                    payoutSetup={payoutSetupByInstructorId.get(instructor.id) ?? null}
                    schools={schools}
                    lessonTypes={lessonTypes}
                    currentDate={currentDate}
                    includeOwnerInPayouts={includeOwnerInPayouts}
                    defaultOpen={params?.staff === instructor.id}
                    stats={
                      statsByInstructorId.get(instructor.id) ?? createEmptyStats()
                    }
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Пригласить сотрудника
            </CardTitle>
            <CardDescription>
              Руководитель создаёт ссылку, сотрудник заполняет заявку, затем
              руководитель подтверждает доступ.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!adminEnabled ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                Для приглашений нужен служебный ключ проекта в настройках сервера.
              </div>
            ) : (
              <form action={createStaffInvitationAction} className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="invited-name">Имя</Label>
                  <Input
                    id="invited-name"
                    name="invited_name"
                    placeholder="Анна Петрова"
                    maxLength={160}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invited-email">Эл. почта</Label>
                  <Input
                    id="invited-email"
                    name="invited_email"
                    type="email"
                    placeholder="instructor@mail.ru"
                    maxLength={254}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invited-phone">Телефон</Label>
                  <Input
                    id="invited-phone"
                    name="invited_phone"
                    type="tel"
                    placeholder="+7 999 123-45-67"
                    maxLength={40}
                  />
                </div>
            <Button type="submit" className="h-10 shadow-md shadow-zinc-950/15 sm:col-span-3">
              <Link2 className="size-4" />
              Создать ссылку
            </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {(submittedInvitations.length > 0 || openInvitations.length > 0) && (
          <section className="grid gap-3 lg:grid-cols-2">
            {submittedInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Заявки на подтверждение</CardTitle>
                  <CardDescription>
                    После подтверждения сотрудник получит обычный кабинет инструктора.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {submittedInvitations.map((invitation) => (
                    <SubmittedInvitationCard
                      key={invitation.id}
                      invitation={invitation}
                    />
                  ))}
                </CardContent>
              </Card>
            )}

            {openInvitations.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Активные ссылки</CardTitle>
                  <CardDescription>
                    Отправьте ссылку сотруднику любым удобным способом.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {openInvitations.map((invitation) => (
                    <InvitationLinkCard
                      key={invitation.id}
                      invitation={invitation}
                      origin={origin}
                    />
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
