import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  ExternalLink,
  Home,
  KeyRound,
  LogOut,
  Menu,
  Settings,
  UserRoundPen,
  UsersRound,
} from "lucide-react";
import { logoutAction } from "@/app/login/actions";

function getRoleLabel(role: string) {
  if (role === "owner") return "Владелец";
  if (role === "admin") return "Администратор";
  if (role === "instructor") return "Инструктор";
  return role;
}

export function AdminMobileNav({
  role,
  email,
  instructorName,
  showTeam,
}: {
  role: string;
  email?: string | null;
  instructorName?: string | null;
  showTeam: boolean;
}) {
  return (
    <>
      <div className="sticky top-2 z-40 mb-3 rounded-2xl border bg-white/95 shadow-lg shadow-zinc-950/10 backdrop-blur sm:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="min-w-0">
            <p className="text-lg font-bold leading-5 text-zinc-950">Кабинет</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">
              {instructorName || getRoleLabel(role)}
            </p>
          </Link>
          <details className="group relative">
            <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-full border bg-white">
              <Menu className="size-5" />
            </summary>
            <div className="absolute right-0 mt-2 w-[min(82vw,320px)] rounded-2xl border bg-white p-2 shadow-2xl">
              <div className="border-b px-3 py-2">
                <p className="text-sm font-semibold">{getRoleLabel(role)}</p>
                {email && (
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">
                    {email}
                  </p>
                )}
              </div>
              <div className="grid gap-1 py-2 text-sm font-semibold">
                <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/admin">
                  <Home className="size-4" />
                  Главная
                </Link>
                <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/schedule">
                  <ExternalLink className="size-4" />
                  Как видит ученик
                </Link>
                <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/admin/schedule">
                  <CalendarDays className="size-4" />
                  Расписание
                </Link>
                <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/admin/bookings">
                  <ClipboardList className="size-4" />
                  Записи
                </Link>
                <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/admin/settings">
                  <Settings className="size-4" />
                  Настройки
                </Link>
                <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/admin/profile">
                  <UserRoundPen className="size-4" />
                  Профиль
                </Link>
                {showTeam && (
                  <Link className="flex items-center gap-2 rounded-xl px-3 py-2 hover:bg-zinc-50" href="/admin/team">
                    <UsersRound className="size-4" />
                    Команда
                  </Link>
                )}
                <form action={logoutAction}>
                  <button className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-zinc-50" type="submit">
                    <LogOut className="size-4" />
                    Выйти
                  </button>
                </form>
              </div>
            </div>
          </details>
        </div>
      </div>

      <nav
        aria-label="Быстрые действия"
        className="fixed inset-x-3 bottom-3 z-40 grid grid-cols-4 gap-1 rounded-2xl border bg-white/95 p-1.5 shadow-2xl shadow-zinc-950/15 backdrop-blur sm:hidden"
      >
        <Link
          href="/admin/schedule?create=slot#schedule-quick-actions"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <CalendarPlus className="size-4" />
          <span>Слот</span>
        </Link>
        <Link
          href="/admin/schedule"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <CalendarDays className="size-4" />
          <span>Расписание</span>
        </Link>
        <Link
          href="/admin/bookings"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <ClipboardList className="size-4" />
          <span>Записи</span>
        </Link>
        <Link
          href="/admin/settings"
          className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold text-zinc-700 active:bg-zinc-100"
        >
          <KeyRound className="size-4" />
          <span>Код</span>
        </Link>
      </nav>
    </>
  );
}
