"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import {
  updateStudentAvatarAction,
  type StudentAvatarActionState,
} from "@/app/student/actions";

const INITIAL_STATE: StudentAvatarActionState = {
  status: "idle",
  message: "",
};

export function StudentAvatarUploadForm({
  displayLabel,
  photoUrl,
}: {
  displayLabel: string;
  photoUrl: string | null;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    updateStudentAvatarAction,
    INITIAL_STATE,
  );
  const initial = displayLabel.trim().slice(0, 1).toUpperCase() || "У";

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <div className="flex w-24 flex-col items-center gap-2">
      <form ref={formRef} action={formAction}>
        <div className="relative size-20">
          <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-white/20 bg-white/10 text-xl font-semibold text-white shadow-sm">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt=""
                className="size-full object-cover"
                draggable={false}
              />
            ) : (
              <span>{initial}</span>
            )}
          </div>

          <label
            className="absolute -bottom-1 -right-1 grid size-8 cursor-pointer place-items-center rounded-full border-2 border-zinc-950 bg-white text-zinc-950 shadow-md transition hover:scale-105 hover:bg-amber-100"
            title="Обновить фото"
          >
            <span className="sr-only">Обновить фото</span>
            {isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-5" />
            )}
            <input
              name="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={isPending}
              onChange={() => formRef.current?.requestSubmit()}
            />
          </label>
        </div>
        {state.message && (
          <p
            className={`mt-2 rounded-full px-3 py-1.5 text-center text-xs ${
              state.status === "success"
                ? "bg-emerald-400/15 text-emerald-100"
                : "bg-red-400/15 text-red-100"
            }`}
          >
            {state.message}
          </p>
        )}
      </form>
    </div>
  );
}
