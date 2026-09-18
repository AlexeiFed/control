import {
  buildPayrollTuData,
  buildPayrollTuPreview,
  buildPayrollTuSalaryByGuardId,
  dayIncludedInPayrollTu,
  splitPersonsForPayrollTu,
  type PayrollTuDailyEntry,
  type PayrollTuData,
  type PayrollTuEmploymentPeriod,
  type PayrollTuPreview,
} from "./payroll-tu";
import { listTimesheetEntries } from "./timesheet-entries-repository";
import {
  loadTimesheetOperationalDayContext,
  monthKeysForPayrollMonth,
  padTimesheetQueryRange,
} from "./timesheet-operational-day";
import { listGuardPayrollFactsByIds } from "../operations/guards-repository";
import { listProfilePeriodsForGuards } from "../operations/guard-profile-periods-repository";
import { getTimesheetSnapshot } from "../operations/scheduler-repository";
import { dateIsoInPayrollMonth } from "../payroll/advance-period";
import type { TimesheetRow } from "../scheduling/timesheet";

export type PayrollTuExportResult = {
  data: PayrollTuData;
  preview: PayrollTuPreview;
};

export async function buildPayrollTuExportData(input: {
  year: number;
  monthIndex0: number;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<PayrollTuExportResult> {
  const padded = padTimesheetQueryRange(input.rangeStart, input.rangeEnd);
  const [snapshot, timesheetRowsRaw] = await Promise.all([
    getTimesheetSnapshot(padded.start, padded.end),
    listTimesheetEntries(padded.start, padded.end),
  ]);

  const guardIds = snapshot.guards.map((g) => g.id);
  const [payrollFacts, profilePeriods] = await Promise.all([
    listGuardPayrollFactsByIds(guardIds),
    listProfilePeriodsForGuards(guardIds),
  ]);
  const employedOnByGuardId = new Map(
    [...payrollFacts.entries()].map(([id, fact]) => [id, fact.employedOn] as const),
  );
  const dismissedOnByGuardId = new Map(
    [...payrollFacts.entries()].map(([id, fact]) => [id, fact.dismissedOn] as const),
  );
  const employmentPeriodsByGuardId = new Map<string, PayrollTuEmploymentPeriod[]>();
  for (const period of profilePeriods) {
    if (period.periodKind !== "employment") continue;
    const list = employmentPeriodsByGuardId.get(period.guardId) ?? [];
    list.push({
      effectiveFrom: period.effectiveFrom,
      effectiveTo: period.effectiveTo,
      employmentType: period.employmentType,
    });
    employmentPeriodsByGuardId.set(period.guardId, list);
  }
  const opDay = await loadTimesheetOperationalDayContext(
    snapshot.objects,
    monthKeysForPayrollMonth(input.year, input.monthIndex0),
  );
  const month = { year: input.year, monthIndex0: input.monthIndex0 };
  const timesheetRows = timesheetRowsRaw.filter((row) =>
    dateIsoInPayrollMonth(opDay.resolveRowDateIso(row), month),
  );

  const resolvedGuards = snapshot.guards.map((guard) => ({
    id: guard.id,
    name: guard.name,
    position: guard.position,
    employmentType: guard.employmentType,
    employedOn: employedOnByGuardId.get(guard.id) ?? null,
    dismissedOn: payrollFacts.get(guard.id)?.dismissedOn ?? null,
    status: guard.status,
    employmentPeriods: employmentPeriodsByGuardId.get(guard.id) ?? [],
  }));

  const { office, guards } = splitPersonsForPayrollTu({
    guards: resolvedGuards,
    year: input.year,
    monthIndex0: input.monthIndex0,
  });

  const guardIdByName = new Map(resolvedGuards.map((g) => [g.name, g.id] as const));
  const includedGuardIds = new Set(
    [...office, ...guards]
      .map((person) => guardIdByName.get(person.name))
      .filter((id): id is string => Boolean(id)),
  );

  const guardDailyById = aggregateGuardDailyTotalsFromRows(
    timesheetRows,
    guardIdByName,
    employedOnByGuardId,
    dismissedOnByGuardId,
    month,
    opDay.resolveRowDateIso,
  );
  const salaryByGuardId = buildPayrollTuSalaryByGuardId({
    rows: timesheetRows,
    guardIdByName,
    employedOnByGuardId,
    dismissedOnByGuardId,
    month,
    includedGuardIds,
    resolveOperationalDateIso: opDay.resolveRowDateIso,
  });

  const attachPersonData = (person: {
    name: string;
    employedOn?: string | null;
    status?: (typeof resolvedGuards)[number]["status"];
  }) => {
    const guardId = resolvedGuards.find((g) => g.name === person.name)?.id;
    const salary = guardId ? salaryByGuardId.get(guardId) : undefined;
    return {
      ...person,
      daily: guardId ? guardDailyById.get(guardId) ?? [] : [],
      salaryFirstHalfRub: salary?.firstHalfRub ?? 0,
      salarySecondHalfRub: salary?.secondHalfRub ?? 0,
    };
  };

  const data = buildPayrollTuData({
    year: input.year,
    monthIndex0: input.monthIndex0,
    office: office.map(attachPersonData),
    guards: guards.map(attachPersonData),
  });

  return {
    data,
    preview: buildPayrollTuPreview(data),
  };
}

function aggregateGuardDailyTotalsFromRows(
  rows: TimesheetRow[],
  guardIdByName: Map<string, string>,
  employedOnByGuardId: Map<string, string | null | undefined>,
  dismissedOnByGuardId: Map<string, string | null | undefined>,
  month: { year: number; monthIndex0: number },
  resolveOperationalDateIso: (row: TimesheetRow) => string,
): Map<string, PayrollTuDailyEntry[]> {
  const byGuard = new Map<string, PayrollTuDailyEntry[]>();
  for (const row of rows) {
    const guardId = guardIdByName.get(row.guardName);
    if (!guardId) continue;
    const dateIso = resolveOperationalDateIso(row);
    if (!dateIsoInPayrollMonth(dateIso, month)) continue;
    const day = Number(dateIso.slice(8, 10));
    if (!Number.isFinite(day)) continue;
    const employedOn = employedOnByGuardId.get(guardId);
    const dismissedOn = dismissedOnByGuardId.get(guardId);
    if (!dayIncludedInPayrollTu(day, employedOn, month.year, month.monthIndex0, dismissedOn)) continue;

    const bucket = byGuard.get(guardId) ?? [];
    const existing = bucket.find((entry) => entry.day === day);
    if (existing) {
      existing.hours = round2(existing.hours + row.totalHours);
    } else {
      bucket.push({ day, hours: row.totalHours });
    }
    byGuard.set(guardId, bucket);
  }
  return byGuard;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
