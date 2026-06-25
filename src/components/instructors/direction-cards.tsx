import Link from "next/link";
import { ArrowRight, BookOpen, CarFront } from "lucide-react";
import type { InstructorCapability } from "@/lib/public-instructors";

const directions: Array<{
  capability: InstructorCapability;
  title: string;
  description: string;
  icon: typeof CarFront;
  accent: string;
  iconStyle: string;
}> = [
  {
    capability: "driving",
    title: "Вождение",
    description:
      "Практические занятия в городе: от первых навыков до уверенной езды.",
    icon: CarFront,
    accent: "hover:border-amber-300 hover:bg-amber-50/80",
    iconStyle: "bg-amber-100 text-amber-700",
  },
  {
    capability: "theory",
    title: "Теория",
    description:
      "Индивидуальный разбор ПДД, сложных тем и экзаменационных вопросов.",
    icon: BookOpen,
    accent: "hover:border-emerald-300 hover:bg-emerald-50/80",
    iconStyle: "bg-emerald-100 text-emerald-700",
  },
];

export function DirectionCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {directions.map((direction) => {
        const Icon = direction.icon;

        return (
          <Link
            key={direction.capability}
            href={`/instructors?direction=${direction.capability}`}
            className={`group rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur transition sm:rounded-3xl sm:p-5 ${direction.accent}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div
                className={`grid size-10 shrink-0 place-items-center rounded-xl sm:size-12 sm:rounded-2xl ${direction.iconStyle}`}
              >
                <Icon className="size-5 sm:size-6" />
              </div>
              <ArrowRight className="size-5 text-zinc-500 transition group-hover:translate-x-1 group-hover:text-zinc-950" />
            </div>
            <h2 className="mt-3 text-lg font-semibold tracking-tight text-white group-hover:text-zinc-950 sm:mt-5 sm:text-xl">
              {direction.title}
            </h2>
            <p className="mt-1.5 max-w-md text-xs leading-5 text-zinc-400 group-hover:text-zinc-600 sm:mt-2 sm:text-sm sm:leading-6">
              {direction.description}
            </p>
          </Link>
        );
      })}
    </div>
  );
}
