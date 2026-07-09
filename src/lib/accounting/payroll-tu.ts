import { formatDisplayDateFromIso, getDaysInMonth } from "../format/display-date";
import {
  dayOfMonthInZone,
  shiftBelongsToHalf,
  shiftStartsInPayrollMonth,
  type PayrollMonthContext,
} from "../payroll/advance-period";
import type { TimesheetRow } from "../scheduling/timesheet";
import type { Guard, GuardEmploymentType, GuardPosition } from "../scheduling/types";

export type PayrollTuDayCell = {
  hours: number;
  text?: string;
};

export type PayrollTuRow = {
  name: string;
  employedOn?: string | null;
  days: Map<number, PayrollTuDayCell>;
  workDaysCount: number;
  salaryFirstHalfRub: number;
  salarySecondHalfRub: number;
  totalHours: number;
};

export type PayrollTuData = {
  year: number;
  monthIndex0: number;
  officeRows: PayrollTuRow[];
  guardRows: PayrollTuRow[];
};

export type PayrollTuPeriod = "first" | "second" | "month";

export const PAYROLL_TU_PERIODS = ["first", "second", "month"] as const satisfies readonly PayrollTuPeriod[];

export type PayrollTuPreview = {
  firstHalfTotalRub: number;
  monthTotalRub: number;
  secondHalfTotalRub: number;
  peopleCount: number;
};

export type PayrollTuDailyEntry = {
  day: number;
  hours: number;
};

export type PayrollTuPersonInput = {
  name: string;
  daily: PayrollTuDailyEntry[];
  salaryFirstHalfRub?: number;
  salarySecondHalfRub?: number;
  employedOn?: string | null;
  status?: Guard["status"];
};

export function dayIncludedInPayrollTu(
  day: number,
  employedOn: string | null | undefined,
  year: number,
  monthIndex0: number,
): boolean {
  if (!employedOn) return true;
  const monthKey = monthKeyFromParts(year, monthIndex0);
  if (!employedOn.startsWith(monthKey)) return true;
  const employedDay = Number(employedOn.slice(8, 10));
  return Number.isFinite(employedDay) ? day >= employedDay : true;
}

export function shiftIncludedInPayrollTu(
  startsAt: string,
  employedOn: string | null | undefined,
  month: PayrollMonthContext,
): boolean {
  if (!shiftStartsInPayrollMonth(startsAt, month)) return false;
  return dayIncludedInPayrollTu(dayOfMonthInZone(startsAt), employedOn, month.year, month.monthIndex0);
}

/** Суммы 1–15 и 16–30 из guard_amount_cents табеля — как в сводке табеля, без усреднений. */
export function buildPayrollTuSalaryByGuardId(input: {
  rows: TimesheetRow[];
  guardIdByName: Map<string, string>;
  employedOnByGuardId: Map<string, string | null | undefined>;
  month: PayrollMonthContext;
  includedGuardIds: ReadonlySet<string>;
}): Map<string, { firstHalfRub: number; secondHalfRub: number }> {
  const centsByGuard = new Map<string, { first: number; second: number }>();

  for (const row of input.rows) {
    const guardId = input.guardIdByName.get(row.guardName);
    if (!guardId || !input.includedGuardIds.has(guardId)) continue;

    const employedOn = input.employedOnByGuardId.get(guardId);
    if (!shiftIncludedInPayrollTu(row.startsAt, employedOn, input.month)) continue;

    const bucket = centsByGuard.get(guardId) ?? { first: 0, second: 0 };
    if (shiftBelongsToHalf(row.startsAt, "first", input.month)) {
      bucket.first += row.guardAmountCents;
    } else if (shiftBelongsToHalf(row.startsAt, "second", input.month)) {
      bucket.second += row.guardAmountCents;
    }
    centsByGuard.set(guardId, bucket);
  }

  const result = new Map<string, { firstHalfRub: number; secondHalfRub: number }>();
  for (const [guardId, totals] of centsByGuard) {
    result.set(guardId, {
      firstHalfRub: roundRub(totals.first / 100),
      secondHalfRub: roundRub(totals.second / 100),
    });
  }
  return result;
}

export function isEmployedAtMonth(
  employmentType: GuardEmploymentType,
  employedOn: string | null | undefined,
  year: number,
  monthIndex0: number,
): boolean {
  const monthKey = monthKeyFromParts(year, monthIndex0);
  const monthEndDay = getDaysInMonth(year, monthIndex0);
  const monthEndIso = `${monthKey}-${String(monthEndDay).padStart(2, "0")}`;

  if (employedOn) {
    if (employedOn > monthEndIso) return false;
    return true;
  }

  return employmentType === "Employed";
}

/** Включать строку в выгрузку за конкретную половину месяца. */
export function isIncludedInPayrollTuPeriod(
  employedOn: string | null | undefined,
  period: PayrollTuPeriod,
  year: number,
  monthIndex0: number,
): boolean {
  if (period === "month") return true;
  if (!employedOn) return true;

  const monthKey = monthKeyFromParts(year, monthIndex0);
  if (!employedOn.startsWith(monthKey)) return true;

  const employedDay = Number(employedOn.slice(8, 10));
  if (period === "first" && employedDay >= 16) return false;
  return true;
}

function employedDayInMonth(
  employedOn: string | null | undefined,
  year: number,
  monthIndex0: number,
): number | null {
  if (!employedOn) return null;
  const monthKey = monthKeyFromParts(year, monthIndex0);
  if (!employedOn.startsWith(monthKey)) return null;
  const day = Number(employedOn.slice(8, 10));
  return Number.isFinite(day) && day >= 1 ? day : null;
}

export function splitPersonsForPayrollTu(input: {
  guards: ReadonlyArray<{
    id: string;
    name: string;
    position: GuardPosition;
    employmentType: GuardEmploymentType;
    employedOn?: string | null;
    status: Guard["status"];
  }>;
  year: number;
  monthIndex0: number;
}): {
  office: PayrollTuPersonInput[];
  guards: PayrollTuPersonInput[];
} {
  const office: PayrollTuPersonInput[] = [];
  const guardRows: PayrollTuPersonInput[] = [];

  for (const person of input.guards) {
    if (!isEmployedAtMonth(person.employmentType, person.employedOn, input.year, input.monthIndex0)) {
      continue;
    }
    const row: PayrollTuPersonInput = {
      name: person.name,
      daily: [],
      employedOn: person.employedOn,
      status: person.status,
    };
    if (person.position === "Curator") {
      office.push(row);
    } else {
      guardRows.push(row);
    }
  }

  const byName = (a: PayrollTuPersonInput, b: PayrollTuPersonInput) =>
    a.name.localeCompare(b.name, "ru-RU");

  return {
    office: office.sort(byName),
    guards: guardRows.sort(byName),
  };
}

export function buildPayrollTuRow(
  person: PayrollTuPersonInput,
  year: number,
  monthIndex0: number,
): PayrollTuRow {
  const daysInMonth = getDaysInMonth(year, monthIndex0);
  const employedOn = person.employedOn?.slice(0, 10) ?? null;
  const employedDay = employedDayInMonth(employedOn, year, monthIndex0);
  const days = new Map<number, PayrollTuDayCell>();
  let totalHours = 0;
  let workDaysCount = 0;

  for (const entry of person.daily) {
    if (entry.day < 1 || entry.day > daysInMonth) continue;
    if (employedDay != null && entry.day < employedDay) continue;

    if (entry.hours > 0) {
      totalHours = round2(totalHours + entry.hours);
      workDaysCount += 1;
      const existing = days.get(entry.day);
      if (existing) {
        days.set(entry.day, {
          hours: round2(existing.hours + entry.hours),
          text: existing.text,
        });
      } else {
        days.set(entry.day, { hours: entry.hours });
      }
    }
  }

  if (employedDay != null && employedDay > 1) {
    const note = `устроен с ${formatDisplayDateFromIso(employedOn!)}`;
    for (let day = 1; day < employedDay; day++) {
      days.set(day, { hours: 0, text: note });
    }
  }

  if (person.status === "Sick") {
    for (let day = 1; day <= daysInMonth; day++) {
      const existing = days.get(day);
      if (existing && (existing.hours > 0 || existing.text)) continue;
      days.set(day, { hours: 0, text: "больничный" });
    }
  }

  if (person.status === "OnVacation") {
    for (let day = 1; day <= daysInMonth; day++) {
      const existing = days.get(day);
      if (existing && (existing.hours > 0 || existing.text)) continue;
      days.set(day, { hours: 0, text: "отпуск" });
    }
  }

  return {
    name: person.name,
    employedOn,
    days,
    workDaysCount,
    salaryFirstHalfRub: roundRub(person.salaryFirstHalfRub ?? 0),
    salarySecondHalfRub: roundRub(person.salarySecondHalfRub ?? 0),
    totalHours: round2(totalHours),
  };
}

export function buildPayrollTuData(input: {
  year: number;
  monthIndex0: number;
  office: PayrollTuPersonInput[];
  guards: PayrollTuPersonInput[];
}): PayrollTuData {
  return {
    year: input.year,
    monthIndex0: input.monthIndex0,
    officeRows: input.office.map((person) => buildPayrollTuRow(person, input.year, input.monthIndex0)),
    guardRows: input.guards.map((person) => buildPayrollTuRow(person, input.year, input.monthIndex0)),
  };
}

export function slicePayrollTuDataForPeriod(data: PayrollTuData, period: PayrollTuPeriod): PayrollTuData {
  if (period === "month") return data;
  const filterRows = (rows: PayrollTuRow[]) =>
    rows
      .filter((row) => isIncludedInPayrollTuPeriod(row.employedOn, period, data.year, data.monthIndex0))
      .map((row) => filterPayrollTuRowForPeriod(row, period, data.year, data.monthIndex0));

  return {
    year: data.year,
    monthIndex0: data.monthIndex0,
    officeRows: filterRows(data.officeRows),
    guardRows: filterRows(data.guardRows),
  };
}

export function filterPayrollTuRowForPeriod(
  row: PayrollTuRow,
  period: PayrollTuPeriod,
  year: number,
  monthIndex0: number,
): PayrollTuRow {
  if (period === "month") return row;

  const daysInMonth = getDaysInMonth(year, monthIndex0);
  const dayFrom = period === "first" ? 1 : 16;
  const dayTo = period === "first" ? 15 : daysInMonth;
  const days = new Map<number, PayrollTuDayCell>();
  let totalHours = 0;
  let workDaysCount = 0;

  for (let day = dayFrom; day <= dayTo; day++) {
    const cell = row.days.get(day);
    if (!cell) continue;
    days.set(day, cell);
    if (cell.hours > 0) {
      totalHours = round2(totalHours + cell.hours);
      workDaysCount += 1;
    }
  }

  return {
    name: row.name,
    employedOn: row.employedOn,
    days,
    workDaysCount,
    salaryFirstHalfRub: period === "second" ? 0 : row.salaryFirstHalfRub,
    salarySecondHalfRub: period === "first" ? 0 : row.salarySecondHalfRub,
    totalHours: round2(totalHours),
  };
}

export type PayrollTuDaySegment =
  | { kind: "hours"; day: number; hours: number }
  | { kind: "note"; fromDay: number; toDay: number; label: string };

/** Группирует подряд идущие текстовые пометки (больничный, отпуск и т.д.) для объединения ячеек в Excel. */
export function collectPayrollTuDaySegments(
  row: PayrollTuRow,
  dayFrom: number,
  dayTo: number,
): PayrollTuDaySegment[] {
  const segments: PayrollTuDaySegment[] = [];
  let day = dayFrom;

  while (day <= dayTo) {
    const cell = row.days.get(day);
    if (cell?.text && cell.hours <= 0) {
      const rawText = cell.text;
      let endDay = day;
      while (endDay + 1 <= dayTo) {
        const next = row.days.get(endDay + 1);
        if (!next?.text || next.hours > 0 || next.text !== rawText) break;
        endDay += 1;
      }
      segments.push({
        kind: "note",
        fromDay: day,
        toDay: endDay,
        label: formatPayrollTuNoteLabel(rawText, day, endDay),
      });
      day = endDay + 1;
      continue;
    }

    if (cell && cell.hours > 0) {
      segments.push({ kind: "hours", day, hours: cell.hours });
    }
    day += 1;
  }

  return segments;
}

export function formatPayrollTuNoteLabel(rawText: string, fromDay: number, toDay: number): string {
  const normalized = rawText.trim();
  if (/больничн/i.test(normalized)) {
    return fromDay === toDay ? `больничный с ${fromDay}` : `больничный с ${fromDay} по ${toDay}`;
  }
  if (/отпуск/i.test(normalized)) {
    return fromDay === toDay ? `отпуск с ${fromDay}` : `отпуск с ${fromDay} по ${toDay}`;
  }
  if (normalized.startsWith("устроен")) return normalized;
  const base = normalized.replace(/^НА\s+/i, "").toLowerCase();
  return fromDay === toDay ? base : `${base} с ${fromDay} по ${toDay}`;
}

export function isPayrollTuSickNoteLabel(label: string): boolean {
  return /больничн/i.test(label);
}

export function isPayrollTuVacationNoteLabel(label: string): boolean {
  return /отпуск/i.test(label);
}

export function isPayrollTuEmploymentNoteLabel(label: string): boolean {
  return /^устроен/i.test(label.trim());
}

export function payrollTuPeriodLabelRu(period: PayrollTuPeriod, year: number, monthIndex0: number): string {
  if (period === "month") return "За весь месяц";
  const lastDay = getDaysInMonth(year, monthIndex0);
  return period === "first" ? "с 1 по 15" : `с 16 по ${lastDay}`;
}

export function buildPayrollTuPreview(data: PayrollTuData): PayrollTuPreview {
  const rows = [...data.officeRows, ...data.guardRows];
  let firstHalfTotalRub = 0;
  let monthTotalRub = 0;

  for (const row of rows) {
    firstHalfTotalRub += row.salaryFirstHalfRub;
    monthTotalRub += row.salaryFirstHalfRub + row.salarySecondHalfRub;
  }

  return {
    firstHalfTotalRub: roundRub(firstHalfTotalRub),
    monthTotalRub: roundRub(monthTotalRub),
    secondHalfTotalRub: roundRub(monthTotalRub - firstHalfTotalRub),
    peopleCount: rows.length,
  };
}

function monthKeyFromParts(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRub(value: number): number {
  return Math.round(value * 100) / 100;
}
