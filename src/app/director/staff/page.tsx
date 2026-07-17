import Link from "next/link";
import { headers } from "next/headers";
import {
  CalendarDays,
  Check,
  Link2,
  X,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import {
  approveStaffInvitationAction,
  createStaffInvitationAction,
  deleteStaffInvitationAction,
  deleteStaffInstructorAction,
  rejectStaffInvitationAction,
  updateStaffInstructorStatusAction,
} from "@/app/director/staff/actions";
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
  addUtcDays,
  formatDate,
  formatDateValue,
  formatLocalDateTime,
  formatMoney,
  getLocalDate,
  getUtcWeekStart,
} from "@/lib/formatters";
import { getPublicOrigin } from "@/lib/public-origin";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  Booking,
  Instructor,
  LessonState,
  ScheduleDay,
  Slot,
  StaffInvitation,
} from "@/lib/types";

export const dynamic = "force-dynamic";

type StaffInstructor = Instructor & {
  organization_id: string;
  is_active: boolean;
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

type StaffStats = {
  studentCount: number;
  weekSlots: number;
  weekBookings: number;
  weekCompleted: number;
  weekPaidAmount: number;
  weekDebtAmount: number;
};

type DirectorStaffPageProps = {
  searchParams?: Promise<{
    invite?: string;
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
    case "error":
      return "Не удалось выполнить действие. Проверьте миграцию и служебный ключ проекта.";
    default:
      return null;
  }
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
      <Input className="mt-3 h-10 text-sm" value={href} readOnly />
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
}: {
  instructor: StaffInstructor;
  stats: StaffStats;
  isPending?: boolean;
  member?: StaffMember;
}) {
  const isOwner = member?.role === "owner";

  return (
    <article className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold">
            {instructor.public_name ?? instructor.name}
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {instructor.timezone}
          </p>
        </div>
        {isOwner ? (
          <span className="rounded-full bg-zinc-950 px-2 py-1 text-xs font-semibold text-white">
            Руководитель
          </span>
        ) : (
          <StatusPill isActive={instructor.is_active} isPending={isPending} />
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
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
    </article>
  );
}

export default async function DirectorStaffPage({
  searchParams,
}: DirectorStaffPageProps) {
  const membership = await requireDirectorAccess();
  const params = await searchParams;
  const requestHeaders = await headers();
  const adminEnabled = hasSupabaseAdminKey();
  const supabase = adminEnabled ? createAdminClient() : await createClient();
  const origin = getPublicOrigin(requestHeaders);
  const timezone = "Asia/Irkutsk";
  const currentDate = getLocalDate(timezone);
  const weekStart = getUtcWeekStart(currentDate);
  const weekEnd = addUtcDays(weekStart, 6);
  const from = formatDateValue(weekStart);
  const to = formatDateValue(weekEnd);

  const { data: instructorData, error: instructorError } = await supabase
    .from("instructors")
    .select("id, organization_id, name, slug, public_name, timezone, is_active")
    .eq("organization_id", membership.organizationId)
    .order("name");
  const instructors = (instructorData ?? []) as StaffInstructor[];
  const instructorIds = instructors.map((instructor) => instructor.id);
  const [
    { data: studentAccessData, error: studentAccessError },
    { data: scheduleDayData, error: scheduleDayError },
    { data: memberData, error: memberError },
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
  const scheduleDays = (scheduleDayData ?? []) as Pick<
    ScheduleDay,
    "id" | "instructor_id" | "date"
  >[];
  const scheduleDayIds = scheduleDays.map((day) => day.id);
  const { data: slotData, error: slotError } =
    scheduleDayIds.length > 0
      ? await supabase
          .from("slots")
          .select("id, instructor_id, schedule_day_id, start_time, end_time, status")
          .in("schedule_day_id", scheduleDayIds)
          .neq("status", "cancelled")
      : { data: [], error: null };
  const slots = (slotData ?? []) as Pick<
    Slot,
    "id" | "instructor_id" | "schedule_day_id" | "start_time" | "end_time" | "status"
  >[];
  const slotIds = slots.map((slot) => slot.id);
  const { data: bookingData, error: bookingError } =
    slotIds.length > 0
      ? await supabase
          .from("bookings")
          .select("id, slot_id, price_amount, paid_amount, lesson_state")
          .in("slot_id", slotIds)
          .eq("status", "confirmed")
      : { data: [], error: null };
  const { data: invitationData, error: invitationError } = adminEnabled
    ? await supabase
        .from("staff_invitations")
        .select("*")
        .eq("organization_id", membership.organizationId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [], error: null };

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

  for (const access of (studentAccessData ?? []) as {
    id: string;
    instructor_id: string;
    is_active: boolean;
    is_archived: boolean;
  }[]) {
    if (!access.is_active || access.is_archived) continue;

    const stats = statsByInstructorId.get(access.instructor_id);
    if (stats) stats.studentCount += 1;
  }

  for (const slot of slots) {
    const stats = statsByInstructorId.get(slot.instructor_id);
    if (stats) stats.weekSlots += 1;
  }

  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));

  for (const booking of (bookingData ?? []) as StaffBooking[]) {
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
  const invitations = (invitationData ?? []) as StaffInvitation[];
  const membersByInstructorId = new Map(
    ((memberData ?? []) as StaffMember[])
      .filter((member) => member.instructor_id)
      .map((member) => [member.instructor_id as string, member]),
  );
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
                className="h-9"
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
              <div className="grid gap-3 lg:grid-cols-2">
                {instructors.map((instructor) => (
                  <StaffCard
                    key={instructor.id}
                    instructor={instructor}
                    isPending={pendingInstructorIds.has(instructor.id)}
                    member={membersByInstructorId.get(instructor.id)}
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
                <Button type="submit" className="h-10 sm:col-span-3">
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
