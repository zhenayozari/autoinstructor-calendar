"use client";

import { useActionState, useMemo, useState } from "react";
import {
  cancelStudentPrepaidCreditAction,
  cancelStudentPrepaidRefundAction,
  createStudentPrepaidRefundAction,
  createStudentPrepaidCreditAction,
  createStudentPrepaidCreditAdjustmentAction,
  updateStudentPrepaidCreditAction,
  type StudentAccessActionState,
} from "@/app/admin/students/actions";
import { formatMoney, selectClassName } from "@/lib/formatters";
import type {
  LessonType,
  School,
  SchoolLessonTypePrice,
  StudentPrepaidCredit,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: StudentAccessActionState = {
  status: "idle",
  message: "",
};

function StateMessage({ state }: { state: StudentAccessActionState }) {
  if (!state.message) return null;

  return (
    <div
      className={`rounded-lg px-3 py-2 text-sm ${
        state.status === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {state.message}
    </div>
  );
}

function CancelPrepaidCreditForm({
  credit,
}: {
  credit: StudentPrepaidCredit;
}) {
  const [state, formAction, isPending] = useActionState(
    cancelStudentPrepaidCreditAction,
    INITIAL_STATE,
  );
  const remainingQuantity = Math.max(
    credit.quantity - credit.used_quantity,
    0,
  );
  const refundableAmount = remainingQuantity * credit.final_unit_price;

  if (remainingQuantity === 0) {
    return (
      <p className="mt-3 border-t pt-3 text-xs text-zinc-500">
        Все оплаченные занятия уже использованы. Отменять нечего.
      </p>
    );
  }

  return (
    <details className="mt-3 border-t pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-red-700">
        Отменить остаток предоплаты
      </summary>
      <form
        action={formAction}
        className="mt-3 space-y-3 rounded-lg border border-red-100 bg-red-50/60 p-3"
        onSubmit={(event) => {
          if (
            !window.confirm(
              `Отменить ${remainingQuantity} занятий на сумму ${formatMoney(refundableAmount)}? Начисление инструктору будет скорректировано.`,
            )
          ) {
            event.preventDefault();
          }
        }}
      >
        <input
          type="hidden"
          name="student_prepaid_credit_id"
          value={credit.id}
        />
        <p className="text-xs leading-5 text-red-800">
          Будет отменено: {remainingQuantity} занятий · сумма остатка {formatMoney(refundableAmount)}.
        </p>
        <div className="space-y-1">
          <Label htmlFor={`cancellation-note-${credit.id}`}>Причина отмены</Label>
          <Input
            id={`cancellation-note-${credit.id}`}
            name="cancellation_note"
            maxLength={900}
            placeholder="Например: возврат ученику или ошибочная оплата"
            disabled={isPending}
            required
          />
        </div>
        <StateMessage state={state} />
        <Button
          type="submit"
          variant="outline"
          disabled={isPending}
          className="border-red-200 text-red-700 hover:bg-red-100 hover:text-red-800"
        >
          {isPending ? "Отменяем…" : "Отменить остаток"}
        </Button>
      </form>
    </details>
  );
}

function StudentPrepaidRefundForm({
  credit,
}: {
  credit: StudentPrepaidCredit;
}) {
  const [state, formAction, isPending] = useActionState(
    createStudentPrepaidRefundAction,
    INITIAL_STATE,
  );
  const cancelledQuantity = Math.max(
    credit.quantity - credit.used_quantity,
    0,
  );
  const refundableAmount = cancelledQuantity * credit.final_unit_price;
  const remainingAmount = Math.max(
    refundableAmount - credit.refunded_amount,
    0,
  );
  const currentDate = new Intl.DateTimeFormat("en-CA").format(new Date());

  return (
    <div className="mt-3 border-t pt-3">
      <p className="text-xs text-zinc-600">
        Возвращено ученику: {formatMoney(credit.refunded_amount)} · осталось
        вернуть: {formatMoney(remainingAmount)}
      </p>
      {credit.refunds.length > 0 && (
        <div className="mt-2 divide-y rounded-lg border bg-white">
          <p className="px-2 pt-2 text-xs font-semibold text-zinc-700">
            История возвратов ученику
          </p>
          {credit.refunds.map((refund) => (
            <StudentPrepaidRefundRow key={refund.id} refund={refund} />
          ))}
        </div>
      )}
      {remainingAmount > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-blue-700">
            Отметить возврат денег ученику
          </summary>
          <p className="mt-2 text-xs text-zinc-600">
            Используйте после того, как деньги действительно переданы ученику.
            Эта кнопка только фиксирует возврат в системе и сама деньги не переводит.
          </p>
          <form
            action={formAction}
            className="mt-3 space-y-3 rounded-lg border border-blue-100 bg-blue-50/60 p-3"
            onSubmit={(event) => {
              if (!window.confirm("Отметить фактический возврат денег ученику?")) {
                event.preventDefault();
              }
            }}
          >
            <input
              type="hidden"
              name="student_prepaid_credit_id"
              value={credit.id}
            />
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor={`refund-amount-${credit.id}`}>Сумма</Label>
                <Input
                  id={`refund-amount-${credit.id}`}
                  type="number"
                  name="refund_amount"
                  min={1}
                  max={remainingAmount}
                  defaultValue={remainingAmount}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`refunded-at-${credit.id}`}>Дата возврата</Label>
                <Input
                  id={`refunded-at-${credit.id}`}
                  type="date"
                  name="refunded_at"
                  defaultValue={currentDate}
                  disabled={isPending}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`refund-note-${credit.id}`}>Комментарий</Label>
                <Input
                  id={`refund-note-${credit.id}`}
                  name="refund_note"
                  maxLength={1000}
                  placeholder="Например: переводом"
                  disabled={isPending}
                />
              </div>
            </div>
            <StateMessage state={state} />
            <Button type="submit" variant="outline" disabled={isPending}>
              {isPending ? "Сохраняем…" : "Отметить возврат ученику"}
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}

function StudentPrepaidRefundRow({
  refund,
}: {
  refund: StudentPrepaidCredit["refunds"][number];
}) {
  const [state, formAction, isPending] = useActionState(
    cancelStudentPrepaidRefundAction,
    INITIAL_STATE,
  );
  const isCancelled = Boolean(refund.cancelled_at);

  return (
    <div className={`p-2 text-xs ${isCancelled ? "text-zinc-400" : "text-zinc-700"}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold">
            {formatMoney(refund.amount)} · {new Intl.DateTimeFormat("ru-RU").format(new Date(refund.refunded_at))}
          </p>
          <p className="mt-1">
            {isCancelled
              ? `Отметка отменена${refund.cancellation_note ? `: ${refund.cancellation_note}` : ""}`
              : refund.refund_note?.trim() || "Без комментария"}
          </p>
          {!isCancelled && (
            <p className="mt-1 font-semibold text-emerald-700">
              Возврат ученику отмечен
            </p>
          )}
        </div>
        {!isCancelled && (
          <form
            action={formAction}
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              if (!window.confirm("Отменить ошибочную отметку возврата? Сумма снова попадёт в остаток к возврату ученику.")) {
                event.preventDefault();
              }
            }}
          >
            <input type="hidden" name="student_prepaid_refund_id" value={refund.id} />
            <Input
              name="cancellation_note"
              maxLength={1000}
              placeholder="Причина отмены"
              aria-label="Причина отмены возврата"
              disabled={isPending}
              className="h-8 text-xs sm:w-52"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isPending}
              aria-label="Отменить отметку возврата ученику"
              title="Отменить отметку возврата ученику"
              className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            >
              {isPending ? "Отменяем…" : "Отменить"}
            </Button>
          </form>
        )}
      </div>
      <StateMessage state={state} />
    </div>
  );
}

function getPrice(
  prices: SchoolLessonTypePrice[],
  schoolId: string,
  lessonTypeId: string,
) {
  return (
    prices.find(
      (price) =>
        price.school_id === schoolId && price.lesson_type_id === lessonTypeId,
    )?.price_amount ?? null
  );
}

function PrepaidCreditForm({
  accessId,
  schoolId: initialSchoolId,
  lessonTypeId: initialLessonTypeId,
  quantity: initialQuantity,
  finalTotalAmount: initialFinalTotalAmount,
  paidAt: initialPaidAt,
  paymentNote: initialPaymentNote,
  creditId,
  usedQuantity = 0,
  schools,
  lessonTypes,
  prices,
}: {
  accessId?: string;
  schoolId?: string;
  lessonTypeId?: string;
  quantity?: number;
  finalTotalAmount?: number;
  paidAt?: string;
  paymentNote?: string | null;
  creditId?: string;
  usedQuantity?: number;
  schools: School[];
  lessonTypes: LessonType[];
  prices: SchoolLessonTypePrice[];
}) {
  const isEditing = Boolean(creditId);
  const action = isEditing
    ? updateStudentPrepaidCreditAction
    : createStudentPrepaidCreditAction;
  const [state, formAction, isPending] = useActionState(action, INITIAL_STATE);
  const defaultSchoolId = initialSchoolId ?? schools[0]?.id ?? "";
  const defaultLessonTypeId = initialLessonTypeId ?? lessonTypes[0]?.id ?? "";
  const initialCalculatedUnitPrice = getPrice(
    prices,
    defaultSchoolId,
    defaultLessonTypeId,
  );
  const initialCalculatedTotal =
    initialCalculatedUnitPrice !== null
      ? initialCalculatedUnitPrice * (initialQuantity ?? 1)
      : null;
  const [selectedSchoolId, setSelectedSchoolId] = useState(defaultSchoolId);
  const [selectedLessonTypeId, setSelectedLessonTypeId] =
    useState(defaultLessonTypeId);
  const [quantity, setQuantity] = useState(String(initialQuantity ?? 1));
  const [finalTotalAmount, setFinalTotalAmount] = useState(
    String(initialFinalTotalAmount ?? initialCalculatedTotal ?? ""),
  );
  const [isFinalTotalCustom, setIsFinalTotalCustom] = useState(
    initialFinalTotalAmount !== undefined,
  );
  const calculatedUnitPrice = getPrice(
    prices,
    selectedSchoolId,
    selectedLessonTypeId,
  );
  const calculatedTotalAmount = useMemo(() => {
    const parsedQuantity = Number(quantity);
    return calculatedUnitPrice !== null && Number.isInteger(parsedQuantity)
      ? calculatedUnitPrice * parsedQuantity
      : null;
  }, [calculatedUnitPrice, quantity]);

  function syncCalculatedTotal(
    nextSchoolId: string,
    nextLessonTypeId: string,
    nextQuantity: string,
  ) {
    if (isFinalTotalCustom) return;

    const nextPrice = getPrice(prices, nextSchoolId, nextLessonTypeId);
    const parsedQuantity = Number(nextQuantity);
    const nextTotal =
      nextPrice !== null && Number.isInteger(parsedQuantity) && parsedQuantity >= 1
        ? nextPrice * parsedQuantity
        : null;

    setFinalTotalAmount(nextTotal === null ? "" : String(nextTotal));
  }

  const canChangeSourceAndType = !isEditing || usedQuantity === 0;

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-zinc-50 p-3">
      {accessId && <input type="hidden" name="student_access_id" value={accessId} />}
      {creditId && (
        <input
          type="hidden"
          name="student_prepaid_credit_id"
          value={creditId}
        />
      )}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Источник</Label>
          <select
            name="school_id"
            className={selectClassName}
            value={selectedSchoolId}
            onChange={(event) => {
              const nextSchoolId = event.target.value;
              setSelectedSchoolId(nextSchoolId);
              syncCalculatedTotal(nextSchoolId, selectedLessonTypeId, quantity);
            }}
            disabled={!canChangeSourceAndType || isPending}
            required
          >
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Тип занятия</Label>
          <select
            name="lesson_type_id"
            className={selectClassName}
            value={selectedLessonTypeId}
            onChange={(event) => {
              const nextLessonTypeId = event.target.value;
              setSelectedLessonTypeId(nextLessonTypeId);
              syncCalculatedTotal(selectedSchoolId, nextLessonTypeId, quantity);
            }}
            disabled={!canChangeSourceAndType || isPending}
            required
          >
            {lessonTypes.map((lessonType) => (
              <option key={lessonType.id} value={lessonType.id}>
                {lessonType.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${creditId ?? accessId}-prepaid-quantity`}>
             Количество оплачиваемых занятий
          </Label>
          <Input
            id={`${creditId ?? accessId}-prepaid-quantity`}
            name="quantity"
            type="number"
            min={Math.max(1, usedQuantity)}
            max={5000}
            step={1}
            value={quantity}
            onChange={(event) => {
              const nextQuantity = event.target.value;
              setQuantity(nextQuantity);
              syncCalculatedTotal(
                selectedSchoolId,
                selectedLessonTypeId,
                nextQuantity,
              );
            }}
            disabled={isPending}
            required
          />
        </div>
        <div className="space-y-1">
          <Label>Цена по тарифу</Label>
          <div className="flex h-10 items-center rounded-xl border bg-white px-3 text-sm">
            {calculatedUnitPrice === null
              ? "Цена не задана"
              : formatMoney(calculatedUnitPrice)}
          </div>
          <input
            type="hidden"
            name="calculated_unit_price"
            value={calculatedUnitPrice ?? ""}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${creditId ?? accessId}-prepaid-total`}>
            Итоговая сумма
          </Label>
          <Input
            id={`${creditId ?? accessId}-prepaid-total`}
            name="final_total_amount"
            type="number"
            min={0}
            max={10000000}
            step={1}
            value={finalTotalAmount}
            onChange={(event) => {
              setIsFinalTotalCustom(true);
              setFinalTotalAmount(event.target.value);
            }}
            placeholder={calculatedTotalAmount?.toString() ?? "Введите сумму"}
            disabled={isPending}
            required
          />
          {calculatedTotalAmount !== null && (
            <p className="text-xs text-zinc-500">
              По тарифу: {formatMoney(calculatedTotalAmount)}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${creditId ?? accessId}-prepaid-date`}>Дата оплаты</Label>
          <Input
            id={`${creditId ?? accessId}-prepaid-date`}
            name="paid_at"
            type="date"
            defaultValue={initialPaidAt?.slice(0, 10)}
            disabled={isPending}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${creditId ?? accessId}-prepaid-note`}>Комментарий</Label>
        <Input
          id={`${creditId ?? accessId}-prepaid-note`}
          name="payment_note"
          defaultValue={initialPaymentNote ?? ""}
          maxLength={1000}
          placeholder="Например: полная оплата обучения"
          disabled={isPending}
        />
      </div>
      {isEditing && usedQuantity > 0 && (
        <p className="text-xs text-zinc-500">
          Уже использовано: {usedQuantity}. Источник и тип занятия больше нельзя изменить.
        </p>
      )}
      <StateMessage state={state} />
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "Сохраняем…" : isEditing ? "Сохранить предоплату" : "Добавить предоплату"}
      </Button>
    </form>
  );
}

function PrepaidCreditAdjustmentForm({
  credit,
  schools,
  lessonTypes,
}: {
  credit: StudentPrepaidCredit;
  schools: School[];
  lessonTypes: LessonType[];
}) {
  const [state, formAction, isPending] = useActionState(
    createStudentPrepaidCreditAdjustmentAction,
    INITIAL_STATE,
  );
  const school = schools.find((item) => item.id === credit.school_id);
  const lessonType = lessonTypes.find((item) => item.id === credit.lesson_type_id);
  const [quantity, setQuantity] = useState(String(credit.quantity));
  const [total, setTotal] = useState(String(credit.final_total_amount));
  return (
    <form action={formAction} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
      <input type="hidden" name="student_prepaid_credit_id" value={credit.id} />
      <p className="text-xs text-amber-900">
        Источник и тип зафиксированы: {school?.name ?? "Источник"} · {lessonType?.name ?? "Тип занятия"}.
        Изменение сохранится отдельной записью в истории.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Количество оплачиваемых занятий</Label>
          <Input name="quantity" type="number" min={credit.used_quantity} max={5000} value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isPending} required />
        </div>
        <div className="space-y-1">
          <Label>Новая итоговая сумма</Label>
          <Input name="final_total_amount" type="number" min={0} max={10000000} step={1} value={total} onChange={(event) => setTotal(event.target.value)} disabled={isPending} required />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Причина корректировки</Label>
        <Input name="adjustment_reason" maxLength={1000} placeholder="Например: скидка за полную оплату" disabled={isPending} required />
      </div>
      <StateMessage state={state} />
      <Button type="submit" variant="outline" disabled={isPending}>
        {isPending ? "Сохраняем…" : "Сохранить корректировку"}
      </Button>
    </form>
  );
}

export function StudentPrepaidCreditsPanel({
  accessId,
  accessSchoolId,
  accessLessonTypeIds,
  credits,
  schools,
  lessonTypes,
  prices,
  canManage,
}: {
  accessId: string;
  accessSchoolId: string | null;
  accessLessonTypeIds: string[];
  credits: StudentPrepaidCredit[];
  schools: School[];
  lessonTypes: LessonType[];
  prices: SchoolLessonTypePrice[];
  canManage: boolean;
}) {
  const allowedLessonTypes = lessonTypes.filter((lessonType) =>
    accessLessonTypeIds.includes(lessonType.id),
  );

  return (
    <details className="rounded-xl border border-blue-200 bg-blue-50/50">
      <summary className="cursor-pointer list-none px-3 py-3 text-sm font-semibold text-blue-950">
        Доступ и оплата
      </summary>
      <div className="space-y-3 border-t border-blue-100 px-3 py-3">
        {credits.map((credit) => {
          const school = schools.find((item) => item.id === credit.school_id);
          const lessonType = lessonTypes.find(
            (item) => item.id === credit.lesson_type_id,
          );
          const remaining = Math.max(credit.quantity - credit.used_quantity, 0);

          return (
            <div key={credit.id} className="rounded-xl border bg-white p-3 text-sm">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold">
                    {school?.name ?? "Источник удалён"} · {lessonType?.name ?? "Тип удалён"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {credit.status === "active"
                      ? `Оплачено ${credit.quantity} · использовано ${credit.used_quantity} · осталось ${remaining}`
                      : `Было оплачено ${credit.quantity} · использовано ${credit.used_quantity} · отменено ${remaining}`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-600">
                    Оплата ученика: {formatMoney(credit.final_unit_price)} за занятие · всего {formatMoney(credit.final_total_amount)}
                  </p>
                  {credit.status === "cancelled" && credit.cancellation_note && (
                    <p className="mt-1 text-xs text-red-700">
                      Причина отмены: {credit.cancellation_note}
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    credit.status === "active"
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-red-100 text-red-800"
                  }`}
                >
                  {credit.status === "active" ? "Активна" : "Отменена"}
                </span>
              </div>
              {canManage && credit.status === "active" && (
                <>
                  {credit.used_quantity > 0 ? (
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-amber-800">
                        Внести корректировку
                      </summary>
                      <div className="mt-3">
                        <PrepaidCreditAdjustmentForm credit={credit} schools={schools} lessonTypes={allowedLessonTypes} />
                      </div>
                    </details>
                  ) : (
                  <details className="mt-3 border-t pt-3">
                  <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                    Редактировать оплату
                  </summary>
                  <div className="mt-3">
                    <PrepaidCreditForm
                      creditId={credit.id}
                      schoolId={credit.school_id}
                      lessonTypeId={credit.lesson_type_id}
                      quantity={credit.quantity}
                      finalTotalAmount={credit.final_total_amount}
                      paidAt={credit.paid_at}
                      paymentNote={credit.payment_note}
                      usedQuantity={credit.used_quantity}
                      schools={schools}
                      lessonTypes={allowedLessonTypes}
                      prices={prices}
                    />
                  </div>
                  </details>
                  )}
                  {credit.adjustments.length > 0 && (
                    <details className="mt-3 border-t pt-3">
                      <summary className="cursor-pointer text-xs font-semibold text-zinc-700">
                        История корректировок: {credit.adjustments.length}
                      </summary>
                      <div className="mt-2 space-y-2 text-xs text-zinc-600">
                        {credit.adjustments.map((adjustment) => (
                          <div key={adjustment.id} className="rounded-lg border bg-zinc-50 p-2">
                            <p className="font-semibold text-zinc-800">
                              {new Intl.DateTimeFormat("ru-RU").format(new Date(adjustment.created_at))}
                            </p>
                            <p>
                              Было: {adjustment.previous_quantity} занятий · {formatMoney(adjustment.previous_final_total_amount)}
                            </p>
                            <p>
                              Стало: {adjustment.new_quantity} занятий · {formatMoney(adjustment.new_final_total_amount)}
                            </p>
                            <p className="mt-1">Причина: {adjustment.reason}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  <CancelPrepaidCreditForm credit={credit} />
                </>
              )}
              {canManage && credit.status === "cancelled" && (
                <StudentPrepaidRefundForm credit={credit} />
              )}
            </div>
          );
        })}
        {canManage ? (
          <PrepaidCreditForm
            accessId={accessId}
            schoolId={accessSchoolId ?? undefined}
            schools={schools}
            lessonTypes={allowedLessonTypes}
            prices={prices}
          />
        ) : (
          <p className="text-xs text-zinc-600">
            Предоплату добавляет руководитель.
          </p>
        )}
      </div>
    </details>
  );
}
