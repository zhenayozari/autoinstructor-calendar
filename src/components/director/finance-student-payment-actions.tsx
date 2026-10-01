"use client";

import { useActionState } from "react";
import {
  cancelStudentPrepaidCreditAction,
  cancelStudentPrepaidRefundAction,
  createStudentPrepaidCreditAdjustmentAction,
  createStudentPrepaidRefundAction,
  type StudentAccessActionState,
} from "@/app/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/formatters";

type RefundItem = {
  id: string;
  amount: number;
  refunded_at: string;
  refund_note: string | null;
  cancelled_at: string | null;
  cancellation_note: string | null;
};

type Props = {
  creditId: string;
  quantity: number;
  usedQuantity: number;
  finalTotalAmount: number;
  finalUnitPrice: number;
  status: "active" | "cancelled";
  refundedAmount: number;
  refunds: RefundItem[];
};

const initialState: StudentAccessActionState = { status: "idle", message: "" };

function StateMessage({ state }: { state: StudentAccessActionState }) {
  if (!state.message) return null;

  return (
    <div className={state.status === "success" ? "rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700" : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"}>
      {state.message}
    </div>
  );
}

function AdjustmentForm({ creditId, quantity, usedQuantity, total }: { creditId: string; quantity: number; usedQuantity: number; total: number }) {
  const [state, formAction, isPending] = useActionState(createStudentPrepaidCreditAdjustmentAction, initialState);

  return (
    <details className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-amber-950">Внести корректировку оплаты</summary>
      <p className="mt-2 text-xs leading-5 text-amber-900">Изменение сохранится отдельной записью в истории. Источник и тип занятия уже зафиксированы.</p>
      <form action={formAction} className="mt-3 space-y-3 border-t border-amber-200 pt-3">
        <input type="hidden" name="student_prepaid_credit_id" value={creditId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label>Количество оплачиваемых занятий</Label><Input name="quantity" type="number" min={Math.max(1, usedQuantity)} max={5000} defaultValue={quantity} disabled={isPending} required /></div>
          <div className="space-y-1"><Label>Новая итоговая сумма</Label><Input name="final_total_amount" type="number" min={0} max={10000000} defaultValue={total} disabled={isPending} required /></div>
        </div>
        <div className="space-y-1"><Label>Причина корректировки</Label><Input name="adjustment_reason" maxLength={1000} placeholder="Например: скидка за полную оплату" disabled={isPending} required /></div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>{isPending ? "Сохраняем…" : "Сохранить корректировку"}</Button>
      </form>
    </details>
  );
}

function CancelCreditForm({ creditId, remainingQuantity, unitPrice }: { creditId: string; remainingQuantity: number; unitPrice: number }) {
  const [state, formAction, isPending] = useActionState(cancelStudentPrepaidCreditAction, initialState);
  const amount = remainingQuantity * unitPrice;

  if (remainingQuantity <= 0) return null;

  return (
    <details className="rounded-lg border border-red-200 bg-red-50/50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-red-900">Отменить остаток предоплаты</summary>
      <p className="mt-2 text-xs leading-5 text-red-900">Это отменит {remainingQuantity} неиспользованных занятий на сумму {formatMoney(amount)} и скорректирует расчёт с инструктором.</p>
      <form action={formAction} className="mt-3 space-y-3 border-t border-red-200 pt-3" onSubmit={(event) => { if (!window.confirm(`Отменить остаток предоплаты на ${formatMoney(amount)}?`)) event.preventDefault(); }}>
        <input type="hidden" name="student_prepaid_credit_id" value={creditId} />
        <div className="space-y-1"><Label>Причина отмены</Label><Input name="cancellation_note" maxLength={900} placeholder="Например: возврат ученику" disabled={isPending} required /></div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending} className="border-red-200 text-red-700">{isPending ? "Отменяем…" : "Отменить остаток"}</Button>
      </form>
    </details>
  );
}

function RefundForm({ creditId, remainingAmount }: { creditId: string; remainingAmount: number }) {
  const [state, formAction, isPending] = useActionState(createStudentPrepaidRefundAction, initialState);
  if (remainingAmount <= 0) return null;

  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-blue-950">Отметить фактический возврат ученику</summary>
      <p className="mt-2 text-xs leading-5 text-blue-950">Используйте только после того, как деньги действительно переданы ученику. Максимум к возврату: {formatMoney(remainingAmount)}.</p>
      <form action={formAction} className="mt-3 space-y-3 border-t border-blue-200 pt-3" onSubmit={(event) => { if (!window.confirm("Деньги уже действительно переданы ученику?")) event.preventDefault(); }}>
        <input type="hidden" name="student_prepaid_credit_id" value={creditId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Сумма</Label><Input name="refund_amount" type="number" min={1} max={remainingAmount} defaultValue={remainingAmount} disabled={isPending} required /></div>
          <div className="space-y-1"><Label>Дата возврата</Label><Input name="refunded_at" type="date" defaultValue={new Intl.DateTimeFormat("en-CA").format(new Date())} disabled={isPending} required /></div>
          <div className="space-y-1"><Label>Комментарий</Label><Input name="refund_note" maxLength={1000} placeholder="Например: переводом" disabled={isPending} /></div>
        </div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>{isPending ? "Сохраняем…" : "Отметить возврат"}</Button>
      </form>
    </details>
  );
}

function RefundHistory({ refunds }: { refunds: RefundItem[] }) {
  return (
    <div className="rounded-lg border bg-white">
      <p className="border-b px-3 py-2 text-xs font-semibold text-zinc-700">История возвратов</p>
      {refunds.map((refund) => <RefundHistoryRow key={refund.id} refund={refund} />)}
    </div>
  );
}

function RefundHistoryRow({ refund }: { refund: RefundItem }) {
  const [state, formAction, isPending] = useActionState(cancelStudentPrepaidRefundAction, initialState);
  const cancelled = Boolean(refund.cancelled_at);

  return (
    <div className={`flex flex-col gap-2 border-b p-3 text-xs last:border-b-0 sm:flex-row sm:items-center sm:justify-between ${cancelled ? "bg-zinc-50 text-zinc-400" : ""}`}>
      <div><p className="font-semibold">{formatMoney(refund.amount)} · {new Intl.DateTimeFormat("ru-RU").format(new Date(refund.refunded_at))}</p><p className="mt-1">{cancelled ? `Отметка отменена${refund.cancellation_note ? `: ${refund.cancellation_note}` : ""}` : refund.refund_note || "Без комментария"}</p></div>
      {!cancelled && <form action={formAction} className="flex gap-2" onSubmit={(event) => { if (!window.confirm("Отменить ошибочную отметку возврата?")) event.preventDefault(); }}><input type="hidden" name="student_prepaid_refund_id" value={refund.id} /><Input name="cancellation_note" placeholder="Причина отмены" disabled={isPending} className="h-8 text-xs" /><Button type="submit" variant="outline" size="sm" disabled={isPending} className="border-red-200 text-red-700">{isPending ? "Отменяем…" : "Отменить отметку"}</Button></form>}
      <StateMessage state={state} />
    </div>
  );
}

export function FinanceStudentPaymentActions(props: Props) {
  const remainingQuantity = Math.max(props.quantity - props.usedQuantity, 0);
  const refundableAmount = Math.max(remainingQuantity * props.finalUnitPrice - props.refundedAmount, 0);

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {props.refunds.length > 0 && <RefundHistory refunds={props.refunds} />}
      {props.status === "active" && <><AdjustmentForm creditId={props.creditId} quantity={props.quantity} usedQuantity={props.usedQuantity} total={props.finalTotalAmount} /><CancelCreditForm creditId={props.creditId} remainingQuantity={remainingQuantity} unitPrice={props.finalUnitPrice} /></>}
      {props.status === "cancelled" && <RefundForm creditId={props.creditId} remainingAmount={refundableAmount} />}
    </div>
  );
}
