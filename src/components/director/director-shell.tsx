"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  FileClock,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  UserRoundCheck,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { PushSubscriptionControl } from "@/components/pwa/push-subscription-control";
import type { NotificationPreference } from "@/lib/notification-events";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DirectorShellProps = {
  children: React.ReactNode;
  email?: string | null;
  organizationName?: string | null;
  pushPublicKey?: string;
  pushPreferences?: NotificationPreference[];
};

const bottomLinks = [
  { href: "/director", label: "Обзор", icon: LayoutDashboard },
  { href: "/director/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/director/reports", label: "Итоги", icon: BarChart3 },
  { href: "/admin", label: "Инструктор", icon: UserRoundCheck },
] as const;

const drawerLinks = [
  { href: "/director", label: "Обзор", icon: LayoutDashboard },
  { href: "/director/schedule", label: "Расписание", icon: CalendarDays },
  { href: "/director/staff", label: "Сотрудники", icon: UsersRound },
  { href: "/director/students", label: "Ученики", icon: UserRoundCheck },
  { href: "/director/reports", label: "Итоги", icon: BarChart3 },
  { href: "/director/site", label: "Сайт", icon: Globe2 },
  { href: "/director/audit", label: "Журнал действий", icon: FileClock },
  { href: "/director/settings", label: "Настройки школы", icon: Settings },
  { href: "/admin", label: "Кабинет инструктора", icon: UserRoundCheck },
] as const;

function isActivePath(pathname: string, href: string) {
  if (href === "/director") {
    return pathname === href;
  }

  if (href === "/admin") {
    return pathname.startsWith("/admin");
  }

  return pathname.startsWith(href);
}

export function DirectorShell({
  children,
  email,
  organizationName,
  pushPublicKey,
  pushPreferences,
}: DirectorShellProps) {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-zinc-100">
      <div className="app-safe-top sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-zinc-950 sm:text-lg">
              {organizationName || "Кабинет руководителя"}
            </p>
            <p className="text-muted-foreground truncate text-xs sm:text-sm">
              Руководитель{email ? ` · ${email}` : ""}
            </p>
          </div>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setIsMenuOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu className="size-4" />
          </Button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            onClick={() => setIsMenuOpen(false)}
            aria-label="Закрыть меню"
          />
          <div className="app-safe-bottom app-safe-top absolute inset-y-0 right-0 flex w-[min(86vw,380px)] flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b px-4 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-zinc-950">
                  {organizationName || "Автошкола"}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Кабинет руководителя
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setIsMenuOpen(false)}
                aria-label="Закрыть меню"
              >
                <X className="size-4" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              <div className="space-y-1">
                {drawerLinks.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                      isActivePath(pathname, href)
                        ? "bg-zinc-900 text-white"
                        : "text-zinc-700 hover:bg-zinc-100",
                    )}
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Icon className="size-4" />
                    {label}
                  </Link>
                ))}
              </div>

              <div className="mt-4">
                <PushSubscriptionControl
                  publicKey={pushPublicKey}
                  preferences={pushPreferences}
                />
              </div>
            </div>

            <div className="border-t p-4">
              <form action={logoutAction}>
                <Button type="submit" variant="outline" className="h-11 w-full">
                  <LogOut />
                  Выйти
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      <div className="app-main-with-bottom-nav">{children}</div>

      <nav className="app-bottom-nav fixed inset-x-3 z-40 mx-auto grid max-w-2xl grid-cols-4 gap-1 rounded-2xl border bg-white/95 p-1.5 shadow-2xl shadow-zinc-950/15 backdrop-blur">
        {bottomLinks.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[11px] font-semibold transition-colors",
              isActivePath(pathname, href)
                ? "bg-zinc-900 text-white"
                : "text-zinc-700 active:bg-zinc-100",
            )}
          >
            <Icon className="size-4" />
            <span>{label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
