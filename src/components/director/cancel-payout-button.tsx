"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

function CancelPayoutSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant="outline"
      size="sm"
      disabled={pending}
      className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
    >
      {pending ? "Отменяем…" : "Отменить"}
    </Button>
  );
}

export function CancelPayoutButton({
  action,
  paymentId,
  returnPeriod,
  returnFrom,
  returnTo,
  returnInstructor,
}: {
  action: (formData: FormData) => void | Promise<void>;
  paymentId: string;
  returnPeriod: string;
  returnFrom: string;
  returnTo: string;
  returnInstructor: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm("Отменить эту выплату? Сумма снова вернётся в остаток к выдаче.")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="payment_id" value={paymentId} />
      <input type="hidden" name="return_period" value={returnPeriod} />
      <input type="hidden" name="return_from" value={returnFrom} />
      <input type="hidden" name="return_to" value={returnTo} />
      <input type="hidden" name="return_instructor" value={returnInstructor} />
      <CancelPayoutSubmitButton />
    </form>
  );
}
