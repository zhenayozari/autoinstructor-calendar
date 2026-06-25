import { UserRound } from "lucide-react";

export function InstructorPhoto({
  photoUrl,
  name,
  className,
}: {
  photoUrl: string | null;
  name: string;
  className?: string;
}) {
  if (photoUrl) {
    return (
      <div
        role="img"
        aria-label={`Фотография: ${name}`}
        className={`bg-zinc-200 bg-cover bg-center ${className ?? ""}`}
        style={{ backgroundImage: `url(${JSON.stringify(photoUrl)})` }}
      />
    );
  }

  return (
    <div
      className={`grid place-items-center bg-zinc-200 text-zinc-500 ${className ?? ""}`}
      aria-label={`Фотография ${name} пока не добавлена`}
    >
      <UserRound className="size-16" strokeWidth={1.4} />
    </div>
  );
}
