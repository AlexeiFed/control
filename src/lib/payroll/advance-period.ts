import { getDaysInMonth } from "../format/display-date";
import { DEFAULT_SHIFT_TIMEZONE, localDateKeyInTimeZone } from "../scheduling/local-date-key";

export type PayrollHalf = "first" | "second";

export const PAYROLL_HALVES = ["first", "second"] as const satisfies readonly PayrollHalf[];

export type PayrollMonthContext = {
  year: number;
  monthIndex0: number;
};

/** Первое число месяца в ISO (YYYY-MM-01). */
export function periodMonthIso(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
}

/** Начало календарного месяца в зоне Хабаровска (полуоткрытый интервал [start, end)). */
export function monthStartKhabarovsk(year: number, monthIndex0: number): Date {
  return new Date(`${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01T00:00:00+10:00`);
}

/** Конец календарного месяца в зоне Хабаровска — 00:00 первого числа следующего месяца (+10). */
export function monthEndKhabarovsk(year: number, monthIndex0: number): Date {
  const nextMonthIndex0 = monthIndex0 + 1;
  if (nextMonthIndex0 > 11) {
    return new Date(`${year + 1}-01-01T00:00:00+10:00`);
  }
  return new Date(`${year}-${String(nextMonthIndex0 + 1).padStart(2, "0")}-01T00:00:00+10:00`);
}

export function dayOfMonthInZone(isoOrDate: string | Date, timeZone = DEFAULT_SHIFT_TIMEZONE): number {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  const key = localDateKeyInTimeZone(date, timeZone);
  const day = Number(key.slice(8, 10));
  return Number.isFinite(day) ? day : 1;
}

/** Принадлежность по дате операционных суток `YYYY-MM-DD` (как колонка графика/табеля). */
export function dateIsoInPayrollMonth(dateIso: string, month: PayrollMonthContext): boolean {
  const expectedPrefix = periodMonthIso(month.year, month.monthIndex0).slice(0, 7);
  return dateIso.slice(0, 7) === expectedPrefix;
}

export function dateIsoBelongsToHalf(
  dateIso: string,
  half: PayrollHalf,
  month?: PayrollMonthContext,
): boolean {
  if (month && !dateIsoInPayrollMonth(dateIso, month)) return false;
  const day = Number(dateIso.slice(8, 10));
  if (!Number.isFinite(day)) return false;
  return half === "first" ? day >= 1 && day <= 15 : day >= 16;
}

export function shiftStartsInPayrollMonth(
  shiftStartsAt: string | Date,
  month: PayrollMonthContext,
  timeZone = DEFAULT_SHIFT_TIMEZONE,
): boolean {
  const key = localDateKeyInTimeZone(
    typeof shiftStartsAt === "string" ? new Date(shiftStartsAt) : shiftStartsAt,
    timeZone,
  );
  return dateIsoInPayrollMonth(key, month);
}

export function shiftBelongsToHalf(
  shiftStartsAt: string | Date,
  half: PayrollHalf,
  month?: PayrollMonthContext,
  timeZone = DEFAULT_SHIFT_TIMEZONE,
): boolean {
  const key = localDateKeyInTimeZone(
    typeof shiftStartsAt === "string" ? new Date(shiftStartsAt) : shiftStartsAt,
    timeZone,
  );
  return dateIsoBelongsToHalf(key, half, month);
}

export function halfPeriodLabelRu(half: PayrollHalf, year: number, monthIndex0: number): string {
  const lastDay = getDaysInMonth(year, monthIndex0);
  return half === "first" ? "с 1 по 15" : `с 16 по ${lastDay}`;
}

export function halfPeriodShortRu(half: PayrollHalf, year: number, monthIndex0: number): string {
  const lastDay = getDaysInMonth(year, monthIndex0);
  return half === "first" ? "1–15" : `16–${lastDay}`;
}

export function payrollTuPeriodFilenameSuffix(
  period: "first" | "second" | "month",
  year: number,
  monthIndex0: number,
): string {
  if (period === "month") return "";
  const lastDay = getDaysInMonth(year, monthIndex0);
  return period === "first" ? "_1-15" : `_16-${lastDay}`;
}

export function parsePeriodMonthIso(value: string): { year: number; monthIndex0: number } | null {
  const m = /^(\d{4})-(\d{2})-01$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, monthIndex0: month - 1 };
}
