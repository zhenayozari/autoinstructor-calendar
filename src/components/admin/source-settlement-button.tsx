"use client";

import { useActionState } from "react";
import {
  settleSourcePaymentsAction,
  type SourceSettlementActionState,
} from "@/app/admin/actions";
import { formatMoney, formatNumericDate } from "@/lib/formatters";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: SourceSettlementActionState = {
  status: "idle",
  message: "",
  updatedCount: 0,
};

type SourceSettlementButtonProps = {
  instructorId: string;
  schoolId: string;
  sourceLabel: string;
  from: string;
  to: string;
  expectedCount: number;
  expectedAmount: number;
};

export function SourceSettlementButton({
  instructorId,
  schoolId,
  sourceLabel,
  from,
  to,
  expectedCount,
  expectedAmount,
}: SourceSettlementButtonProps) {
  const [state, formAction, isPending] = useActionState(
    settleSourcePaymentsAction,
    INITIAL_STATE,
  );

  return (
    <form
      action={formAction}
      className="space-y-2"
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Закрыть расчёт с «${sourceLabel}» за период ${formatNumericDate(from)} — ${formatNumericDate(to)}?\n\nБудет отмечено ${expectedCount} занятий на сумму ${formatMoney(expectedAmount)}.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="instructor_id" value={instructorId} />
      <input type="hidden" name="school_id" value={schoolId} />
      <input type="hidden" name="source_label" value={sourceLabel} />
      <input type="hidden" name="from" value={from} />
      <input type="hidden" name="to" value={to} />
      <input type="hidden" name="expected_count" value={expectedCount} />
      <input type="hidden" name="expected_amount" value={expectedAmount} />
      <Button
        type="submit"
        size="sm"
        className="h-8 w-full whitespace-nowrap text-xs"
        disabled={isPending}
      >
        {isPending
          ? "Закрываем..."
          : `Закрыть ${formatMoney(expectedAmount)}`}
      </Button>
      {state.message && (
        <p
          className={`rounded-lg px-2 py-1.5 text-xs ${
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
