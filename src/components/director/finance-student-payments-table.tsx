"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  FinanceStudentPaymentActions,
  FinanceStudentPaymentCreateForm,
} from "@/components/director/finance-student-payment-actions";
import { formatMoney } from "@/lib/formatters";

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

type StudentPaymentOption = { id: string; label: string; school_id: string | null; lesson_type_ids: string[] };
type PaymentSchool = { id: string; name: string };
type PaymentLessonType = { id: string; name: string };
type PaymentPrice = { school_id: string; lesson_type_id: string; price_amount: number };

const pageSize = 25;

export function FinanceStudentPaymentsTable({
  payments,
  students,
  schools,
  lessonTypes,
  prices,
}: {
  payments: StudentPaymentRow[];
  students: StudentPaymentOption[];
  schools: PaymentSchool[];
  lessonTypes: PaymentLessonType[];
  prices: PaymentPrice[];
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "cancelled">("all");
  const [instructor, setInstructor] = useState("all");
  const [school, setSchool] = useState("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const instructors = useMemo(() => Array.from(new Set(payments.map((item) => item.instructor_name))).sort(), [payments]);
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ru-RU");
    return payments.filter((item) => {
      const matchesSearch = !needle || `${item.student_label} ${item.student_access_id}`.toLocaleLowerCase("ru-RU").includes(needle);
      const matchesStatus = status === "all" || item.status === status;
      const matchesInstructor = instructor === "all" || item.instructor_name === instructor;
      const matchesSchool = school === "all" || item.school_name === school;
      return matchesSearch && matchesStatus && matchesInstructor && matchesSchool;
    });
  }, [payments, search, status, instructor, school]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <FinanceStudentPaymentCreateForm students={students} schools={schools} lessonTypes={lessonTypes} prices={prices} />

      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.6fr)_repeat(3,minmax(150px,1fr))]">
          <input
            className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm outline-none ring-zinc-400 focus:ring-2"
            placeholder="Поиск по ученику или логину"
            value={search}
            onChange={(event) => changeFilter(setSearch, event.target.value)}
          />
          <select className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm" value={status} onChange={(event) => changeFilter((value) => setStatus(value as "all" | "active" | "cancelled"), event.target.value)}>
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="cancelled">Остаток закрыт</option>
          </select>
          <select className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm" value={instructor} onChange={(event) => changeFilter(setInstructor, event.target.value)}>
            <option value="all">Все инструкторы</option>
            {instructors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm" value={school} onChange={(event) => changeFilter(setSchool, event.target.value)}>
            <option value="all">Все источники</option>
            {Array.from(new Set(payments.map((item) => item.school_name))).sort().map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <span>Показано {filtered.length} из {payments.length} оплат</span>
          {(search || status !== "all" || instructor !== "all" || school !== "all") && (
            <button type="button" className="font-semibold text-zinc-800 underline underline-offset-2" onClick={() => { setSearch(""); setStatus("all"); setInstructor("all"); setSchool("all"); setPage(1); }}>
              Сбросить фильтры
            </button>
          )}
        </div>
      </div>

      {payments.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-zinc-500">Оплат пока нет.</p> : filtered.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-zinc-500">По выбранным фильтрам оплаты не найдены.</p> : (
        <div className="overflow-hidden rounded-xl border border-zinc-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
                <tr>
                  <th className="px-3 py-3 font-semibold">Ученик</th>
                  <th className="px-3 py-3 font-semibold">Источник · тип</th>
                  <th className="px-3 py-3 text-right font-semibold">Оплачено</th>
                  <th className="px-3 py-3 text-right font-semibold">Занятия</th>
                  <th className="px-3 py-3 text-right font-semibold">Осталось</th>
                  <th className="px-3 py-3 font-semibold">Статус оплаты</th>
                  <th className="px-3 py-3 font-semibold">Дата</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const remaining = Math.max(item.quantity - item.used_quantity, 0);
                  const expanded = expandedId === item.id;
                  return (
                    <FragmentRow
                      key={item.id}
                      item={item}
                      remaining={remaining}
                      expanded={expanded}
                      onToggle={() => setExpandedId(expanded ? null : item.id)}
                      schools={schools}
                      lessonTypes={lessonTypes}
                      prices={prices}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-2 border-t bg-white px-3 py-3 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
            <span>Страница {currentPage} из {pageCount}</span>
            <div className="flex gap-2">
              <button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === 1} onClick={() => setPage((value) => value - 1)}>Назад</button>
              <button type="button" className="rounded-lg border px-3 py-1.5 disabled:opacity-40" disabled={currentPage === pageCount} onClick={() => setPage((value) => value + 1)}>Вперёд</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  item,
  remaining,
  expanded,
  onToggle,
  schools,
  lessonTypes,
  prices,
}: {
  item: StudentPaymentRow;
  remaining: number;
  expanded: boolean;
  onToggle: () => void;
  schools: PaymentSchool[];
  lessonTypes: PaymentLessonType[];
  prices: PaymentPrice[];
}) {
  return <>
    <tr className="border-t border-zinc-200 align-middle hover:bg-zinc-50">
      <td className="px-3 py-3"><Link href={`/director/students?view=list&status=all&student=${item.student_access_id}#student-${item.student_access_id}`} className="font-semibold text-zinc-900 underline decoration-zinc-300 underline-offset-4">{item.student_label}</Link><span className="mt-1 block text-xs text-zinc-500">Логин: {item.student_access_id}</span></td>
      <td className="px-3 py-3">{item.school_name}<span className="mt-1 block text-xs text-zinc-500">{item.lesson_type_name} · {item.instructor_name}</span></td>
      <td className="px-3 py-3 text-right font-semibold">{formatMoney(item.final_total_amount)}</td>
      <td className="px-3 py-3 text-right">{item.used_quantity} из {item.quantity}</td>
      <td className="px-3 py-3 text-right">{remaining}</td>
      <td className="px-3 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${item.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{item.status === "cancelled" ? "Остаток закрыт" : "Активна"}</span><span className="mt-1 block max-w-32 text-xs leading-4 text-zinc-500">{item.status === "cancelled" ? "Неиспользованные занятия закрыты" : "Остаток можно использовать"}</span></td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-zinc-500">{new Intl.DateTimeFormat("ru-RU").format(new Date(item.paid_at))}</td>
      <td className="px-3 py-3 text-right"><button type="button" aria-expanded={expanded} onClick={onToggle} className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs font-semibold hover:bg-white">{expanded ? "Скрыть" : "Подробнее"}</button></td>
    </tr>
    {expanded && <tr className="border-t border-zinc-200 bg-zinc-50"><td colSpan={8} className="p-3 sm:p-5"><div className="grid gap-3 lg:grid-cols-3"><div className="rounded-lg border bg-white p-4"><h3 className="font-semibold">Сводка оплаты</h3><p className="mt-2 text-xs leading-5 text-zinc-500">Внесено — сумма за {item.quantity} {item.quantity === 1 ? "занятие" : item.quantity < 5 ? "занятия" : "занятий"}. Возвращено — {item.refunded_amount > 0 ? "деньги, фактически переданные ученику" : "фактического возврата денег не было"}.</p><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-zinc-500">Внесено</dt><dd className="font-semibold">{formatMoney(item.final_total_amount)}</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Использовано</dt><dd>{item.used_quantity} занятий</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Осталось</dt><dd>{remaining} занятий</dd></div><div className="flex justify-between gap-3"><dt className="text-zinc-500">Возвращено</dt><dd>{formatMoney(item.refunded_amount)}</dd></div></dl></div><div className="rounded-lg border bg-white p-4"><h3 className="font-semibold">История</h3><div className="mt-3 space-y-2 text-sm text-zinc-600"><p>Создана предоплата · {new Intl.DateTimeFormat("ru-RU").format(new Date(item.paid_at))}</p>{item.adjustments.map((adjustment) => <p key={adjustment.id}>Корректировка · {new Intl.DateTimeFormat("ru-RU").format(new Date(adjustment.created_at))}</p>)}{item.refunds.map((refund) => <p key={refund.id}>{refund.cancelled_at ? "Возврат аннулирован" : "Возврат зафиксирован"} · {new Intl.DateTimeFormat("ru-RU").format(new Date(refund.refunded_at))}</p>)}</div></div><div className="rounded-lg border bg-white p-4"><h3 className="font-semibold">Действия</h3><p className="mt-2 text-xs text-zinc-500">Редкие действия открываются здесь, чтобы основной список оставался коротким.</p><FinanceStudentPaymentActions creditId={item.id} studentAccessId={item.student_access_id} quantity={item.quantity} usedQuantity={item.used_quantity} finalTotalAmount={item.final_total_amount} finalUnitPrice={item.final_unit_price} schoolId={item.school_id} lessonTypeId={item.lesson_type_id} paidAt={item.paid_at} paymentNote={item.payment_note} status={item.status} refundedAmount={item.refunded_amount} refunds={item.refunds} adjustments={item.adjustments} schools={schools} lessonTypes={lessonTypes} prices={prices} /></div></div></td></tr>}
  </>;
}
