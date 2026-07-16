import Link from "next/link";
import { CarFront, LogIn, Menu, UserRound } from "lucide-react";

export function PublicHeader({
  showDirectionLinks = false,
  theme = "light",
  logoUrl,
  logoAlt = "Автоинструктор",
}: {
  showDirectionLinks?: boolean;
  theme?: "light" | "dark";
  logoUrl?: string;
  logoAlt?: string;
}) {
  const isDark = theme === "dark";
  const linkClassName = isDark
    ? "shrink-0 transition hover:text-white text-zinc-300"
    : "shrink-0 transition hover:text-zinc-950";

  return (
    <header
      className={`flex flex-col gap-3 py-4 sm:py-6 ${
        isDark ? "text-white" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-base font-semibold tracking-tight sm:text-lg">
          <Link href="/" className="inline-flex items-center gap-2">
            <span
              className={`grid size-8 place-items-center rounded-xl sm:size-9 ${
                isDark
                  ? "bg-lime-300 text-zinc-950"
                  : "bg-zinc-950 text-amber-300"
              }`}
            >
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={logoUrl}
                  alt={logoAlt}
                  className="size-full rounded-xl object-cover"
                />
              ) : (
                <CarFront className="size-4 sm:size-5" />
              )}
            </span>
            Автоинструктор
          </Link>
        </div>

        <details className="group relative">
          <summary
            className={`inline-flex cursor-pointer list-none items-center justify-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold shadow-sm transition ${
              isDark
                ? "border-white/15 bg-white/8 text-white hover:bg-white/14"
                : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50"
            }`}
          >
            <Menu className="size-4" />
            Войти
          </summary>
          <div className="absolute right-0 top-12 z-50 w-64 rounded-2xl border bg-white p-2 shadow-2xl shadow-zinc-950/15">
            <Link
              href="/student/login"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
            >
              <UserRound className="size-4" />
              Войти как ученик
            </Link>
            <Link
              href="/login"
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-100"
            >
              <LogIn className="size-4" />
              Войти как инструктор
            </Link>
          </div>
        </details>
      </div>

      <nav
        className={`flex w-full items-center gap-4 overflow-x-auto border-t pt-3 text-sm font-semibold sm:border-0 sm:pt-0 ${
          isDark ? "border-white/10 text-zinc-300" : "border-zinc-200/80 text-zinc-600"
        }`}
      >
        <Link href="/" className={linkClassName}>
          Главная
        </Link>
        {showDirectionLinks ? (
          <>
            <a href="#about" className={linkClassName}>
              О занятиях
            </a>
            <a href="#contacts" className={linkClassName}>
              Контакты
            </a>
          </>
        ) : (
          <Link href="/instructors" className={linkClassName}>
            Инструкторы
          </Link>
        )}
      </nav>
    </header>
  );
}
