"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import {
  bookSlotAction,
  type BookingActionState,
} from "@/app/actions/bookings";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL_STATE: BookingActionState = {
  status: "idle",
  message: "",
};

export function BookingDialog({
  slotId,
  lessonName,
  dateLabel,
  timeLabel,
  color,
  children,
}: {
  slotId: string;
  lessonName: string;
  dateLabel: string;
  timeLabel: string;
  color: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    bookSlotAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <Dialog open={open && state.status !== "success"} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="w-full rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 focus-visible:ring-offset-2"
          />
        }
      >
        {children}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div
            className="mb-2 grid size-11 place-items-center rounded-xl text-white"
            style={{ backgroundColor: color }}
          >
            <CalendarCheck className="size-5" />
          </div>
          <DialogTitle className="text-xl">Запись на занятие</DialogTitle>
          <DialogDescription>
            {lessonName} · {dateLabel} · {timeLabel}
          </DialogDescription>
        </DialogHeader>

        <form action={formAction} className="space-y-4">
          <input type="hidden" name="slot_id" value={slotId} />

          <div className="space-y-2">
            <Label htmlFor={`student-label-${slotId}`}>
              Имя / обозначение ученика
            </Label>
            <Input
              id={`student-label-${slotId}`}
              name="student_label"
              placeholder="Например, Анна"
              minLength={1}
              maxLength={80}
              autoComplete="name"
              autoFocus
              required
            />
            <p className="text-muted-foreground text-xs">
              Эти данные увидит только инструктор.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`access-code-${slotId}`}>Кодовое слово</Label>
            <Input
              id={`access-code-${slotId}`}
              name="access_code"
              type="password"
              maxLength={100}
              autoComplete="off"
              placeholder="Код от инструктора"
            />
          </div>

          {state.status === "error" && (
            <div className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
              {state.message}
            </div>
          )}

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" />}>
              Отмена
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Записываем…" : "Записаться"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
