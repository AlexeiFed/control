import { getKhabarovskComponents } from "../format/display-date";

/** Первый день текущего календарного месяца в Хабаровске: `YYYY-MM-01`. */
export function currentMonthStartIsoKhabarovsk(now: Date = new Date()): string {
  const kh = getKhabarovskComponents(now);
  return `${kh.year}-${String(kh.month0 + 1).padStart(2, "0")}-01`;
}

/** Инциденты прошлых месяцев в баннер не показываем (с текущего месяца — да). */
export function isShiftDateInCurrentOrFutureMonth(
  shiftDateKey: string,
  now: Date = new Date(),
): boolean {
  return shiftDateKey >= currentMonthStartIsoKhabarovsk(now);
}
