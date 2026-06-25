import { PublicCalendar } from "@/components/calendar/public-calendar";
import { PublicHeader } from "@/components/public/public-header";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  week?: string | string[];
}>;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const week = Array.isArray(params.week) ? params.week[0] : params.week;

  return (
    <main className="min-h-screen bg-[#f6f4ef] text-zinc-950">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <PublicHeader />

        <header className="overflow-hidden rounded-[2rem] bg-zinc-950 text-white shadow-xl shadow-zinc-950/10">
          <div className="relative px-6 py-8 sm:px-10 sm:py-10">
            <div className="absolute -right-16 -top-24 size-64 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="absolute -bottom-32 right-1/3 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="relative">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
                Онлайн-запись
              </p>
              <div className="mt-3 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
                <div>
                  <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                    Выберите удобное время для занятия
                  </h1>
                  <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
                    Актуальное расписание практических и теоретических занятий.
                  </p>
                </div>
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-300 backdrop-blur">
                  <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.12)]" />
                  Расписание обновляется онлайн
                </div>
              </div>
            </div>
          </div>
        </header>

        <PublicCalendar week={week} basePath="/schedule" className="mt-5" />

        <footer className="px-2 py-6 text-center text-xs text-zinc-400">
          Свободные слоты доступны для записи
        </footer>
      </div>
    </main>
  );
}
