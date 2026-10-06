import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InstructorDebtActions } from "@/components/director/instructor-debt-actions";
import { CancelPayoutButton } from "@/components/director/cancel-payout-button";
import { formatDateTime, formatMoney } from "@/lib/formatters";
import {
  cancelDirectorReportPayoutPaymentAction,
  createDirectorInstructorReturnAction,
  createDirectorReportPayoutPaymentAction,
  markDirectorInstructorDebtWithholdingAction,
} from "@/app/director/reports/actions";

export type FinanceInstructorItem = {
  id: string;
  name: string;
  plannedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  directIncomeAmount: number;
  students: Array<{
    id: string | null;
    name: string;
    remainingAmount: number;
    bookingCount: number;
    bookingUnits: number;
    prepaidUnits: number;
    adjustmentCount: number;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paidAt: string;
    note: string | null;
  }>;
};

const financeReturnPath = "/director/finances?view=instructor-settlements";

function Sources({ item }: { item: FinanceInstructorItem["students"][number] }) {
  const sources = [
    item.bookingUnits > 0 ? `по записям: ${item.bookingUnits} ${item.bookingUnits === 1 ? "занятие" : "занятий"}` : null,
    item.prepaidUnits > 0 ? `по предоплате: ${item.prepaidUnits} ${item.prepaidUnits === 1 ? "занятие" : "занятий"}` : null,
    item.adjustmentCount > 0 ? `корректировок: ${item.adjustmentCount}` : null,
  ].filter(Boolean);

  return <span>{sources.join(" · ") || "прочие начисления"}</span>;
}

export function FinanceInstructorSettlements({ items }: { items: FinanceInstructorItem[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-zinc-500">
        Пока нет начислений или открытых расчётов с инструкторами.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const schoolOwes = item.remainingAmount > 0;
        const debt = Math.abs(item.remainingAmount);

        return (
          <details key={item.id} className={`rounded-2xl border ${schoolOwes ? "border-amber-200 bg-amber-50/40" : item.remainingAmount < 0 ? "border-red-200 bg-red-50/40" : "border-zinc-200 bg-white"}`}>
            <summary className="cursor-pointer list-none px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold text-zinc-950">{item.name}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {schoolOwes ? "Школа должна инструктору (зарплата)" : item.remainingAmount < 0 ? "Инструктор должен школе" : "Открытого остатка нет"}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-right text-xs sm:min-w-[410px]">
                  <span><span className="block text-zinc-500">Начислено</span><strong>{formatMoney(item.plannedAmount)}</strong></span>
                  <span><span className="block text-zinc-500">Выдано</span><strong>{formatMoney(item.paidAmount)}</strong></span>
                  <span><span className="block text-zinc-500">Осталось</span><strong className={item.remainingAmount < 0 ? "text-red-700" : "text-amber-800"}>{formatMoney(item.remainingAmount)}</strong></span>
                </div>
              </div>
            </summary>

            <div className="border-t border-inherit bg-white/80 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-white p-3"><p className="text-xs text-zinc-500">Начислено</p><p className="mt-1 font-semibold">{formatMoney(item.plannedAmount)}</p><p className="mt-1 text-xs text-zinc-500">Все начисления школы</p></div>
                <div className="rounded-xl border bg-white p-3"><p className="text-xs text-zinc-500">Выдано</p><p className="mt-1 font-semibold text-emerald-800">{formatMoney(item.paidAmount)}</p><p className="mt-1 text-xs text-zinc-500">Руководитель отметил выдачу</p></div>
                <div className="rounded-xl border bg-white p-3"><p className="text-xs text-zinc-500">К выдаче</p><p className="mt-1 font-semibold text-amber-800">{formatMoney(Math.max(item.remainingAmount, 0))}</p><p className="mt-1 text-xs text-zinc-500">Зарплата инструктора, которую школа ещё не выдала</p></div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-800">Доп. заработок</p><p className="mt-1 font-semibold text-emerald-900">{formatMoney(item.directIncomeAmount)}</p><p className="mt-1 text-xs text-emerald-800">Частные дополнительные занятия</p></div>
              </div>

              {item.students.length > 0 && (
                <details className="mt-4 rounded-xl border bg-white">
                  <summary className="cursor-pointer px-3 py-3 text-sm font-semibold">Из чего сложился расчёт · {item.students.length} учеников</summary>
                  <div className="divide-y border-t">
                    {item.students.map((student) => (
                      <div key={`${student.id ?? "none"}-${student.name}`} className="flex flex-col gap-2 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          {student.id ? <Link className="font-semibold text-blue-700 hover:underline" href={`/director/students?view=list&student=${student.id}#student-${student.id}`}>{student.name}</Link> : <span className="font-semibold">{student.name}</span>}
                          <p className="mt-1 text-xs text-zinc-500"><Sources item={student} /></p>
                        </div>
                        <span className={student.remainingAmount < 0 ? "font-semibold text-red-700" : "font-semibold text-amber-800"}>{student.remainingAmount < 0 ? "Инструктор должен школе " : "Школа должна инструктору "}{formatMoney(Math.abs(student.remainingAmount))}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {schoolOwes ? (
                  <form action={createDirectorReportPayoutPaymentAction} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <input type="hidden" name="instructor_id" value={item.id} />
                    <input type="hidden" name="return_path" value={financeReturnPath} />
                    <p className="text-sm font-semibold text-emerald-900">Передали деньги инструктору?</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-[140px_minmax(0,1fr)_auto] sm:items-end">
                      <label className="text-xs font-medium">Сумма<Input name="amount" type="number" min={1} max={item.remainingAmount} defaultValue={item.remainingAmount} required /></label>
                      <label className="text-xs font-medium">Комментарий<Input name="payment_note" maxLength={500} placeholder="Например: переводом" /></label>
                      <Button type="submit">Отметить выдачу</Button>
                    </div>
                  </form>
                ) : item.remainingAmount < 0 ? (
                  <InstructorDebtActions
                    returnAction={createDirectorInstructorReturnAction}
                    withholdAction={markDirectorInstructorDebtWithholdingAction}
                    instructorId={item.id}
                    debtAmount={debt}
                    returnedAt={new Date().toISOString().slice(0, 10)}
                    isWithholding={false}
                    selectedPeriod="all"
                    from=""
                    to=""
                    selectedInstructorId={item.id}
                    returnPath={financeReturnPath}
                  />
                ) : null}

                {item.payments.length > 0 && (
                  <div className="rounded-xl border bg-white p-3">
                    <p className="text-sm font-semibold">История выдач</p>
                    <div className="mt-2 divide-y text-sm">
                      {item.payments.map((payment) => (
                        <div key={payment.id} className="flex items-center justify-between gap-3 py-2">
                          <div><p>{formatMoney(payment.amount)}</p><p className="text-xs text-zinc-500">{formatDateTime(payment.paidAt, "Asia/Irkutsk")} · {payment.note || "Без комментария"}</p></div>
                          <CancelPayoutButton
                            action={cancelDirectorReportPayoutPaymentAction}
                            paymentId={payment.id}
                            returnPeriod="all"
                            returnFrom=""
                            returnTo=""
                            returnInstructor={item.id}
                            returnPath={financeReturnPath}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
