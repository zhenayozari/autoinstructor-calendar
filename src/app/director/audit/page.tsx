import { FileClock, ShieldCheck } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireDirectorAccess } from "@/lib/director-auth";
import { formatDateTime } from "@/lib/formatters";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type AuditLogRow = {
  id: string;
  organization_id: string;
  actor_member_id: string | null;
  actor_user_id: string | null;
  actor_role: "owner" | "admin" | "instructor" | string;
  actor_instructor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type InstructorName = {
  id: string;
  name: string;
  public_name: string | null;
  timezone: string;
};

const ACTION_LABELS: Record<string, string> = {
  "slot.updated": "Слот изменён",
  "slot.deleted": "Слот удалён",
  "slots.bulk_deleted": "Слоты удалены",
  "booking.cancelled": "Запись отменена",
  "booking.payment_toggled": "Оплата переключена",
  "booking.payment_updated": "Оплата изменена",
  "booking.source_settlement_completed": "Расчёт с источником закрыт",
  "booking.lesson_state_updated": "Факт занятия изменён",
  "booking.assigned_by_instructor": "Ученик записан инструктором",
  "student_access.deleted": "Ученик удалён",
  "student_access.updated": "Доступ ученика изменён",
  "student_access.archived": "Ученик отправлен в архив",
  "student_access.enabled": "Доступ ученика включён",
  "student_access.disabled": "Доступ ученика отключён",
  "student_registration.approved": "Заявка ученика подтверждена",
  "student_registration.rejected": "Заявка ученика отклонена",
  "staff_invitation.created": "Ссылка сотрудника создана",
  "staff_invitation.approved": "Сотрудник подтверждён",
  "staff_invitation.rejected": "Заявка сотрудника отклонена",
  "staff_invitation.deleted": "Ссылка сотрудника удалена",
  "staff.enabled": "Доступ сотрудника включён",
  "staff.disabled": "Доступ сотрудника отключён",
  "staff.deleted": "Сотрудник удалён",
  "price_matrix.updated": "Цены по источнику изменены",
  "site.settings_updated": "Настройки сайта изменены",
  "site.instructor_settings_updated": "Профиль инструктора на сайте изменён",
};

const ENTITY_LABELS: Record<string, string> = {
  slot: "Слот",
  booking: "Запись",
  school: "Источник",
  student_access: "Ученик",
  staff_invitation: "Приглашение сотрудника",
  instructor: "Сотрудник",
  price_matrix: "Матрица цен",
  organization_site_settings: "Сайт",
  instructor_site_settings: "Инструктор на сайте",
  student_registration_request: "Заявка ученика",
};

function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? "Другое действие";
}

function getEntityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? "Объект";
}

function getRoleLabel(role: string) {
  if (role === "owner") return "Руководитель";
  if (role === "instructor") return "Инструктор";
  if (role === "admin") return "Администратор";
  return "Пользователь";
}

function getActorName(
  log: AuditLogRow,
  instructorsById: Map<string, InstructorName>,
) {
  if (log.actor_instructor_id) {
    const instructor = instructorsById.get(log.actor_instructor_id);
    if (instructor) {
      return instructor.public_name ?? instructor.name;
    }
  }

  return getRoleLabel(log.actor_role);
}

function formatMoney(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return `${value.toLocaleString("ru-RU")} ₽`;
}

function getLessonStateLabel(value: unknown) {
  if (value === "completed") return "проведено";
  if (value === "no_show") return "неявка";
  if (value === "scheduled") return "план";
  return null;
}

function booleanChip(value: unknown, positive: string, negative: string) {
  if (value === true) return positive;
  if (value === false) return negative;
  return null;
}

function getMetadataChips(metadata: Record<string, unknown> | null) {
  if (!metadata) return [];

  const chips: string[] = [];
  const count = metadata.count;
  const configuredCount = metadata.configured_count;
  const clearedCount = metadata.cleared_count;
  const priceAmount = formatMoney(metadata.price_amount);
  const paidAmount = formatMoney(metadata.paid_amount);
  const lessonState = getLessonStateLabel(metadata.lesson_state);
  const isPaid = booleanChip(metadata.is_paid, "оплачено", "не оплачено");
  const isActive = booleanChip(metadata.is_active, "доступ включён", "доступ отключён");
  const isArchived = booleanChip(metadata.is_archived, "в архиве", "активен");
  const hadBooking = booleanChip(metadata.had_confirmed_booking, "была запись", "");

  if (typeof count === "number") chips.push(`Количество: ${count}`);
  if (typeof configuredCount === "number") chips.push(`Заполнено: ${configuredCount}`);
  if (typeof clearedCount === "number") chips.push(`Очищено: ${clearedCount}`);
  if (priceAmount) chips.push(`К оплате: ${priceAmount}`);
  if (paidAmount) chips.push(`Получено: ${paidAmount}`);
  if (lessonState) chips.push(`Статус: ${lessonState}`);
  if (isPaid) chips.push(isPaid);
  if (isActive) chips.push(isActive);
  if (isArchived) chips.push(isArchived);
  if (hadBooking) chips.push(hadBooking);
  if (metadata.secret_changed === true) chips.push("PIN изменён");
  if (metadata.auth_user_deleted === true) chips.push("Аккаунт входа удалён");
  if (metadata.has_payment_note === true) chips.push("Есть комментарий к оплате");

  return chips.filter(Boolean).slice(0, 5);
}

function AuditLogItem({
  log,
  timezone,
  instructorsById,
}: {
  log: AuditLogRow;
  timezone: string;
  instructorsById: Map<string, InstructorName>;
}) {
  const chips = getMetadataChips(log.metadata);
  const actorName = getActorName(log, instructorsById);

  return (
    <div className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-base font-semibold text-zinc-950">
            {getActionLabel(log.action)}
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            {getEntityLabel(log.entity_type)} · {actorName}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-600">
          {formatDateTime(log.created_at, timezone)}
        </span>
      </div>

      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-zinc-50 px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default async function DirectorAuditPage() {
  const membership = await requireDirectorAccess();
  const supabase = hasSupabaseAdminKey()
    ? createAdminClient()
    : await createClient();

  const { data: logsData, error: logsError } = await supabase
    .from("audit_logs")
    .select(
      "id, organization_id, actor_member_id, actor_user_id, actor_role, actor_instructor_id, action, entity_type, entity_id, metadata, created_at",
    )
    .eq("organization_id", membership.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  const logs = (logsData ?? []) as AuditLogRow[];
  const actorInstructorIds = Array.from(
    new Set(
      logs
        .map((log) => log.actor_instructor_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const { data: instructorsData } =
    actorInstructorIds.length > 0
      ? await supabase
          .from("instructors")
          .select("id, name, public_name, timezone")
          .eq("organization_id", membership.organizationId)
          .in("id", actorInstructorIds)
      : { data: [] };

  const instructors = (instructorsData ?? []) as InstructorName[];
  const instructorsById = new Map(
    instructors.map((instructor) => [instructor.id, instructor]),
  );
  const timezone = instructors[0]?.timezone ?? "Europe/Moscow";

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6">
      <header className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
        <p className="text-muted-foreground text-sm font-medium">
          Кабинет руководителя
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          Журнал действий
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          История важных действий в школе: удаления, оплаты, записи, доступы и
          настройки сайта.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5" />
            Что здесь видно
          </CardTitle>
          <CardDescription>
            Журнал показывает только служебные события. PIN, телефоны, заметки,
            имена учеников и тексты сайта сюда не выводятся.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-zinc-50 p-3">
            <p className="text-2xl font-semibold">{logs.length}</p>
            <p className="text-muted-foreground text-sm">последних событий</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-3">
            <p className="text-2xl font-semibold">
              {new Set(logs.map((log) => log.action)).size}
            </p>
            <p className="text-muted-foreground text-sm">типов действий</p>
          </div>
          <div className="rounded-2xl bg-zinc-50 p-3">
            <p className="text-2xl font-semibold">
              {logs[0] ? formatDateTime(logs[0].created_at, timezone) : "—"}
            </p>
            <p className="text-muted-foreground text-sm">последнее событие</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileClock className="size-5" />
            Последние действия
          </CardTitle>
          <CardDescription>
            Показываем последние 100 событий по всей школе.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {logsError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Не удалось загрузить журнал. Проверьте, что миграция журнала
              действий применена в Supabase.
            </div>
          ) : logs.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-zinc-50 p-6 text-center text-sm text-zinc-500">
              Событий пока нет. Они появятся после удаления, изменения оплат,
              подтверждения заявок и других важных действий.
            </div>
          ) : (
            logs.map((log) => (
              <AuditLogItem
                key={log.id}
                log={log}
                timezone={timezone}
                instructorsById={instructorsById}
              />
            ))
          )}
        </CardContent>
      </Card>
    </main>
  );
}
