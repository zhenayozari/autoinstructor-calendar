import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CarFront,
  Contact,
  Medal,
  UsersRound,
} from "lucide-react";
import { getPublicInstructorBySlug } from "@/lib/public-instructors";
import { CapabilityBadges } from "@/components/instructors/capability-badges";
import { InstructorInfoCard } from "@/components/instructors/instructor-info-card";
import { InstructorPhoto } from "@/components/instructors/instructor-photo";
import { PublicCalendar } from "@/components/calendar/public-calendar";
import { PublicHeader } from "@/components/public/public-header";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ week?: string | string[] }>;
};

export async function generateMetadata({
  params,
}: Pick<PageProps, "params">): Promise<Metadata> {
  const { slug } = await params;
  const { instructor } = await getPublicInstructorBySlug(slug);

  if (!instructor) {
    return { title: "Инструктор не найден" };
  }

  return {
    title: `${instructor.public_name ?? "Инструктор"} | Расписание`,
    description:
      instructor.short_bio ?? "Публичный профиль и расписание инструктора",
  };
}

export default async function InstructorPage({
  params,
  searchParams,
}: PageProps) {
  const [{ slug }, queryParams] = await Promise.all([params, searchParams]);
  const { instructor, error } = await getPublicInstructorBySlug(slug);

  if (error || !instructor) {
    notFound();
  }

  const week = Array.isArray(queryParams.week)
    ? queryParams.week[0]
    : queryParams.week;
  const publicName = instructor.public_name ?? "Инструктор";
  const basePath = `/instructors/${instructor.slug}`;
  const hasDriving = instructor.capabilities.includes("driving");
  const hasTheory = instructor.capabilities.includes("theory");

  return (
    <main className="min-h-screen bg-[#f6f4ef] px-4 py-6 text-zinc-950 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-[1500px]">
        <PublicHeader />

        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Link
            href="/instructors"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 transition hover:text-zinc-950"
          >
            <ArrowLeft className="size-4" />
            Все инструкторы
          </Link>
          <Link
            href="/schedule"
            className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-600 transition hover:text-zinc-950"
          >
            <CalendarDays className="size-4" />
            Общее расписание
          </Link>
        </nav>

        <section className="relative mt-6 overflow-hidden rounded-[2.25rem] bg-zinc-950 text-white shadow-xl shadow-zinc-950/10">
          <div className="absolute -right-20 -top-28 size-80 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="absolute -bottom-36 left-1/3 size-80 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative grid lg:grid-cols-[minmax(320px,460px)_1fr]">
            <div className="p-4 sm:p-6 lg:p-8">
              <InstructorPhoto
                photoUrl={instructor.photo_url}
                name={publicName}
                className="aspect-[4/5] w-full rounded-[1.75rem] shadow-2xl shadow-black/20"
              />
            </div>
            <div className="flex flex-col justify-center px-6 pb-9 pt-2 sm:px-10 sm:pb-12 lg:px-12 lg:py-14">
              <CapabilityBadges capabilities={instructor.capabilities} />
              <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                {publicName}
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-7 text-zinc-300 sm:text-lg sm:leading-8">
                {instructor.short_bio ??
                  "Индивидуальные занятия в комфортном темпе и понятная подготовка к уверенной езде."}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#booking"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-300 px-6 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200"
                >
                  <CalendarDays className="size-4" />
                  Записаться
                </a>
                <Link
                  href="/instructors"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  <UsersRound className="size-4" />
                  Все инструкторы
                </Link>
              </div>
            </div>
          </div>
        </section>

        {(instructor.experience_text ||
          instructor.car_description ||
          instructor.contact_text) && (
          <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {instructor.experience_text && (
              <InstructorInfoCard
                icon={Medal}
                title="Опыт"
                iconClassName="bg-amber-100 text-amber-700"
              >
                {instructor.experience_text}
              </InstructorInfoCard>
            )}
            {instructor.car_description && (
              <InstructorInfoCard
                icon={CarFront}
                title="Автомобиль"
                iconClassName="bg-blue-100 text-blue-700"
              >
                {instructor.car_description}
              </InstructorInfoCard>
            )}
            {instructor.contact_text && (
              <InstructorInfoCard
                icon={Contact}
                title="Контакты"
                iconClassName="bg-emerald-100 text-emerald-700"
              >
                {instructor.contact_text}
              </InstructorInfoCard>
            )}
          </section>
        )}

        <section className="mt-6 rounded-[2rem] border border-black/5 bg-white p-6 shadow-sm sm:p-8">
          <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                О занятиях
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                Подготовка в понятном и комфортном формате
              </h2>
            </div>
            <div className="space-y-5 text-sm leading-7 text-zinc-600 sm:text-base">
              {instructor.short_bio && <p>{instructor.short_bio}</p>}
              {hasDriving && (
                <div className="flex gap-3">
                  <div className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
                    <CarFront className="size-4" />
                  </div>
                  <p>
                    Практические занятия помогают освоить управление
                    автомобилем, городские маршруты и уверенное принятие решений
                    за рулём.
                  </p>
                </div>
              )}
              {hasTheory && (
                <div className="flex gap-3">
                  <div className="mt-1 grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                    <BookOpen className="size-4" />
                  </div>
                  <p>
                    Индивидуальная теория позволяет спокойно разобрать ПДД,
                    экзаменационные вопросы и ситуации, которые вызывают
                    сложности.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="booking" className="scroll-mt-6 pt-12">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
              Онлайн-запись
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Выберите удобное время
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-500 sm:text-base">
              Свободные слоты доступны для записи.
            </p>
          </div>
          <PublicCalendar
            week={week}
            basePath={basePath}
            instructorId={instructor.id}
            showInstructorName={false}
          />
        </section>
      </div>
    </main>
  );
}
