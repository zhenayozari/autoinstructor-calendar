"use client";

import { useActionState, useState } from "react";
import {
  cancelStudentPrepaidCreditAction,
  cancelStudentPrepaidRefundAction,
  createStudentPrepaidCreditAdjustmentAction,
  createStudentPrepaidCreditAction,
  createStudentPrepaidRefundAction,
  updateStudentPrepaidCreditAction,
  type StudentAccessActionState,
} from "@/app/admin/students/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/formatters";
import { selectClassName } from "@/lib/formatters";

type PaymentStudent = { id: string; label: string; school_id: string | null; lesson_type_ids: string[] };
type PaymentSchool = { id: string; name: string };
type PaymentLessonType = { id: string; name: string };
type PaymentPrice = { school_id: string; lesson_type_id: string; price_amount: number };

type RefundItem = {
  id: string;
  amount: number;
  refunded_at: string;
  refund_note: string | null;
  cancelled_at: string | null;
  cancellation_note: string | null;
};

type AdjustmentItem = {
  id: string;
  previous_quantity: number;
  previous_final_total_amount: number;
  new_quantity: number;
  new_final_total_amount: number;
  reason: string;
  created_at: string;
};

type Props = {
  creditId: string;
  studentAccessId: string;
  quantity: number;
  usedQuantity: number;
  finalTotalAmount: number;
  finalUnitPrice: number;
  schoolId: string;
  lessonTypeId: string;
  paidAt: string;
  paymentNote: string | null;
  status: "active" | "cancelled";
  refundedAmount: number;
  refunds: RefundItem[];
  adjustments: AdjustmentItem[];
  schools: PaymentSchool[];
  lessonTypes: PaymentLessonType[];
  prices: PaymentPrice[];
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

function getPrice(prices: PaymentPrice[], schoolId: string, lessonTypeId: string) {
  return prices.find((price) => price.school_id === schoolId && price.lesson_type_id === lessonTypeId)?.price_amount ?? null;
}

function EditPrepaidForm({
  creditId,
  quantity: initialQuantity,
  total: initialTotal,
  schoolId: initialSchoolId,
  lessonTypeId: initialLessonTypeId,
  paidAt,
  paymentNote,
  schools,
  lessonTypes,
  prices,
}: {
  creditId: string;
  quantity: number;
  total: number;
  schoolId: string;
  lessonTypeId: string;
  paidAt: string;
  paymentNote: string | null;
  schools: PaymentSchool[];
  lessonTypes: PaymentLessonType[];
  prices: PaymentPrice[];
}) {
  const [state, formAction, isPending] = useActionState(updateStudentPrepaidCreditAction, initialState);
  const [schoolId, setSchoolId] = useState(initialSchoolId);
  const [lessonTypeId, setLessonTypeId] = useState(initialLessonTypeId);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [total, setTotal] = useState(String(initialTotal));
  const syncTotal = (nextSchoolId: string, nextLessonTypeId: string, nextQuantity: string) => {
    const price = getPrice(prices, nextSchoolId, nextLessonTypeId);
    const count = Number(nextQuantity);
    if (price !== null && Number.isInteger(count) && count > 0) setTotal(String(price * count));
  };

  return (
    <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-zinc-800">Редактировать оплату</summary>
      <form action={formAction} className="mt-3 space-y-3 border-t pt-3">
        <input type="hidden" name="student_prepaid_credit_id" value={creditId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>Источник</span><select name="school_id" className={selectClassName} value={schoolId} onChange={(event) => { setSchoolId(event.target.value); syncTotal(event.target.value, lessonTypeId, quantity); }} disabled={isPending} required>{schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Тип занятия</span><select name="lesson_type_id" className={selectClassName} value={lessonTypeId} onChange={(event) => { setLessonTypeId(event.target.value); syncTotal(schoolId, event.target.value, quantity); }} disabled={isPending} required>{lessonTypes.map((lessonType) => <option key={lessonType.id} value={lessonType.id}>{lessonType.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Количество оплачиваемых занятий</span><Input name="quantity" type="number" min={1} max={5000} value={quantity} onChange={(event) => { setQuantity(event.target.value); syncTotal(schoolId, lessonTypeId, event.target.value); }} disabled={isPending} required /></label>
          <label className="space-y-1 text-sm"><span>Итоговая сумма</span><Input name="final_total_amount" type="number" min={0} max={10000000} value={total} onChange={(event) => setTotal(event.target.value)} disabled={isPending} required /></label>
          <label className="space-y-1 text-sm"><span>Дата оплаты</span><Input name="paid_at" type="date" defaultValue={paidAt.slice(0, 10)} disabled={isPending} required /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>Комментарий</span><Input name="payment_note" defaultValue={paymentNote ?? ""} maxLength={1000} disabled={isPending} /></label>
        </div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>{isPending ? "Сохраняем…" : "Сохранить оплату"}</Button>
      </form>
    </details>
  );
}

export function FinanceStudentPaymentCreateForm({
  students,
  schools,
  lessonTypes,
  prices,
}: {
  students: PaymentStudent[];
  schools: PaymentSchool[];
  lessonTypes: PaymentLessonType[];
  prices: PaymentPrice[];
}) {
  const [state, formAction, isPending] = useActionState(createStudentPrepaidCreditAction, initialState);
  const firstStudent = students[0];
  const [studentAccessId, setStudentAccessId] = useState(firstStudent?.id ?? "");
  const [schoolId, setSchoolId] = useState(firstStudent?.school_id ?? schools[0]?.id ?? "");
  const [lessonTypeId, setLessonTypeId] = useState(firstStudent?.lesson_type_ids[0] ?? lessonTypes[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1");
  const selectedStudent = students.find((student) => student.id === studentAccessId);
  const allowedLessonTypes = lessonTypes.filter((lessonType) => !selectedStudent?.lesson_type_ids.length || selectedStudent.lesson_type_ids.includes(lessonType.id));
  const price = getPrice(prices, schoolId, lessonTypeId);
  const [total, setTotal] = useState(price === null ? "" : String(price * Number(quantity || 0)));

  return (
    <details className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-emerald-950">Добавить оплату ученика</summary>
      <form action={formAction} className="mt-3 space-y-3 border-t border-emerald-200 pt-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm sm:col-span-2"><span>Ученик</span><select name="student_access_id" className={selectClassName} value={studentAccessId} onChange={(event) => { const next = students.find((student) => student.id === event.target.value); const nextSchoolId = next?.school_id ?? schools[0]?.id ?? ""; const nextLessonTypeId = next?.lesson_type_ids[0] ?? lessonTypes[0]?.id ?? ""; setStudentAccessId(event.target.value); setSchoolId(nextSchoolId); setLessonTypeId(nextLessonTypeId); const nextPrice = getPrice(prices, nextSchoolId, nextLessonTypeId); setTotal(nextPrice === null ? "" : String(nextPrice * Number(quantity || 0))); }} disabled={isPending} required>{students.map((student) => <option key={student.id} value={student.id}>{student.label}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Источник</span><select name="school_id" className={selectClassName} value={schoolId} onChange={(event) => { setSchoolId(event.target.value); const nextPrice = getPrice(prices, event.target.value, lessonTypeId); if (nextPrice !== null) setTotal(String(nextPrice * Number(quantity || 0))); }} disabled={isPending} required>{schools.filter((school) => !selectedStudent?.school_id || school.id === selectedStudent.school_id).map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Тип занятия</span><select name="lesson_type_id" className={selectClassName} value={lessonTypeId} onChange={(event) => { setLessonTypeId(event.target.value); const nextPrice = getPrice(prices, schoolId, event.target.value); if (nextPrice !== null) setTotal(String(nextPrice * Number(quantity || 0))); }} disabled={isPending} required>{allowedLessonTypes.map((lessonType) => <option key={lessonType.id} value={lessonType.id}>{lessonType.name}</option>)}</select></label>
          <label className="space-y-1 text-sm"><span>Количество оплачиваемых занятий</span><Input name="quantity" type="number" min={1} max={5000} value={quantity} onChange={(event) => { setQuantity(event.target.value); if (price !== null) setTotal(String(price * Number(event.target.value || 0))); }} disabled={isPending} required /></label>
          <label className="space-y-1 text-sm"><span>Итоговая сумма</span><Input name="final_total_amount" type="number" min={0} max={10000000} value={total} onChange={(event) => setTotal(event.target.value)} disabled={isPending} required /></label>
          <label className="space-y-1 text-sm"><span>Дата оплаты</span><Input name="paid_at" type="date" defaultValue={new Intl.DateTimeFormat("en-CA").format(new Date())} disabled={isPending} required /></label>
          <label className="space-y-1 text-sm sm:col-span-2"><span>Комментарий</span><Input name="payment_note" maxLength={1000} disabled={isPending} /></label>
        </div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending || students.length === 0}>{isPending ? "Сохраняем…" : "Добавить оплату"}</Button>
      </form>
    </details>
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
      <summary className="cursor-pointer text-sm font-semibold text-red-900">Закрыть остаток предоплаты</summary>
      <p className="mt-2 text-xs leading-5 text-red-900">Это отменит {remainingQuantity} неиспользованных занятий на сумму {formatMoney(amount)} и скорректирует расчёт с инструктором.</p>
      <form action={formAction} className="mt-3 space-y-3 border-t border-red-200 pt-3" onSubmit={(event) => { if (!window.confirm(`Отменить остаток предоплаты на ${formatMoney(amount)}?`)) event.preventDefault(); }}>
        <input type="hidden" name="student_prepaid_credit_id" value={creditId} />
        <div className="space-y-1"><Label>Причина отмены</Label><Input name="cancellation_note" maxLength={900} placeholder="Например: возврат ученику" disabled={isPending} required /></div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending} className="border-red-200 text-red-700">{isPending ? "Закрываем…" : "Закрыть остаток"}</Button>
      </form>
    </details>
  );
}

function RefundForm({ creditId, remainingAmount }: { creditId: string; remainingAmount: number }) {
  const [state, formAction, isPending] = useActionState(createStudentPrepaidRefundAction, initialState);
  if (remainingAmount <= 0) return null;

  return (
    <details className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
      <summary className="cursor-pointer text-sm font-semibold text-blue-950">Зафиксировать возврат ученику</summary>
      <p className="mt-2 text-xs leading-5 text-blue-950">Используйте только после того, как деньги действительно переданы ученику. Максимум к возврату: {formatMoney(remainingAmount)}.</p>
      <form action={formAction} className="mt-3 space-y-3 border-t border-blue-200 pt-3" onSubmit={(event) => { if (!window.confirm("Деньги уже действительно переданы ученику?")) event.preventDefault(); }}>
        <input type="hidden" name="student_prepaid_credit_id" value={creditId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Сумма</Label><Input name="refund_amount" type="number" min={1} max={remainingAmount} defaultValue={remainingAmount} disabled={isPending} required /></div>
          <div className="space-y-1"><Label>Дата возврата</Label><Input name="refunded_at" type="date" defaultValue={new Intl.DateTimeFormat("en-CA").format(new Date())} disabled={isPending} required /></div>
          <div className="space-y-1"><Label>Комментарий</Label><Input name="refund_note" maxLength={1000} placeholder="Например: переводом" disabled={isPending} /></div>
        </div>
        <StateMessage state={state} />
        <Button type="submit" variant="outline" disabled={isPending}>{isPending ? "Сохраняем…" : "Зафиксировать возврат"}</Button>
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
      {!cancelled && <form action={formAction} className="flex gap-2" onSubmit={(event) => { if (!window.confirm("Аннулировать ошибочную фиксацию возврата?")) event.preventDefault(); }}><input type="hidden" name="student_prepaid_refund_id" value={refund.id} /><Input name="cancellation_note" placeholder="Причина аннулирования" disabled={isPending} className="h-8 text-xs" /><Button type="submit" variant="outline" size="sm" disabled={isPending} className="border-red-200 text-red-700">{isPending ? "Аннулируем…" : "Аннулировать возврат"}</Button></form>}
      <StateMessage state={state} />
    </div>
  );
}

function AdjustmentHistory({ adjustments }: { adjustments: AdjustmentItem[] }) {
  if (adjustments.length === 0) return null;
  return (
    <details className="rounded-lg border bg-white">
      <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-zinc-700">История корректировок: {adjustments.length}</summary>
      <div className="space-y-2 border-t p-3 text-xs text-zinc-600">
        {adjustments.map((adjustment) => (
          <div key={adjustment.id} className="rounded-lg border bg-zinc-50 p-2">
            <p className="font-semibold text-zinc-800">{new Intl.DateTimeFormat("ru-RU").format(new Date(adjustment.created_at))}</p>
            <p>Было: {adjustment.previous_quantity} занятий · {formatMoney(adjustment.previous_final_total_amount)}</p>
            <p>Стало: {adjustment.new_quantity} занятий · {formatMoney(adjustment.new_final_total_amount)}</p>
            <p>Причина: {adjustment.reason}</p>
          </div>
        ))}
      </div>
    </details>
  );
}

export function FinanceStudentPaymentActions(props: Props) {
  const remainingQuantity = Math.max(props.quantity - props.usedQuantity, 0);
  const refundableAmount = Math.max(remainingQuantity * props.finalUnitPrice - props.refundedAmount, 0);

  return (
    <div className="mt-4 space-y-3 border-t pt-4">
      {props.refunds.length > 0 && <RefundHistory refunds={props.refunds} />}
      <AdjustmentHistory adjustments={props.adjustments} />
      {props.status === "active" && <>
        {props.usedQuantity === 0 ? <EditPrepaidForm creditId={props.creditId} quantity={props.quantity} total={props.finalTotalAmount} schoolId={props.schoolId} lessonTypeId={props.lessonTypeId} paidAt={props.paidAt} paymentNote={props.paymentNote} schools={props.schools} lessonTypes={props.lessonTypes} prices={props.prices} /> : <AdjustmentForm creditId={props.creditId} quantity={props.quantity} usedQuantity={props.usedQuantity} total={props.finalTotalAmount} />}
        <CancelCreditForm creditId={props.creditId} remainingQuantity={remainingQuantity} unitPrice={props.finalUnitPrice} />
      </>}
      {props.status === "cancelled" && <RefundForm creditId={props.creditId} remainingAmount={refundableAmount} />}
    </div>
  );
}
