import {
  DEFAULT_OPERATIONAL_DAY_START_TIME,
  shiftBelongsToOperationalDayColumn,
} from "./operational-day-timeline";
import type { ExpectedShifts } from "./object-shift-templates";
import { shiftCoverageMinutes } from "./shift-attendance";
import type { Shift } from "./types";

export type ScheduleObjectRef = {
  id: string;
  name: string;
  operationalDayStartTime?: string;
};

export function buildOperationalDayAnchorByObjectId(
  objects: ReadonlyArray<ScheduleObjectRef>,
): Map<string, string> {
  return new Map(
    objects.map((objectItem) => [
      objectItem.id,
      objectItem.operationalDayStartTime ?? DEFAULT_OPERATIONAL_DAY_START_TIME,
    ]),
  );
}

export type ScheduleDayShortage = {
  dateIso: string;
  dayLabel: string;
  hoursShort: number;
  /** Недобор часов усиления. */
  reinforcementShort: number;
  /** Недобор часов МП. */
  rapidResponseShort: number;
  /** Недобор часов старшего смены. */
  shiftLeadShort: number;
  expectedHoursRegular: number;
  regularDayHours: number;
};

export type ScheduleObjectShortage = {
  objectId: string;
  objectName: string;
  totalHoursShort: number;
  totalReinforcementShort: number;
  totalRapidResponseShort: number;
  totalShiftLeadShort: number;
  days: ScheduleDayShortage[];
};

export type WeekDayRef = { iso: string; label: string };

export type DayPlanMetrics = {
  expectedHoursRegular: number;
  expectedReinforcement: number;
  expectedReinforcementHours: number;
  expectedRapidResponse: number;
  expectedRapidResponseHours: number;
  expectedShiftLead: number;
  expectedShiftLeadHours: number;
  reinforcementShiftHours: number;
  rapidResponseShiftHours: number;
  shiftLeadShiftHours: number;
  regularDayHours: number;
  reinforcementDayHours: number;
  rapidResponseDayHours: number;
  shiftLeadDayHours: number;
  regCount: number;
  reinforcementCount: number;
  rapidResponseCount: number;
  shiftLeadCount: number;
  hoursShort: number;
  hoursOver: number;
  reinforcementShort: number;
  reinforcementOver: number;
  reinforcementHoursShort: number;
  reinforcementHoursOver: number;
  rapidResponseShort: number;
  rapidResponseOver: number;
  rapidResponseHoursShort: number;
  rapidResponseHoursOver: number;
  shiftLeadShort: number;
  shiftLeadOver: number;
  shiftLeadHoursShort: number;
  shiftLeadHoursOver: number;
};

/** Есть ли недобор часов (осн/ус/мп/СтМ) относительно плана дня. */
export function dayPlanHasHoursShortage(metrics: DayPlanMetrics): boolean {
  return (
    metrics.hoursShort > 0 ||
    metrics.reinforcementHoursShort > 0 ||
    metrics.rapidResponseHoursShort > 0 ||
    metrics.shiftLeadHoursShort > 0
  );
}

/** Подпись плана: «2 × 14 ч» или «1 чел.» */
export function formatTemplateCountWithHours(count: number, hours: number, unit: string): string {
  if (count <= 0) return "";
  if (hours !== 24) return `${count} ${unit} × ${hours} ч`;
  return `${count} ${unit}`;
}

function roundHours(h: number): number {
  return Math.round(h * 10) / 10;
}

/** Факт vs план по дню: часы обычных смен, усиление и МП отдельно. */
export function computeDayPlanMetrics(
  dayShifts: ReadonlyArray<Shift>,
  norms: ExpectedShifts | undefined,
): DayPlanMetrics | null {
  if (!norms) return null;

  const expectedHoursRegular = norms.regular * norms.shiftHours;
  const expectedReinf = norms.reinforcement;
  const expectedReinfHours = expectedReinf * norms.reinforcementShiftHours;
  const expectedMp = norms.rapidResponse;
  const expectedMpHours = expectedMp * norms.rapidResponseShiftHours;
  const expectedShiftLead = norms.shiftLead;
  const expectedShiftLeadHours = expectedShiftLead * norms.shiftLeadShiftHours;
  if (expectedHoursRegular <= 0 && expectedReinf <= 0 && expectedMp <= 0 && expectedShiftLead <= 0) return null;

  // Полный невыход не даёт часов; частичная отработка (workedUntil) — даёт отработанный фрагмент.
  const active = dayShifts.filter((s) => shiftCoverageMinutes(s) > 0);
  const regularShifts = active.filter((s) => s.shiftKind === "Regular");
  const reinforcementShifts = active.filter((s) => s.shiftKind === "Reinforcement");
  const rapidResponseShifts = active.filter((s) => s.shiftKind === "RapidResponse");
  const shiftLeadShifts = active.filter((s) => s.shiftKind === "ShiftLead");
  const regularDayMinutes = regularShifts.reduce((sum, s) => sum + shiftCoverageMinutes(s), 0);
  const reinforcementDayMinutes = reinforcementShifts.reduce(
    (sum, s) => sum + shiftCoverageMinutes(s),
    0,
  );
  const rapidResponseDayMinutes = rapidResponseShifts.reduce(
    (sum, s) => sum + shiftCoverageMinutes(s),
    0,
  );
  const shiftLeadDayMinutes = shiftLeadShifts.reduce((sum, s) => sum + shiftCoverageMinutes(s), 0);
  const regularDayHours = roundHours(regularDayMinutes / 60);
  const reinforcementDayHours = roundHours(reinforcementDayMinutes / 60);
  const rapidResponseDayHours = roundHours(rapidResponseDayMinutes / 60);
  const shiftLeadDayHours = roundHours(shiftLeadDayMinutes / 60);
  const reinforcementCount = reinforcementShifts.length;
  const rapidResponseCount = rapidResponseShifts.length;
  const shiftLeadCount = shiftLeadShifts.length;

  return {
    expectedHoursRegular: roundHours(expectedHoursRegular),
    expectedReinforcement: expectedReinf,
    expectedReinforcementHours: roundHours(expectedReinfHours),
    expectedRapidResponse: expectedMp,
    expectedRapidResponseHours: roundHours(expectedMpHours),
    expectedShiftLead,
    expectedShiftLeadHours: roundHours(expectedShiftLeadHours),
    reinforcementShiftHours: norms.reinforcementShiftHours,
    rapidResponseShiftHours: norms.rapidResponseShiftHours,
    shiftLeadShiftHours: norms.shiftLeadShiftHours,
    regularDayHours,
    reinforcementDayHours,
    rapidResponseDayHours,
    shiftLeadDayHours,
    regCount: regularShifts.length,
    reinforcementCount,
    rapidResponseCount,
    shiftLeadCount,
    hoursShort: Math.max(0, roundHours(expectedHoursRegular - regularDayHours)),
    hoursOver: Math.max(0, roundHours(regularDayHours - expectedHoursRegular)),
    reinforcementShort: expectedReinf > 0 ? Math.max(0, expectedReinf - reinforcementCount) : 0,
    reinforcementOver: expectedReinf > 0 ? Math.max(0, reinforcementCount - expectedReinf) : 0,
    reinforcementHoursShort:
      expectedReinfHours > 0 ? Math.max(0, roundHours(expectedReinfHours - reinforcementDayHours)) : 0,
    reinforcementHoursOver:
      expectedReinfHours > 0 ? Math.max(0, roundHours(reinforcementDayHours - expectedReinfHours)) : 0,
    rapidResponseShort: expectedMp > 0 ? Math.max(0, expectedMp - rapidResponseCount) : 0,
    rapidResponseOver: expectedMp > 0 ? Math.max(0, rapidResponseCount - expectedMp) : 0,
    rapidResponseHoursShort:
      expectedMpHours > 0 ? Math.max(0, roundHours(expectedMpHours - rapidResponseDayHours)) : 0,
    rapidResponseHoursOver:
      expectedMpHours > 0 ? Math.max(0, roundHours(rapidResponseDayHours - expectedMpHours)) : 0,
    shiftLeadShort: expectedShiftLead > 0 ? Math.max(0, expectedShiftLead - shiftLeadCount) : 0,
    shiftLeadOver: expectedShiftLead > 0 ? Math.max(0, shiftLeadCount - expectedShiftLead) : 0,
    shiftLeadHoursShort:
      expectedShiftLeadHours > 0 ? Math.max(0, roundHours(expectedShiftLeadHours - shiftLeadDayHours)) : 0,
    shiftLeadHoursOver:
      expectedShiftLeadHours > 0 ? Math.max(0, roundHours(shiftLeadDayHours - expectedShiftLeadHours)) : 0,
  };
}

/** Недобор по дню объекта — та же логика, что в ячейках графика смен. */
export function computeDayScheduleShortage(
  dayShifts: ReadonlyArray<Shift>,
  norms: ExpectedShifts | undefined,
): Omit<ScheduleDayShortage, "dateIso" | "dayLabel"> | null {
  const metrics = computeDayPlanMetrics(dayShifts, norms);
  if (!metrics) return null;
  if (
    metrics.hoursShort <= 0 &&
    metrics.reinforcementHoursShort <= 0 &&
    metrics.rapidResponseHoursShort <= 0 &&
    metrics.shiftLeadHoursShort <= 0
  ) {
    return null;
  }

  return {
    hoursShort: metrics.hoursShort,
    reinforcementShort: metrics.reinforcementHoursShort,
    rapidResponseShort: metrics.rapidResponseHoursShort,
    shiftLeadShort: metrics.shiftLeadHoursShort,
    expectedHoursRegular: metrics.expectedHoursRegular,
    regularDayHours: metrics.regularDayHours,
  };
}

/** Смены, чьи операционные сутки попадают в видимые колонки графика (14 дней на экране). */
export function filterShiftsToVisibleScheduleDays(
  shifts: ReadonlyArray<Shift>,
  weekDays: ReadonlyArray<WeekDayRef>,
  anchorByObjectId: ReadonlyMap<string, string>,
): Shift[] {
  const visibleIsos = new Set(weekDays.map((d) => d.iso));
  return shifts.filter((shift) => {
    for (const columnDateIso of visibleIsos) {
      if (shiftBelongsToOperationalDayColumn(shift, columnDateIso, anchorByObjectId)) {
        return true;
      }
    }
    return false;
  });
}

export function computeScheduleShortages(
  objects: ReadonlyArray<ScheduleObjectRef>,
  shifts: ReadonlyArray<Shift>,
  expectedShiftsByObjectDay: Record<string, Record<string, ExpectedShifts>>,
  weekDays: ReadonlyArray<WeekDayRef>,
): ScheduleObjectShortage[] {
  const anchorByObjectId = buildOperationalDayAnchorByObjectId(objects);
  const visibleShifts = filterShiftsToVisibleScheduleDays(shifts, weekDays, anchorByObjectId);
  const result: ScheduleObjectShortage[] = [];

  for (const object of objects) {
    const objNorms = expectedShiftsByObjectDay[object.id] ?? {};
    const days: ScheduleDayShortage[] = [];
    let totalHoursShort = 0;
    let totalReinforcementShort = 0;
    let totalRapidResponseShort = 0;
    let totalShiftLeadShort = 0;

    for (const day of weekDays) {
      const dayShifts = visibleShifts.filter(
        (s) =>
          s.objectId === object.id &&
          shiftBelongsToOperationalDayColumn(s, day.iso, anchorByObjectId),
      );
      const partial = computeDayScheduleShortage(dayShifts, objNorms[day.iso]);
      if (!partial) continue;
      totalHoursShort += partial.hoursShort;
      totalReinforcementShort += partial.reinforcementShort;
      totalRapidResponseShort += partial.rapidResponseShort;
      totalShiftLeadShort += partial.shiftLeadShort;
      days.push({
        dateIso: day.iso,
        dayLabel: day.label,
        ...partial,
      });
    }

    if (days.length === 0) continue;
    result.push({
      objectId: object.id,
      objectName: object.name,
      totalHoursShort: roundHours(totalHoursShort),
      totalReinforcementShort: roundHours(totalReinforcementShort),
      totalRapidResponseShort: roundHours(totalRapidResponseShort),
      totalShiftLeadShort: roundHours(totalShiftLeadShort),
      days,
    });
  }

  return result.sort((a, b) => b.totalHoursShort - a.totalHoursShort);
}
