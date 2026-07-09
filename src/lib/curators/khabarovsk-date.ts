import { toDateIsoKhabarovsk } from "../format/display-date";

/** Хабаровское время (UTC+10). */
export const CURATORS_OFFICE_TIMEZONE = "Asia/Khabarovsk";

/** Дата YYYY-MM-DD в календаре офиса (Хабаровск). */
export function todayIsoInKhabarovsk(now = new Date()): string {
  return toDateIsoKhabarovsk(now);
}

/** Первый день месяца для даты YYYY-MM-DD и следующий месяц (верхняя граница полуинтервала). */
export function monthBoundsFromIsoDate(isoDate: string): { start: string; endExclusive: string } {
  const [y, m] = isoDate.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error("Invalid iso date");
  }
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const endExclusive = `${String(nextY).padStart(4, "0")}-${String(nextM).padStart(2, "0")}-01`;
  return { start, endExclusive };
}
