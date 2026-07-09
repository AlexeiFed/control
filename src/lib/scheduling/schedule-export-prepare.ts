import { addDaysToIsoDate, coerceToDate, getDaysInMonth } from "../format/display-date";
import {
  normalizeOperationalAnchorTime,
  scheduleShiftColumnDateIso,
} from "./operational-day-timeline";
import type { Shift } from "./types";
import {
  buildDefaultMonthExportPeriods,
  buildExportTitle,
  createCustomExportPeriod,
  createCustomExportPeriodFromIso,
  expandSelectedExportPeriods,
  type ScheduleExportPeriod,
} from "./schedule-export-periods";
import { buildScheduleExportTable, type ScheduleExportGuardRow } from "./schedule-export-table";

type SerializedShift = Omit<Shift, "startsAt" | "endsAt" | "incidentWorkedUntilAt" | "incidentRecordedAt"> & {
  startsAt: string;
  endsAt: string;
  incidentWorkedUntilAt: string | null;
  incidentRecordedAt: string | null;
};

function deserializeShift(raw: SerializedShift): Shift {
  return {
    ...raw,
    startsAt: new Date(raw.startsAt),
    endsAt: new Date(raw.endsAt),
    incidentWorkedUntilAt: raw.incidentWorkedUntilAt ? new Date(raw.incidentWorkedUntilAt) : null,
    incidentRecordedAt: raw.incidentRecordedAt ? new Date(raw.incidentRecordedAt) : null,
  };
}

function normalizeShiftForExport(shift: Shift): Shift {
  if (
    shift.startsAt instanceof Date &&
    shift.endsAt instanceof Date &&
    (!shift.incidentWorkedUntilAt || shift.incidentWorkedUntilAt instanceof Date) &&
    (!shift.incidentRecordedAt || shift.incidentRecordedAt instanceof Date)
  ) {
    return shift;
  }
  return {
    ...shift,
    startsAt: coerceToDate(shift.startsAt as string | Date),
    endsAt: coerceToDate(shift.endsAt as string | Date),
    incidentWorkedUntilAt: shift.incidentWorkedUntilAt
      ? coerceToDate(shift.incidentWorkedUntilAt as string | Date)
      : null,
    incidentRecordedAt: shift.incidentRecordedAt
      ? coerceToDate(shift.incidentRecordedAt as string | Date)
      : null,
  };
}

async function fetchShiftsForRange(objectId: string, startIso: string, endExclusiveIso: string): Promise<Shift[]> {
  const start = `${startIso}T00:00:00+10:00`;
  const end = `${endExclusiveIso}T00:00:00+10:00`;
  const params = new URLSearchParams({ start, end });
  const res = await fetch(`/api/scheduler/shifts-query?${params.toString()}`);
  if (!res.ok) throw new Error("Не удалось загрузить смены за выбранный период");
  const data = (await res.json()) as { ok: boolean; shifts?: SerializedShift[] };
  if (!data.ok || !data.shifts) throw new Error("Не удалось загрузить смены за выбранный период");
  return data.shifts.filter((s) => s.objectId === objectId).map(deserializeShift);
}

function toIso(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

async function fetchShiftsOutsideViewMonth(
  objectId: string,
  year: number,
  monthIndex0: number,
  dayIsoSet: Set<string>,
): Promise<Shift[]> {
  const monthStartIso = toIso(year, monthIndex0, 1);
  const monthEndIso = toIso(year, monthIndex0, getDaysInMonth(year, monthIndex0));

  const outsideIsos = [...dayIsoSet].filter((iso) => iso < monthStartIso || iso > monthEndIso);
  if (!outsideIsos.length) return [];

  outsideIsos.sort();
  const startIso = outsideIsos[0]!;
  const lastIso = outsideIsos[outsideIsos.length - 1]!;
  return fetchShiftsForRange(objectId, startIso, addDaysToIsoDate(lastIso, 1));
}

export async function prepareScheduleExportTable(input: {
  objectId: string;
  objectName: string;
  year: number;
  monthIndex0: number;
  periods: ScheduleExportPeriod[];
  guards: ScheduleExportGuardRow[];
  monthShifts: Shift[];
  operationalDayStartTime: string;
}): Promise<ReturnType<typeof buildScheduleExportTable>> {
  const anchorTime = normalizeOperationalAnchorTime(input.operationalDayStartTime);
  const dayColumns = expandSelectedExportPeriods(input.periods, input.year, input.monthIndex0);
  const dayIsoSet = new Set(dayColumns.map((c) => c.dateIso));
  const normalizedMonthShifts = input.monthShifts.map(normalizeShiftForExport);

  let shifts = normalizedMonthShifts.filter((shift) =>
    dayIsoSet.has(scheduleShiftColumnDateIso(shift, anchorTime)),
  );

  const extra = await fetchShiftsOutsideViewMonth(
    input.objectId,
    input.year,
    input.monthIndex0,
    dayIsoSet,
  );
  if (extra.length) {
    const known = new Set(shifts.map((s) => s.id));
    shifts = [
      ...shifts,
      ...extra.filter(
        (s) => !known.has(s.id) && dayIsoSet.has(scheduleShiftColumnDateIso(s, anchorTime)),
      ),
    ];
  }

  const title = buildExportTitle(input.objectName, input.year, input.monthIndex0, input.periods);
  return buildScheduleExportTable(
    title,
    input.guards,
    dayColumns,
    shifts,
    anchorTime,
  );
}

export { buildDefaultMonthExportPeriods, createCustomExportPeriod, createCustomExportPeriodFromIso, type ScheduleExportPeriod };
