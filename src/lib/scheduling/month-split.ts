import { getDateKhabarovsk } from "../format/display-date";

export type MonthMinutes = Record<string, number>;

export function splitMinutesByMonth(startsAt: Date, endsAt: Date): MonthMinutes {
  if (endsAt <= startsAt) {
    throw new Error("Shift end must be after shift start");
  }

  const result: MonthMinutes = {};

  let cursor = new Date(startsAt);
  while (cursor < endsAt) {
    // Используем UTC+10 для определения границ месяца
    const d10 = new Date(cursor.getTime() + 10 * 3600_000);
    const year = d10.getUTCFullYear();
    const month = d10.getUTCMonth();
    
    const monthStartKhabarovsk = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - 10 * 3600_000);
    const nextMonthStartKhabarovsk = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0, 0) - 10 * 3600_000);
    
    const segmentEnd = endsAt < nextMonthStartKhabarovsk ? endsAt : nextMonthStartKhabarovsk;
    const minutes = Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000));
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    
    if (minutes > 0) {
      result[key] = (result[key] ?? 0) + minutes;
    }
    cursor = segmentEnd;
  }

  return result;
}

export function totalMinutesByMonth(monthMinutes: MonthMinutes): number {
  return Object.values(monthMinutes).reduce((sum, value) => sum + value, 0);
}
