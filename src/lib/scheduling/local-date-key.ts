import { resolveIntlTimeZone } from "./intl-timezone";

/** Совпадает с дефолтом `calculateShiftHours` — локальные сутки смены. */
export const DEFAULT_SHIFT_TIMEZONE = "Asia/Khabarovsk";

/** Календарная дата `YYYY-MM-DD` в заданном часовом поясе (без обращения к БД). */
export function localDateKeyInTimeZone(date: Date, timeZone: string = DEFAULT_SHIFT_TIMEZONE): string {
  const tz = resolveIntlTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const y = parts.find((p) => p.type === "year")?.value ?? "0000";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
