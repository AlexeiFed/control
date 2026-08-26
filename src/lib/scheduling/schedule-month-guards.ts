import { getKhabarovskComponents } from "../format/display-date";

/**
 * ID охранников для строк месячного графика (объединение штата и смен месяца).
 */
export function collectScheduleMonthGuardIds(
  monthlyStaffIds: ReadonlyArray<string>,
  shiftGuardIds: ReadonlyArray<string>,
): string[] {
  const ids = new Set<string>();
  for (const id of monthlyStaffIds) {
    if (id) ids.add(id);
  }
  for (const id of shiftGuardIds) {
    if (id) ids.add(id);
  }
  return [...ids];
}

/** Месяц строго раньше текущего календарного месяца (Asia/Vladivostok). */
export function isKhabarovskMonthPast(year: number, monthIndex0: number, now = new Date()): boolean {
  const kh = getKhabarovskComponents(now);
  return year < kh.year || (year === kh.year && monthIndex0 < kh.month0);
}

/**
 * Источник строк графика:
 * - прошлый месяц: только снимок штата месяца (изоляция от поздних назначений на объект);
 * - текущий/будущий: живой пул «Охранники объекта».
 * Смены месяца всегда добавляются сверху.
 */
export function resolveScheduleMonthRosterIds(input: {
  year: number;
  monthIndex0: number;
  objectGuardIds: ReadonlyArray<string>;
  monthlyStaffIds: ReadonlyArray<string>;
  shiftGuardIds: ReadonlyArray<string>;
  now?: Date;
}): string[] {
  const roster = isKhabarovskMonthPast(input.year, input.monthIndex0, input.now)
    ? input.monthlyStaffIds
    : input.objectGuardIds;
  return collectScheduleMonthGuardIds(roster, input.shiftGuardIds);
}
