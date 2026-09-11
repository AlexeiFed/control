import { scheduleShiftColumnDateIso } from "./operational-day-timeline";
import { shiftCoverageMinutes } from "./shift-attendance";
import type { Shift } from "./types";

/**
 * Часы покрытия только по колонкам открытого месяца.
 * Смены соседнего месяца (хвост до якоря, overlap-выборка) в итог не входят.
 */
export function sumMonthScheduleCoverageHours(
  shifts: ReadonlyArray<Shift>,
  visibleDateIsos: ReadonlySet<string>,
  operationalAnchor: string,
): number {
  let minutes = 0;
  for (const shift of shifts) {
    const columnDateIso = scheduleShiftColumnDateIso(shift, operationalAnchor);
    if (!visibleDateIsos.has(columnDateIso)) continue;
    minutes += shiftCoverageMinutes(shift);
  }
  return Math.round((minutes / 60) * 10) / 10;
}
