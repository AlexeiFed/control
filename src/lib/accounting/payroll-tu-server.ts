import {
  buildPayrollTuData,
  buildPayrollTuPreview,
  buildPayrollTuSalaryByGuardId,
  dayIncludedInPayrollTu,
  splitPersonsForPayrollTu,
  type PayrollTuDailyEntry,
  type PayrollTuData,
  type PayrollTuPreview,
} from "./payroll-tu";
import {
  listTimesheetEntries,
  listTimesheetGuardDailyTotals,
} from "./timesheet-entries-repository";
import { listGuardEmployedOnByIds } from "../operations/guards-repository";
import { getTimesheetSnapshot } from "../operations/scheduler-repository";

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
  const [snapshot, guardDailyTotals, timesheetRows] = await Promise.all([
    getTimesheetSnapshot(input.rangeStart, input.rangeEnd),
    listTimesheetGuardDailyTotals(input.rangeStart, input.rangeEnd),
    listTimesheetEntries(input.rangeStart, input.rangeEnd),
  ]);

  const employedOnByGuardId = await listGuardEmployedOnByIds(snapshot.guards.map((g) => g.id));

  const resolvedGuards = snapshot.guards.map((guard) => ({
    id: guard.id,
    name: guard.name,
    position: guard.position,
    employmentType: guard.employmentType,
    employedOn: employedOnByGuardId.get(guard.id) ?? null,
    status: guard.status,
  }));

  const { office, guards } = splitPersonsForPayrollTu({
    guards: resolvedGuards,
    year: input.year,
    monthIndex0: input.monthIndex0,
  });

  const guardIdByName = new Map(resolvedGuards.map((g) => [g.name, g.id] as const));
  const includedGuardIds = new Set([...office, ...guards].map((person) => guardIdByName.get(person.name)).filter(Boolean) as string[]);

  const guardDailyById = aggregateGuardDailyTotals(
    guardDailyTotals,
    employedOnByGuardId,
    input.year,
    input.monthIndex0,
  );
  const salaryByGuardId = buildPayrollTuSalaryByGuardId({
    rows: timesheetRows,
    guardIdByName,
    employedOnByGuardId,
    month: { year: input.year, monthIndex0: input.monthIndex0 },
    includedGuardIds,
  });

  const attachPersonData = (person: { name: string; employedOn?: string | null; status?: typeof resolvedGuards[number]["status"] }) => {
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

function aggregateGuardDailyTotals(
  rows: Awaited<ReturnType<typeof listTimesheetGuardDailyTotals>>,
  employedOnByGuardId: Map<string, string | null | undefined>,
  year: number,
  monthIndex0: number,
): Map<string, PayrollTuDailyEntry[]> {
  const byGuard = new Map<string, PayrollTuDailyEntry[]>();
  for (const row of rows) {
    const day = Number(row.workDate.slice(8, 10));
    if (!Number.isFinite(day)) continue;
    const employedOn = employedOnByGuardId.get(row.guardId);
    if (!dayIncludedInPayrollTu(day, employedOn, year, monthIndex0)) continue;

    const bucket = byGuard.get(row.guardId) ?? [];
    const existing = bucket.find((entry) => entry.day === day);
    if (existing) {
      existing.hours = round2(existing.hours + row.totalHours);
    } else {
      bucket.push({ day, hours: row.totalHours });
    }
    byGuard.set(row.guardId, bucket);
  }
  return byGuard;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
