import Link from "next/link";
import { SearchX, UsersRound } from "lucide-react";
import {
  getPublicInstructors,
  type InstructorCapability,
} from "@/lib/public-instructors";
import { DirectionCards } from "@/components/instructors/direction-cards";
import { DirectionFilter } from "@/components/instructors/direction-filter";
import { InstructorCard } from "@/components/instructors/instructor-card";
import { PublicHeader } from "@/components/public/public-header";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  direction?: string | string[];
}>;

export default async function InstructorsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawDirection = Array.isArray(params.direction)
    ? params.direction[0]
    : params.direction;
  const direction: "all" | InstructorCapability =
    rawDirection === "driving" || rawDirection === "theory"
      ? rawDirection
      : "all";
  const { instructors, error } = await getPublicInstructors(
    direction === "all" ? undefined : direction,
  );

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-6 text-zinc-950 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <PublicHeader />

        <header className="relative overflow-hidden rounded-[2.25rem] bg-zinc-950 px-6 py-8 text-white shadow-xl shadow-zinc-950/10 sm:px-10 sm:py-12">
          <div className="absolute -right-12 -top-28 size-72 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 size-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative">
            <div className="flex items-start gap-4">
              <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10">
                <UsersRound className="size-6 text-amber-300" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-300">
                  Практика и теория
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
                  Выберите инструктора
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400 sm:text-lg sm:leading-7">
                  Запишитесь на практику вождения или индивидуальную теорию.
                </p>
              </div>
            </div>

            <div className="mt-8">
              <DirectionCards />
            </div>
          </div>
        </header>

        <section className="mt-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Специалисты
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Найдите своего преподавателя
              </h2>
            </div>
            <DirectionFilter direction={direction} />
          </div>

          {error ? (
            <div className="mt-6 rounded-3xl bg-red-50 px-5 py-14 text-center text-sm text-red-700">
              Не удалось загрузить список инструкторов.
            </div>
          ) : instructors.length === 0 ? (
            <div className="mt-6 flex flex-col items-center rounded-3xl border border-dashed border-zinc-300 bg-white/70 px-5 py-16 text-center">
              <div className="grid size-14 place-items-center rounded-2xl bg-zinc-100 text-zinc-500">
                <SearchX className="size-7" />
              </div>
              <h3 className="mt-5 text-xl font-semibold">
                Пока нет специалистов этого направления
              </h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                Выберите другой фильтр или вернитесь позже — список будет
                пополняться.
              </p>
              <Link
                href="/instructors"
                className="mt-5 rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white"
              >
                Показать всех
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              {instructors.map((instructor) => (
                <InstructorCard
                  key={instructor.id}
                  instructor={instructor}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
