import { normalizeOperationalAnchorTime } from "./operational-day-timeline";
import type { ScheduleObjectRef } from "./schedule-shortage";

/** Ключ месячного якоря: `objectId|YYYY-MM`. */
export function operationalDayMonthKey(objectId: string, dateIsoOrMonth: string): string {
  const month = dateIsoOrMonth.length >= 7 ? dateIsoOrMonth.slice(0, 7) : dateIsoOrMonth;
  return `${objectId}|${month}`;
}

/**
 * Якоря операционных суток на конкретный civil-день:
 * месячная настройка объекта перекрывает default из security_objects.
 */
export function buildOperationalDayAnchorByObjectIdForDate(
  objects: ReadonlyArray<ScheduleObjectRef>,
  dateIso: string,
  monthlyOverrides: ReadonlyMap<string, string> = new Map(),
): Map<string, string> {
  const month = dateIso.slice(0, 7);
  return new Map(
    objects.map((objectItem) => {
      const override = monthlyOverrides.get(operationalDayMonthKey(objectItem.id, month));
      return [
        objectItem.id,
        normalizeOperationalAnchorTime(override ?? objectItem.operationalDayStartTime),
      ];
    }),
  );
}
