import {
  dateIsoBelongsToHalf,
  dateIsoInPayrollMonth,
  type PayrollMonthContext,
} from "./advance-period";
import type { TimesheetRow } from "../scheduling/timesheet";
import { DEFAULT_SHIFT_TIMEZONE, localDateKeyInTimeZone } from "../scheduling/local-date-key";

export type ShiftTypeBucket = "regular" | "reinforcement" | "rapidResponse";

export type ShiftTypePeriodStats = {
  shiftsCount: number;
  hours: number;
  holidayHours: number;
  guardAmountCents: number;
};

export type ShiftTypeRateLine = ShiftTypePeriodStats & {
  hourlyRateCents: number | null;
};

export type PeriodHalfBreakdown = {
  shiftsCount: number;
  totalHours: number;
  unworkedHours: number;
  holidayHours: number;
  guardAmountCents: number;
  byType: Record<ShiftTypeBucket, ShiftTypeRateLine[]>;
};

export type GuardPeriodBreakdown = {
  first: PeriodHalfBreakdown;
  second: PeriodHalfBreakdown;
};

export const SHIFT_TYPE_BUCKETS: ShiftTypeBucket[] = ["regular", "reinforcement", "rapidResponse"];

function emptyTypeStats(): ShiftTypePeriodStats {
  return { shiftsCount: 0, hours: 0, holidayHours: 0, guardAmountCents: 0 };
}

export function emptyRateLinesByType(): Record<ShiftTypeBucket, ShiftTypeRateLine[]> {
  return {
    regular: [],
    reinforcement: [],
    rapidResponse: [],
  };
}

function emptyByType(): Record<ShiftTypeBucket, ShiftTypeRateLine[]> {
  return emptyRateLinesByType();
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function classifyShiftType(row: TimesheetRow): ShiftTypeBucket {
  if (row.rapidResponseHours > 0) return "rapidResponse";
  if (row.reinforcementHours > 0) return "reinforcement";
  return "regular";
}

function typeHours(row: TimesheetRow, type: ShiftTypeBucket): number {
  switch (type) {
    case "regular":
      return row.regularHours;
    case "reinforcement":
      return row.reinforcementHours;
    case "rapidResponse":
      return row.rapidResponseHours;
  }
}

function emptyHalf(): PeriodHalfBreakdown {
  return {
    shiftsCount: 0,
    totalHours: 0,
    unworkedHours: 0,
    holidayHours: 0,
    guardAmountCents: 0,
    byType: emptyByType(),
  };
}

export function shiftGuardHourlyRateCents(row: TimesheetRow): number | null {
  const type = classifyShiftType(row);
  const hours = typeHours(row, type);
  if (hours <= 0 || row.guardAmountCents <= 0) return null;
  return Math.round(row.guardAmountCents / hours);
}

function tariffRateKey(rateCents: number): number {
  return rateCents;
}

function addContributionsToRateLines(
  byType: Record<ShiftTypeBucket, ShiftTypeRateLine[]>,
  row: TimesheetRow,
): void {
  const type = classifyShiftType(row);
  const typeHoursTotal = typeHours(row, type);
  const contributions = row.guardRateContributions ?? [];

  if (contributions.length === 0) {
    const line = findOrCreateRateLine(byType[type], shiftGuardHourlyRateCents(row));
    addRowToRateLine(line, row, type);
    return;
  }

  let shiftCounted = false;
  for (const part of contributions) {
    const partHours = round2(part.minutes / 60);
    if (partHours <= 0 && part.amountCents <= 0) continue;
    const line = findOrCreateRateLine(byType[type], tariffRateKey(part.guardRateCents));
    if (!shiftCounted) {
      line.shiftsCount += 1;
      shiftCounted = true;
    }
    line.hours = round2(line.hours + partHours);
    line.guardAmountCents += part.amountCents;
    if (typeHoursTotal > 0 && row.holidayHours > 0) {
      line.holidayHours = round2(line.holidayHours + row.holidayHours * (partHours / typeHoursTotal));
    }
  }
}

function addRowRateContributions(half: PeriodHalfBreakdown, row: TimesheetRow): void {
  addContributionsToRateLines(half.byType, row);
}

export function findOrCreateRateLine(
  lines: ShiftTypeRateLine[],
  hourlyRateCents: number | null,
): ShiftTypeRateLine {
  const key = hourlyRateCents ?? -1;
  const existing = lines.find((line) => (line.hourlyRateCents ?? -1) === key);
  if (existing) return existing;
  const created: ShiftTypeRateLine = { hourlyRateCents, ...emptyTypeStats() };
  lines.push(created);
  return created;
}

export function addRowToRateLine(line: ShiftTypeRateLine, row: TimesheetRow, type: ShiftTypeBucket): void {
  line.shiftsCount += 1;
  line.hours = round2(line.hours + typeHours(row, type));
  line.holidayHours = round2(line.holidayHours + row.holidayHours);
  line.guardAmountCents += row.guardAmountCents;
}

function addRowToHalf(half: PeriodHalfBreakdown, row: TimesheetRow): void {
  half.shiftsCount += 1;
  half.totalHours = round2(half.totalHours + row.totalHours);
  half.unworkedHours = round2(half.unworkedHours + row.unworkedHours);
  half.holidayHours = round2(half.holidayHours + row.holidayHours);
  half.guardAmountCents += row.guardAmountCents;

  addRowRateContributions(half, row);
}

export function sortedShiftTypeRateLines(
  byType: Record<ShiftTypeBucket, ShiftTypeRateLine[]>,
): Array<{ type: ShiftTypeBucket; line: ShiftTypeRateLine }> {
  const result: Array<{ type: ShiftTypeBucket; line: ShiftTypeRateLine }> = [];
  for (const type of SHIFT_TYPE_BUCKETS) {
    for (const line of [...byType[type]].sort(
      (a, b) => (a.hourlyRateCents ?? 0) - (b.hourlyRateCents ?? 0),
    )) {
      if (line.shiftsCount > 0) result.push({ type, line });
    }
  }
  return result;
}

export function addContributionsToRateLinesForRow(
  byType: Record<ShiftTypeBucket, ShiftTypeRateLine[]>,
  row: TimesheetRow,
): void {
  addContributionsToRateLines(byType, row);
}

export function buildGuardPeriodBreakdownByName(
  rows: TimesheetRow[],
  month: PayrollMonthContext,
  resolveOperationalDateIso?: (row: TimesheetRow) => string,
): Map<string, GuardPeriodBreakdown> {
  const map = new Map<string, GuardPeriodBreakdown>();

  for (const row of rows) {
    const dateIso =
      resolveOperationalDateIso?.(row) ??
      localDateKeyInTimeZone(new Date(row.startsAt), DEFAULT_SHIFT_TIMEZONE);
    if (!dateIsoInPayrollMonth(dateIso, month)) continue;

    const breakdown = map.get(row.guardName) ?? { first: emptyHalf(), second: emptyHalf() };
    const halfKey = dateIsoBelongsToHalf(dateIso, "first", month) ? "first" : "second";
    addRowToHalf(breakdown[halfKey], row);
    map.set(row.guardName, breakdown);
  }

  return map;
}

export function effectiveHourlyRateCents(hours: number, amountCents: number): number | null {
  if (hours <= 0 || amountCents <= 0) return null;
  return Math.round(amountCents / hours);
}
