import { addDaysToIsoDate, toDateIsoKhabarovsk } from "../format/display-date";
import {
  listMonthlyOperationalDayStarts,
} from "../operations/object-monthly-settings-repository";
import { operationalDayMonthKey } from "../scheduling/operational-day-anchors";
import {
  DEFAULT_OPERATIONAL_DAY_START_TIME,
  normalizeOperationalAnchorTime,
  scheduleShiftColumnDateIso,
} from "../scheduling/operational-day-timeline";

export type TimesheetOperationalDayShiftLike = {
  startsAt: string | Date;
  endsAt: string | Date;
  objectId?: string | null;
};

/** Месяцы вокруг даты смены: текущий и соседние (хвосты до якоря). */
export function monthKeysAroundDateIso(dateIso: string): string[] {
  const prev = addDaysToIsoDate(dateIso, -1).slice(0, 7);
  const curr = dateIso.slice(0, 7);
  const next = addDaysToIsoDate(dateIso, 1).slice(0, 7);
  return [...new Set([prev, curr, next].filter((m) => /^\d{4}-\d{2}$/.test(m)))];
}

export function monthKeysForPayrollMonth(year: number, monthIndex0: number): string[] {
  const curr = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
  const prevDate = addDaysToIsoDate(`${curr}-01`, -1);
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const nextDate = addDaysToIsoDate(`${curr}-${String(lastDay).padStart(2, "0")}`, 1);
  return [...new Set([prevDate.slice(0, 7), curr, nextDate.slice(0, 7)])];
}

/**
 * Операционные сутки смены: месячный якорь объекта перекрывает default,
 * с уточнением после первичного расчёта (граница месяцев).
 */
export function resolveTimesheetRowOperationalDateIso(
  row: TimesheetOperationalDayShiftLike,
  objectDefaultById: ReadonlyMap<string, string>,
  monthlyByKey: ReadonlyMap<string, string> = new Map(),
): string {
  const objectId = row.objectId?.trim() || "";
  const fallback =
    (objectId ? objectDefaultById.get(objectId) : undefined) ?? DEFAULT_OPERATIONAL_DAY_START_TIME;

  const pickAnchor = (monthKey: string): string => {
    if (!objectId) return fallback;
    return monthlyByKey.get(operationalDayMonthKey(objectId, monthKey)) ?? fallback;
  };

  const startsAt = typeof row.startsAt === "string" ? row.startsAt : row.startsAt.toISOString();
  const endsAt = typeof row.endsAt === "string" ? row.endsAt : row.endsAt.toISOString();
  const calIso = toDateIsoKhabarovsk(new Date(startsAt));
  let anchor = pickAnchor(calIso.slice(0, 7));
  // Хвост 08:00 при якоре 09:00: календарный старт уже «следующий» день — пробуем и вчерашний месяц.
  const prevMonthAnchor = pickAnchor(addDaysToIsoDate(calIso, -1).slice(0, 7));
  if (prevMonthAnchor !== anchor) {
    const candidate = scheduleShiftColumnDateIso({ startsAt, endsAt }, prevMonthAnchor);
    if (candidate.slice(0, 7) === addDaysToIsoDate(calIso, -1).slice(0, 7)) {
      anchor = prevMonthAnchor;
    }
  }

  let dateIso = scheduleShiftColumnDateIso({ startsAt, endsAt }, anchor);
  const refined = pickAnchor(dateIso.slice(0, 7));
  if (refined !== anchor) {
    dateIso = scheduleShiftColumnDateIso({ startsAt, endsAt }, refined);
  }
  return dateIso;
}

/** Запас по краям месяца/недели: хвосты до якоря (часто 08–09) уезжают на соседние календарные сутки. */
export function padTimesheetQueryRange(
  rangeStart: Date,
  rangeEnd: Date,
  padMs = 36 * 60 * 60_000,
): { start: Date; end: Date } {
  return {
    start: new Date(rangeStart.getTime() - padMs),
    end: new Date(rangeEnd.getTime() + padMs),
  };
}

export async function loadTimesheetOperationalDayContext(
  objects: ReadonlyArray<{ id: string; operationalDayStartTime: string }>,
  monthKeys: ReadonlyArray<string>,
): Promise<{
  objectDefaultById: Map<string, string>;
  monthlyByKey: Map<string, string>;
  resolveRowDateIso: (row: TimesheetOperationalDayShiftLike) => string;
}> {
  const objectDefaultById = new Map(
    objects.map((o) => [o.id, normalizeOperationalAnchorTime(o.operationalDayStartTime)] as const),
  );
  const monthlyByKey =
    objects.length === 0 || monthKeys.length === 0
      ? new Map<string, string>()
      : await listMonthlyOperationalDayStarts(
          objects.map((o) => o.id),
          [...monthKeys],
        );

  return {
    objectDefaultById,
    monthlyByKey,
    resolveRowDateIso: (row) =>
      resolveTimesheetRowOperationalDateIso(row, objectDefaultById, monthlyByKey),
  };
}
