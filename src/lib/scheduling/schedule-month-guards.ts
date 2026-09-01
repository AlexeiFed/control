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

/** Живой пул «Охранники объекта» только для текущего/будущего месяца. */
export function shouldShowLiveObjectGuardPool(
  year: number,
  monthIndex0: number,
  now = new Date(),
): boolean {
  return !isKhabarovskMonthPast(year, monthIndex0, now);
}

export function collectMonthStaffUnionIds(
  monthlyPostGuardsByPostId: Readonly<Record<string, ReadonlyArray<string>>>,
): string[] {
  const ids = new Set<string>();
  for (const staffIds of Object.values(monthlyPostGuardsByPostId)) {
    for (const id of staffIds) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** Плоский штат месяца без постов: галка только добавляет/убирает id. */
export function nextMonthRosterIds(
  current: ReadonlyArray<string>,
  guardId: string,
  assigned: boolean,
): string[] {
  if (assigned) {
    return current.includes(guardId) ? [...current] : [...current, guardId];
  }
  return current.filter((id) => id !== guardId);
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
