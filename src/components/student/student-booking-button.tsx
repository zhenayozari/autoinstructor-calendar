"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import {
  studentBookSlotAction,
  type StudentBookingActionState,
} from "@/app/student/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const INITIAL_STATE: StudentBookingActionState = {
  status: "idle",
  message: "",
};

export function StudentBookingButton({
  slotId,
  lessonName,
  dateLabel,
  timeLabel,
}: {
  slotId: string;
  lessonName: string;
  dateLabel: string;
  timeLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    studentBookSlotAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      const timeout = window.setTimeout(() => setOpen(false), 900);
      return () => window.clearTimeout(timeout);
    }
  }, [router, state.status]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" className="w-full sm:w-auto" />}>
        <CalendarCheck />
        Записаться
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Записаться на занятие?</DialogTitle>
          <DialogDescription>
            {lessonName} · {dateLabel} · {timeLabel}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="slot_id" value={slotId} />

          <div className="rounded-2xl bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-600">
            После записи слот станет занятым. Если планы изменятся, свяжитесь с
            инструктором.
          </div>

          {state.message && (
            <div
              className={`rounded-xl px-3 py-2 text-sm ${
                state.status === "success"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {state.message}
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={isPending || state.status === "success"}>
              {isPending ? "Записываем…" : "Да, записаться"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
