"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/formatters";

type ReturnFields = {
  selectedPeriod: string;
  from: string;
  to: string;
  selectedInstructorId: string;
};

function HiddenReturnFields({
  selectedPeriod,
  from,
  to,
  selectedInstructorId,
}: ReturnFields) {
  return (
    <>
      <input type="hidden" name="return_period" value={selectedPeriod} />
      <input type="hidden" name="return_from" value={from} />
      <input type="hidden" name="return_to" value={to} />
      <input type="hidden" name="return_instructor" value={selectedInstructorId} />
    </>
  );
}

function SubmitButton({ children }: { children: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? "Сохраняем…" : children}
    </Button>
  );
}

export function InstructorDebtActions({
  returnAction,
  withholdAction,
  instructorId,
  debtAmount,
  returnedAt,
  isWithholding,
  selectedPeriod,
  from,
  to,
  selectedInstructorId,
}: {
  returnAction: (formData: FormData) => void | Promise<void>;
  withholdAction: (formData: FormData) => void | Promise<void>;
  instructorId: string;
  debtAmount: number;
  returnedAt: string;
  isWithholding: boolean;
} & ReturnFields) {
  return (
    <div className="space-y-2 rounded-xl bg-white/70 p-3 text-sm text-red-900">
      {isWithholding && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Отмечено: удержать {formatMoney(debtAmount)} из следующих выплат.
        </p>
      )}

      <details>
        <summary className="cursor-pointer font-semibold">
          Инструктор вернул деньги
        </summary>
        <form
          action={returnAction}
          className="mt-3 grid gap-2 sm:grid-cols-[120px_150px_minmax(180px,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            if (!window.confirm("Отметить фактический возврат денег инструктором?")) {
              event.preventDefault();
            }
          }}
        >
          <HiddenReturnFields
            selectedPeriod={selectedPeriod}
            from={from}
            to={to}
            selectedInstructorId={selectedInstructorId}
          />
          <input type="hidden" name="instructor_id" value={instructorId} />
          <label className="space-y-1">
            <Label>Сумма</Label>
            <Input
              type="number"
              name="amount"
              min={1}
              max={debtAmount}
              defaultValue={debtAmount}
              required
            />
          </label>
          <label className="space-y-1">
            <Label>Дата возврата</Label>
            <Input type="date" name="returned_at" defaultValue={returnedAt} required />
          </label>
          <label className="space-y-1">
            <Label>Комментарий</Label>
            <Input
              name="return_note"
              maxLength={500}
              placeholder="Например: переводом"
            />
          </label>
          <SubmitButton>Отметить возврат</SubmitButton>
        </form>
      </details>

      <details>
        <summary className="cursor-pointer font-semibold">
          Удержать из следующих выплат
        </summary>
        <p className="mt-2 text-xs leading-5 text-zinc-600">
          Деньги сейчас не перемещаются. Долг автоматически уменьшит следующую
          сумму к выдаче инструктору. Кнопка фиксирует выбранный способ расчёта.
        </p>
        <form
          action={withholdAction}
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            if (!window.confirm("Удерживать этот долг из следующих начислений инструктору?")) {
              event.preventDefault();
            }
          }}
        >
          <HiddenReturnFields
            selectedPeriod={selectedPeriod}
            from={from}
            to={to}
            selectedInstructorId={selectedInstructorId}
          />
          <input type="hidden" name="instructor_id" value={instructorId} />
          <label className="min-w-0 flex-1 space-y-1">
            <Label>Комментарий</Label>
            <Input
              name="withhold_note"
              maxLength={500}
              placeholder="Например: зачесть при следующем занятии"
            />
          </label>
          <SubmitButton>
            {isWithholding ? "Обновить комментарий" : "Подтвердить удержание"}
          </SubmitButton>
        </form>
      </details>
    </div>
  );
}
