import { formatDateTime, formatMoney } from "@/lib/formatters";

export type FinanceOperation = {
  id: string;
  action: string;
  entity_type: string;
  actor_role: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  student_id: string | null;
  student_name: string | null;
  instructor_id: string | null;
  instructor_name: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  "student_prepaid_credit.created": "Создана предоплата ученика",
  "student_prepaid_credit.updated": "Предоплата ученика изменена",
  "student_prepaid_credit.adjusted": "В предоплату внесена корректировка",
  "student_prepaid_credit.cancelled": "Остаток предоплаты закрыт",
  "student_prepaid_refund.created": "Возврат ученику зафиксирован",
  "student_prepaid_refund.cancelled": "Возврат ученику отменён",
  "director_report_payout_payment.created": "Деньги выданы инструктору",
  "director_report_payout_payment.cancelled": "Выдача денег инструктору отменена",
  "director_report_payout_return.created": "Инструктор вернул деньги",
  "director_report_payout_debt.withheld": "Сумма удержана из будущих выплат",
  "booking.source_settlement_completed": "Расчёт с источником закрыт",
};

const ENTITY_LABELS: Record<string, string> = {
  student_prepaid_credit: "Предоплата ученика",
  student_prepaid_refund: "Возврат ученику",
  instructor_payout_payment: "Выплата инструктору",
  instructor_payout_return: "Возврат от инструктора",
  instructor_payout_entry: "Начисление инструктору",
  school: "Автошкола",
};

const ACTOR_LABELS: Record<string, string> = {
  owner: "Руководитель",
  instructor: "Инструктор",
  staff: "Сотрудник",
  system: "Система",
};

function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? "Денежная операция";
}

function getEntityLabel(entityType: string) {
  return ENTITY_LABELS[entityType] ?? "Финансовый объект";
}

function getActorLabel(actorRole: string) {
  return ACTOR_LABELS[actorRole] ?? actorRole;
}

function getAmount(metadata: Record<string, unknown> | null) {
  return typeof metadata?.amount === "number" ? metadata.amount : null;
}

function getDescription(operation: FinanceOperation) {
  const metadata = operation.metadata;
  const amount = getAmount(metadata);
  const quantity = metadata?.quantity;
  const reason = metadata?.reason;
  const remainingAmount = metadata?.remaining_amount;

  if (operation.action === "student_prepaid_credit.created" && typeof quantity === "number" && amount !== null) {
    return `Внесено ${formatMoney(amount)} за ${quantity} ${quantity === 1 ? "занятие" : "занятий"}.`;
  }

  if (operation.action === "student_prepaid_refund.created" && amount !== null) {
    return typeof remainingAmount === "number"
      ? `Фактически возвращено ученику ${formatMoney(amount)}. Остаток возврата: ${formatMoney(remainingAmount)}.`
      : `Фактически возвращено ученику ${formatMoney(amount)}.`;
  }

  if (operation.action === "student_prepaid_credit.adjusted" && typeof reason === "string" && reason) {
    return `Причина корректировки: ${reason}`;
  }

  if (amount !== null) {
    return `Сумма операции: ${formatMoney(amount)}.`;
  }

  return "Подробности операции сохранены в журнале действий.";
}

function Subject({ operation }: { operation: FinanceOperation }) {
  if (operation.student_id && operation.student_name) {
    return <a className="font-semibold text-blue-700 hover:underline" href={`/director/students?view=list&student=${operation.student_id}#student-${operation.student_id}`}>{operation.student_name}</a>;
  }

  if (operation.instructor_name) {
    return <span className="font-semibold text-zinc-900">{operation.instructor_name}</span>;
  }

  return <span className="text-zinc-500">Не удалось определить участника</span>;
}

function formatOperationDate(value: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) {
    return "Дата не указана";
  }

  return formatDateTime(value, "Asia/Irkutsk");
}

export function FinanceOperationsTable({ operations }: { operations: FinanceOperation[] }) {
  if (operations.length === 0) {
    return <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">Финансовых операций пока нет.</div>;
  }

  return (
    <div className="space-y-2">
      {operations.map((operation) => {
        const amount = getAmount(operation.metadata);

        return (
          <details key={operation.id} className="rounded-xl border border-zinc-200 bg-white open:border-zinc-300 open:shadow-sm">
            <summary className="cursor-pointer list-none px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-zinc-950">{getActionLabel(operation.action)}</p>
                  <p className="mt-1 text-xs text-zinc-500">{getEntityLabel(operation.entity_type)} · {getActorLabel(operation.actor_role)}</p>
                </div>
                <div className="flex items-center gap-3 text-sm text-zinc-600">
                  {amount !== null && <strong className="text-zinc-950">{formatMoney(amount)}</strong>}
                  <span>{formatOperationDate(operation.created_at)}</span>
                </div>
              </div>
            </summary>
            <div className="grid gap-3 border-t bg-zinc-50/70 px-4 py-3 text-sm sm:grid-cols-3">
              <div><p className="text-xs text-zinc-500">Что произошло</p><p className="mt-1 text-zinc-800">{getDescription(operation)}</p></div>
              <div><p className="text-xs text-zinc-500">К кому относится</p><p className="mt-1 text-zinc-800"><Subject operation={operation} /></p></div>
              <div><p className="text-xs text-zinc-500">Объект</p><p className="mt-1 text-zinc-800">{getEntityLabel(operation.entity_type)}</p><p className="mt-1 text-xs text-zinc-500">Кто выполнил: {getActorLabel(operation.actor_role)}</p></div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
