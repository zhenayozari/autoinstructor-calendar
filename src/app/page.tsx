import Link from "next/link";
import {
  ArrowDown,
  BookOpen,
  CarFront,
  SearchX,
} from "lucide-react";
import { SchedulePreview } from "@/components/calendar/schedule-preview";
import { InstructorCard } from "@/components/instructors/instructor-card";
import { PublicHeader } from "@/components/public/public-header";
import {
  getPublicInstructors,
  type InstructorCapability,
  type PublicInstructor,
} from "@/lib/public-instructors";

export const dynamic = "force-dynamic";

const directions: Array<{
  capability: InstructorCapability;
  title: string;
  description: string;
  href: string;
  icon: typeof CarFront;
  cardClassName: string;
  iconClassName: string;
}> = [
  {
    capability: "driving",
    title: "Вождение",
    description: "Практика в городе и уверенность за рулём.",
    href: "#driving",
    icon: CarFront,
    cardClassName:
      "border-amber-200 bg-amber-50 hover:border-amber-300 hover:bg-amber-100/70",
    iconClassName: "bg-amber-200 text-amber-800",
  },
  {
    capability: "theory",
    title: "Теория",
    description: "ПДД, сложные темы и экзаменационные вопросы.",
    href: "#theory",
    icon: BookOpen,
    cardClassName:
      "border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100/70",
    iconClassName: "bg-emerald-200 text-emerald-800",
  },
];

function DirectionSection({
  id,
  eyebrow,
  title,
  description,
  instructors,
  direction,
}: {
  id: string;
  eyebrow: string;
  title: string;
  description: string;
  instructors: PublicInstructor[];
  direction: InstructorCapability;
}) {
  return (
    <section id={id} className="scroll-mt-6 py-8 sm:py-12">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
            {eyebrow}
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-4xl">
            {title}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 sm:text-base">
            {description}
          </p>
        </div>
        <Link
          href={`/instructors?direction=${direction}`}
          className="w-fit text-sm font-semibold text-zinc-600 transition hover:text-zinc-950"
        >
          Смотреть весь каталог →
        </Link>
      </div>

      {instructors.length === 0 ? (
        <div className="mt-6 flex flex-col items-center rounded-[2rem] border border-dashed border-zinc-300 bg-white/70 px-5 py-14 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
            <SearchX className="size-7" />
          </div>
          <h3 className="mt-5 text-xl font-semibold">
            Специалисты скоро появятся
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
            В этом направлении пока нет доступных специалистов. Загляните
            немного позже.
          </p>
        </div>
      ) : (
        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {instructors.map((instructor) => (
            <InstructorCard
              key={instructor.id}
              instructor={instructor}
              direction={direction}
              showSeparateActions
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default async function Home() {
  const { instructors, error } = await getPublicInstructors();
  const drivingInstructors = instructors.filter((instructor) =>
    instructor.capabilities.includes("driving"),
  );
  const theoryInstructors = instructors.filter((instructor) =>
    instructor.capabilities.includes("theory"),
  );

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-zinc-950">
      <div className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
        <PublicHeader showDirectionLinks />

        <section className="relative overflow-hidden rounded-[2rem] bg-zinc-950 px-5 py-7 text-white shadow-xl shadow-zinc-950/10 sm:rounded-[2.5rem] sm:px-10 sm:py-12 lg:px-14">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="absolute -bottom-40 left-1/3 size-80 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
              Практика и индивидуальная теория
            </p>
            <h1 className="mt-3 max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Выберите направление занятий
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 sm:mt-5 sm:text-lg sm:leading-8">
              Выберите подходящее направление, чтобы найти инструктора и
              записаться на занятие.
            </p>

            <div className="mt-5 grid gap-2.5 sm:mt-8 sm:gap-4 md:grid-cols-2">
              {directions.map((direction) => {
                const Icon = direction.icon;

                return (
                  <a
                    key={direction.capability}
                    href={direction.href}
                    className={`group rounded-2xl border p-3.5 text-zinc-950 transition sm:rounded-[1.75rem] sm:p-6 ${direction.cardClassName}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div
                        className={`grid size-9 place-items-center rounded-xl sm:size-12 sm:rounded-2xl ${direction.iconClassName}`}
                      >
                        <Icon className="size-4.5 sm:size-6" />
                      </div>
                      <ArrowDown className="size-4 text-zinc-500 transition group-hover:translate-y-1 sm:size-5" />
                    </div>
                    <h2 className="mt-3 text-lg font-semibold tracking-tight sm:mt-5 sm:text-2xl">
                      {direction.title}
                    </h2>
                    <p className="mt-1 max-w-md text-xs leading-5 text-zinc-600 sm:mt-2 sm:text-sm sm:leading-6">
                      {direction.description}
                    </p>
                  </a>
                );
              })}
            </div>

          </div>
        </section>

        {error ? (
          <div className="mt-8 rounded-[2rem] bg-red-50 px-5 py-14 text-center text-sm text-red-700">
            Не удалось загрузить список специалистов.
          </div>
        ) : (
          <>
            <DirectionSection
              id="driving"
              eyebrow="Практические занятия"
              title="Инструкторы по вождению"
              description="Выберите специалиста, познакомьтесь с профилем и посмотрите его свободное время."
              instructors={drivingInstructors}
              direction="driving"
            />
            <DirectionSection
              id="theory"
              eyebrow="Индивидуальные занятия"
              title="Преподаватели теории"
              description="Разберите правила, экзаменационные вопросы и сложные дорожные ситуации один на один."
              instructors={theoryInstructors}
              direction="theory"
            />
          </>
        )}

        <SchedulePreview />

        <footer className="border-t border-zinc-200 py-6 text-center text-xs text-zinc-400">
          Онлайн-запись на практику вождения и индивидуальную теорию
        </footer>
      </div>
    </main>
  );
}
