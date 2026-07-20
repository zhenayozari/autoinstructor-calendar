"use client";

import { useActionState, useState } from "react";
import { Send, Star } from "lucide-react";
import {
  submitLessonReviewAction,
  type LessonReviewActionState,
} from "@/app/student/review-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const INITIAL_STATE: LessonReviewActionState = {
  status: "idle",
  message: "",
};

export function LessonReviewForm({
  bookingId,
}: {
  bookingId: string;
}) {
  const [rating, setRating] = useState(5);
  const [state, formAction, isPending] = useActionState(
    submitLessonReviewAction,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="mt-4 rounded-2xl border bg-zinc-50 p-4">
      <input type="hidden" name="booking_id" value={bookingId} />
      <input type="hidden" name="rating" value={rating} />

      <p className="text-sm font-semibold text-zinc-950">Оцените занятие</p>
      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            className={cn(
              "grid size-10 place-items-center rounded-full border bg-white transition",
              value <= rating
                ? "border-amber-300 text-amber-500"
                : "text-zinc-300",
            )}
            onClick={() => setRating(value)}
            aria-label={`Поставить ${value} из 5`}
          >
            <Star
              className={cn("size-5", value <= rating && "fill-current")}
            />
          </button>
        ))}
      </div>

      <label className="mt-4 block text-sm font-medium text-zinc-700">
        Комментарий
        <Textarea
          name="comment"
          className="mt-2 bg-white"
          placeholder="Можно коротко написать, что было полезно или что хочется разобрать дальше"
          maxLength={1000}
        />
      </label>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Пожалуйста, не указывайте личные данные в отзыве.
      </p>

      {state.message && (
        <div
          className={cn(
            "mt-3 rounded-xl px-3 py-2 text-sm",
            state.status === "success"
              ? "bg-emerald-50 text-emerald-700"
              : "bg-red-50 text-red-700",
          )}
        >
          {state.message}
        </div>
      )}

      <Button type="submit" className="mt-4 w-full" disabled={isPending}>
        <Send />
        {isPending ? "Отправляем..." : "Отправить отзыв"}
      </Button>
    </form>
  );
}
