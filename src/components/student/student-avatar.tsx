import { cn } from "@/lib/utils";

export function StudentAvatar({
  label,
  photoUrl,
  className,
}: {
  label: string;
  photoUrl?: string | null;
  className?: string;
}) {
  const initial = label.trim().slice(0, 1).toUpperCase() || "У";

  return (
    <span
      className={cn(
        "grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 text-sm font-semibold text-zinc-700 shadow-sm",
        className,
      )}
      aria-hidden="true"
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="size-full object-cover"
          draggable={false}
        />
      ) : (
        initial
      )}
    </span>
  );
}
