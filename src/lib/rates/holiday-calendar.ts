import { listHolidaysInRange } from "../operations/holidays-repository";
import { toDateIsoKhabarovsk } from "../format/display-date";
export { DEFAULT_SHIFT_TIMEZONE, localDateKeyInTimeZone } from "../scheduling/local-date-key";

/** Календарная дата в часовом поясе Хабаровска (UTC+10). */
export function toLocalCivilDateKey(d: Date): string {
  return toDateIsoKhabarovsk(d);
}

export function holidayDateSetFromRecords(
  rows: ReadonlyArray<{ holidayDate: string }>,
): ReadonlySet<string> {
  return new Set(rows.map((r) => normalizeHolidayDateKey(r.holidayDate)));
}

export function normalizeHolidayDateKey(value: string): string {
  return value.trim().slice(0, 10);
}

export function isHolidayLocalDateKey(localDateKey: string, holidays: ReadonlySet<string>): boolean {
  return holidays.has(normalizeHolidayDateKey(localDateKey));
}

export async function loadHolidayDateSetForLocalRange(
  rangeStart: Date,
  rangeEndExclusive: Date,
): Promise<ReadonlySet<string>> {
  const rows = await listHolidaysInRange(toLocalCivilDateKey(rangeStart), toLocalCivilDateKey(rangeEndExclusive));
  return holidayDateSetFromRecords(rows);
}
