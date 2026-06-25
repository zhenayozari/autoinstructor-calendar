import Link from "next/link";
import type { InstructorCapability } from "@/lib/public-instructors";

const filters: Array<{
  value: "all" | InstructorCapability;
  label: string;
}> = [
  { value: "all", label: "Все" },
  { value: "driving", label: "Вождение" },
  { value: "theory", label: "Теория" },
];

export function DirectionFilter({
  direction,
}: {
  direction: "all" | InstructorCapability;
}) {
  return (
    <nav
      aria-label="Фильтр направления"
      className="flex flex-wrap items-center gap-2"
    >
      {filters.map((filter) => {
        const isActive = filter.value === direction;
        const href =
          filter.value === "all"
            ? "/instructors"
            : `/instructors?direction=${filter.value}`;

        return (
          <Link
            key={filter.value}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              isActive
                ? "bg-zinc-950 text-white shadow-sm"
                : "border border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            {filter.label}
          </Link>
        );
      })}
    </nav>
  );
}
