import type { OrganizationRole, ScheduleDay } from "@/lib/types";

export const selectClassName =
  "border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

export function getRoleLabel(role: OrganizationRole | string) {
  if (role === "owner") return "Владелец";
  if (role === "admin") return "Администратор";
  if (role === "instructor") return "Инструктор";
  return role;
}

export function getLocalDate(timezone: string, offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseUtcDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

export function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatNumericDate(value: string) {
  const [year, month, day] = value.split("-");

  if (!year || !month || !day) {
    return value;
  }

  return `${day}.${month}.${year}`;
}

export function addUtcDays(date: Date, days: number) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function getUtcWeekStart(value: string) {
  const date = parseUtcDate(value);
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return date;
}

export function getUtcWeekDates(value: string) {
  const monday = getUtcWeekStart(value);

  return Array.from({ length: 7 }, (_, index) =>
    formatDateValue(addUtcDays(monday, index)),
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

export function formatFullDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

export function formatLongDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

export function formatDayTitle(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

export function formatShortDay(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseUtcDate(value));
}

export function formatTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatLocalDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function formatPrettyDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatUpdatedAt(value: string, timezone: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function formatMoney(value: number) {
  return `${value.toLocaleString("ru-RU")} ₽`;
}

export function formatHours(value: number) {
  return value.toLocaleString("ru-RU", {
    maximumFractionDigits: 1,
  });
}

export function getTransmissionLabel(
  transmission: ScheduleDay["transmission"],
) {
  if (transmission === "automatic") return "АКПП";
  if (transmission === "manual") return "МКПП";
  return "Теория";
}
