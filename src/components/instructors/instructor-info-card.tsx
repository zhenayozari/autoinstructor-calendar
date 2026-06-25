import type { LucideIcon } from "lucide-react";

export function InstructorInfoCard({
  icon: Icon,
  title,
  children,
  iconClassName,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  iconClassName: string;
}) {
  return (
    <article className="rounded-3xl border border-black/5 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-2xl ${iconClassName}`}
        >
          <Icon className="size-5" />
        </div>
        <h2 className="font-semibold tracking-tight text-zinc-950">{title}</h2>
      </div>
      <div className="mt-4 whitespace-pre-line text-sm leading-6 text-zinc-600">
        {children}
      </div>
    </article>
  );
}
