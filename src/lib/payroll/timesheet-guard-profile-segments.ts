import {
  dateIsoBelongsToHalf,
  dateIsoInPayrollMonth,
  halfPeriodShortRu,
  periodMonthIso,
  type PayrollHalf,
  type PayrollMonthContext,
} from "./advance-period";
import type { GuardProfilePeriodRecord, GuardProfileResolver } from "../guards/profile-periods";
import { dayBeforeIso } from "../guards/profile-periods";
import { formatDisplayDateFromIso, getDaysInMonth } from "../format/display-date";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
} from "../operations/status-labels";
import { localDateKeyInTimeZone } from "../scheduling/local-date-key";
import { DEFAULT_SHIFT_TIMEZONE } from "../rates/holiday-calendar";
import type { Guard } from "../scheduling/types";
import type { TimesheetRow } from "../scheduling/timesheet";
import {
  emptyRateLinesByType,
  addContributionsToRateLinesForRow,
  sortedShiftTypeRateLines,
  type ShiftTypeBucket,
  type ShiftTypeRateLine,
} from "./timesheet-guard-period-summary";

export type GuardRateSegmentInHalf = {
  profileLabel: string;
  /** «с 19.06.2026» — если ставка сменилась внутри половины месяца */
  rateSinceLabel: string | null;
  shiftsCount: number;
  totalHours: number;
  unworkedHours: number;
  holidayHours: number;
  guardAmountCents: number;
  byType: Record<ShiftTypeBucket, ShiftTypeRateLine[]>;
};

export type GuardPayrollHalfWithSegments = {
  halfLabel: string;
  shiftsCount: number;
  totalHours: number;
  unworkedHours: number;
  holidayHours: number;
  guardAmountCents: number;
  segments: GuardRateSegmentInHalf[];
};

export type GuardPayrollHalfBreakdown = {
  first: GuardPayrollHalfWithSegments;
  second: GuardPayrollHalfWithSegments;
};

const PROFILE_BOUNDARY_KINDS = new Set<GuardProfilePeriodRecord["periodKind"]>([
  "license",
  "employment",
  "position",
]);

function emptyByType(): Record<ShiftTypeBucket, ShiftTypeRateLine[]> {
  return emptyRateLinesByType();
}

function emptyHalf(halfLabel: string): GuardPayrollHalfWithSegments {
  return {
    halfLabel,
    shiftsCount: 0,
    totalHours: 0,
    unworkedHours: 0,
    holidayHours: 0,
    guardAmountCents: 0,
    segments: [],
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthEndIso(month: PayrollMonthContext): string {
  const lastDay = getDaysInMonth(month.year, month.monthIndex0);
  return `${periodMonthIso(month.year, month.monthIndex0).slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
}

function halfDateRange(month: PayrollMonthContext, half: PayrollHalf): { fromIso: string; toIso: string } {
  const monthPrefix = periodMonthIso(month.year, month.monthIndex0).slice(0, 7);
  if (half === "first") {
    return { fromIso: `${monthPrefix}-01`, toIso: `${monthPrefix}-15` };
  }
  return { fromIso: `${monthPrefix}-16`, toIso: monthEndIso(month) };
}

function shiftDateIso(
  row: TimesheetRow,
  resolveOperationalDateIso?: (row: TimesheetRow) => string,
): string {
  return (
    resolveOperationalDateIso?.(row) ??
    localDateKeyInTimeZone(new Date(row.startsAt), DEFAULT_SHIFT_TIMEZONE)
  );
}

function profileLabelFromResolved(resolved: {
  position: Guard["position"];
  licenseType: Guard["licenseType"];
  employmentType: Guard["employmentType"];
}): string {
  return `${guardPositionLabels[resolved.position]} · ${guardLicenseLabels[resolved.licenseType ?? "None"]} · ${guardEmploymentLabels[resolved.employmentType]}`;
}

/** Граница сегмента — только когда реально меняется профиль (должность/лицензия/трудоустройство). */
function collectProfileChangeStartsInRange(
  periods: readonly GuardProfilePeriodRecord[],
  baseGuard: Guard,
  profileResolver: GuardProfileResolver,
  rangeFrom: string,
  rangeTo: string,
): string[] {
  const candidateStarts = new Set<string>([rangeFrom]);
  for (const period of periods) {
    if (period.guardId !== baseGuard.id) continue;
    if (!PROFILE_BOUNDARY_KINDS.has(period.periodKind)) continue;
    if (period.effectiveFrom > rangeFrom && period.effectiveFrom <= rangeTo) {
      candidateStarts.add(period.effectiveFrom);
    }
  }

  const sorted = [...candidateStarts].sort();
  const result: string[] = [rangeFrom];
  let lastLabel = profileLabelFromResolved(profileResolver.resolveGuardAt(baseGuard, rangeFrom));

  for (const dateIso of sorted) {
    if (dateIso <= rangeFrom) continue;
    const label = profileLabelFromResolved(profileResolver.resolveGuardAt(baseGuard, dateIso));
    if (label !== lastLabel) {
      result.push(dateIso);
      lastLabel = label;
    }
  }

  return result;
}

function addRowToRateSegment(segment: GuardRateSegmentInHalf, row: TimesheetRow): void {
  segment.shiftsCount += 1;
  segment.totalHours = round2(segment.totalHours + row.totalHours);
  segment.unworkedHours = round2(segment.unworkedHours + row.unworkedHours);
  segment.holidayHours = round2(segment.holidayHours + row.holidayHours);
  segment.guardAmountCents += row.guardAmountCents;

  addContributionsToRateLinesForRow(segment.byType, row);
}

function addRowToHalf(half: GuardPayrollHalfWithSegments, row: TimesheetRow): void {
  half.shiftsCount += 1;
  half.totalHours = round2(half.totalHours + row.totalHours);
  half.unworkedHours = round2(half.unworkedHours + row.unworkedHours);
  half.holidayHours = round2(half.holidayHours + row.holidayHours);
  half.guardAmountCents += row.guardAmountCents;
}

function buildHalfSegments(
  guardRows: TimesheetRow[],
  month: PayrollMonthContext,
  half: PayrollHalf,
  baseGuard: Guard,
  profileResolver: GuardProfileResolver,
  periods: readonly GuardProfilePeriodRecord[],
  resolveOperationalDateIso?: (row: TimesheetRow) => string,
): GuardPayrollHalfWithSegments {
  const halfLabel = halfPeriodShortRu(half, month.year, month.monthIndex0);
  const { fromIso: halfFrom, toIso: halfTo } = halfDateRange(month, half);
  const halfRows = guardRows.filter((row) => {
    const dateIso = shiftDateIso(row, resolveOperationalDateIso);
    return dateIsoInPayrollMonth(dateIso, month) && dateIsoBelongsToHalf(dateIso, half, month);
  });

  const result = emptyHalf(halfLabel);
  if (halfRows.length === 0) return result;

  const segmentStarts = collectProfileChangeStartsInRange(
    periods,
    baseGuard,
    profileResolver,
    halfFrom,
    halfTo,
  );
  const segmentRanges = segmentStarts.map((fromIso, index) => {
    const nextStart = segmentStarts[index + 1];
    const toIso = nextStart ? dayBeforeIso(nextStart) : halfTo;
    return { fromIso, toIso };
  });

  const segments: GuardRateSegmentInHalf[] = segmentRanges.map(({ fromIso }) => {
    const resolved = profileResolver.resolveGuardAt(baseGuard, fromIso);
    return {
      profileLabel: profileLabelFromResolved(resolved),
      rateSinceLabel:
        fromIso > halfFrom ? `с ${formatDisplayDateFromIso(fromIso)}` : null,
      shiftsCount: 0,
      totalHours: 0,
      unworkedHours: 0,
      holidayHours: 0,
      guardAmountCents: 0,
      byType: emptyByType(),
    };
  });

  for (const row of halfRows) {
    const dateIso = shiftDateIso(row, resolveOperationalDateIso);
    const segmentIndex = segmentRanges.findIndex(
      (range) => dateIso >= range.fromIso && dateIso <= range.toIso,
    );
    if (segmentIndex < 0) continue;
    addRowToHalf(result, row);
    addRowToRateSegment(segments[segmentIndex]!, row);
  }

  result.segments = segments.filter((segment) => segment.shiftsCount > 0);
  return result;
}

export function buildGuardPayrollHalfBreakdown(
  guardRows: TimesheetRow[],
  month: PayrollMonthContext,
  baseGuard: Guard,
  profileResolver: GuardProfileResolver,
  periods: readonly GuardProfilePeriodRecord[],
  resolveOperationalDateIso?: (row: TimesheetRow) => string,
): GuardPayrollHalfBreakdown {
  return {
    first: buildHalfSegments(
      guardRows,
      month,
      "first",
      baseGuard,
      profileResolver,
      periods,
      resolveOperationalDateIso,
    ),
    second: buildHalfSegments(
      guardRows,
      month,
      "second",
      baseGuard,
      profileResolver,
      periods,
      resolveOperationalDateIso,
    ),
  };
}

export function buildGuardPayrollHalfBreakdownByName(input: {
  rows: TimesheetRow[];
  month: PayrollMonthContext;
  guardIdByName: Map<string, string>;
  guardsById: Map<string, Guard>;
  profileResolver: GuardProfileResolver;
  periods: readonly GuardProfilePeriodRecord[];
  resolveOperationalDateIso?: (row: TimesheetRow) => string;
}): Map<string, GuardPayrollHalfBreakdown> {
  const rowsByGuard = new Map<string, TimesheetRow[]>();
  for (const row of input.rows) {
    const list = rowsByGuard.get(row.guardName) ?? [];
    list.push(row);
    rowsByGuard.set(row.guardName, list);
  }

  const map = new Map<string, GuardPayrollHalfBreakdown>();
  for (const [guardName, guardRows] of rowsByGuard) {
    const guardId = input.guardIdByName.get(guardName);
    const baseGuard = guardId ? input.guardsById.get(guardId) : undefined;
    if (!guardId || !baseGuard) continue;
    map.set(
      guardName,
      buildGuardPayrollHalfBreakdown(
        guardRows,
        input.month,
        baseGuard,
        input.profileResolver,
        input.periods,
        input.resolveOperationalDateIso,
      ),
    );
  }
  return map;
}

export { sortedShiftTypeRateLines };
