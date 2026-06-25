import Link from "next/link";
import { CarFront, LogIn } from "lucide-react";

export function PublicHeader({
  showDirectionLinks = false,
}: {
  showDirectionLinks?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 py-4 sm:py-6">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg"
      >
        <span className="grid size-8 place-items-center rounded-xl bg-zinc-950 text-amber-300 sm:size-9">
          <CarFront className="size-4 sm:size-5" />
        </span>
        Автоинструктор
      </Link>

      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 sm:order-3 sm:px-4 sm:text-sm"
      >
        <LogIn className="size-3.5 sm:size-4" />
        Вход для инструктора
      </Link>

      <nav className="order-3 flex w-full items-center gap-4 overflow-x-auto border-t border-zinc-200/80 pt-3 text-sm font-semibold text-zinc-600 sm:order-2 sm:w-auto sm:border-0 sm:pt-0">
        <Link href="/" className="shrink-0 transition hover:text-zinc-950">
          Главная
        </Link>
        {showDirectionLinks ? (
          <>
            <a
              href="#driving"
              className="shrink-0 transition hover:text-zinc-950"
            >
              Вождение
            </a>
            <a
              href="#theory"
              className="shrink-0 transition hover:text-zinc-950"
            >
              Теория
            </a>
          </>
        ) : (
          <>
            <Link
              href="/instructors"
              className="shrink-0 transition hover:text-zinc-950"
            >
              Инструкторы
            </Link>
            <Link
              href="/schedule"
              className="shrink-0 transition hover:text-zinc-950"
            >
              Расписание
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
