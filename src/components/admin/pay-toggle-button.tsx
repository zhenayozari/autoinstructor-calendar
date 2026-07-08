"use client";

import { useActionState } from "react";
import {
  updateBookingPaymentAction,
  type BookingPaymentActionState,
} from "@/app/admin/actions";
import { formatMoney } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_PAYMENT_STATE: BookingPaymentActionState = {
  status: "idle",
  message: "",
};

type BookingPaymentFormProps = {
  bookingId: string;
  priceAmount?: number | null;
  paidAmount?: number | null;
  paymentNote?: string | null;
  isPaid: boolean;
  disabled?: boolean;
};

export function BookingPaymentForm({
  bookingId,
  priceAmount,
  paidAmount,
  paymentNote,
  isPaid,
  disabled = false,
}: BookingPaymentFormProps) {
  const [state, formAction, isPending] = useActionState(
    updateBookingPaymentAction,
    INITIAL_PAYMENT_STATE,
  );
  const normalizedPrice = priceAmount ?? null;
  const normalizedPaid = paidAmount ?? (isPaid ? (priceAmount ?? 0) : 0);
  const debt =
    normalizedPrice === null ? null : Math.max(normalizedPrice - normalizedPaid, 0);
  const isFullyPaid = normalizedPrice !== null && normalizedPaid >= normalizedPrice;

  return (
    <form action={formAction} className="space-y-3 rounded-xl border bg-white p-3">
      <input type="hidden" name="booking_id" value={bookingId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`payment-price-${bookingId}`}>К оплате, ₽</Label>
          <Input
            id={`payment-price-${bookingId}`}
            name="price_amount"
            type="number"
            min={0}
            max={10000000}
            step={1}
            defaultValue={normalizedPrice ?? ""}
            placeholder="Например: 1500"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`payment-paid-${bookingId}`}>Получено, ₽</Label>
          <Input
            id={`payment-paid-${bookingId}`}
            name="paid_amount"
            type="number"
            min={0}
            max={10000000}
            step={1}
            defaultValue={normalizedPaid}
            placeholder="Например: 1000"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`payment-note-${bookingId}`}>Комментарий</Label>
        <Input
          id={`payment-note-${bookingId}`}
          name="payment_note"
          defaultValue={paymentNote ?? ""}
          maxLength={500}
          placeholder="Например: частично, переводом, скидка"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs font-medium text-zinc-500">
          <p>
            {debt === null
              ? "Сумма к оплате не задана"
              : debt > 0
                ? `Долг: ${formatMoney(debt)}`
                : `Долга нет`}
          </p>
          {isFullyPaid && (
            <p className="mt-0.5 text-emerald-700">Оплата закрыта автоматически</p>
          )}
        </div>
        <Button type="submit" size="sm" disabled={disabled || isPending}>
          {isPending ? "Сохраняем..." : "Сохранить оплату"}
        </Button>
      </div>

      {state.message && (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-xs",
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
