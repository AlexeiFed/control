import { TimesheetView } from "../../../components/accounting/timesheet-view";
import { assertPermission, hasPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import {
  listTimesheetEntries,
  listTimesheetFilterOptions,
} from "../../../lib/accounting/timesheet-entries-repository";
import { sumAdvancesByGuardForMonth } from "../../../lib/operations/advances-repository";
import {
  buildGuardPayrollHalfSummaries,
  buildObjectPayrollHalfSummaries,
  payrollHalfSummaryByGuardName,
} from "../../../lib/payroll/timesheet-payroll-summary";
import { monthEndKhabarovsk, monthStartKhabarovsk } from "../../../lib/payroll/advance-period";
import { getKhabarovskComponents } from "../../../lib/format/display-date";
import { buildGuardPayrollHalfBreakdownByName } from "../../../lib/payroll/timesheet-guard-profile-segments";
import {
  buildGuardProfileResolver,
  listProfilePeriodsForGuards,
} from "../../../lib/operations/guard-profile-periods-repository";
import { listGuardsByIds } from "../../../lib/operations/guards-repository";

type TimesheetPageProps = {
  searchParams?: Promise<{
    guardId?: string;
    objectId?: string;
    month?: string;
    week?: string;
    q?: string;
    unpriced?: string;
  }>;
};

export default async function TimesheetPage({ searchParams }: TimesheetPageProps) {
  const session = await requireSession();
  assertPermission(session.user.role, "timesheet:read");
  assertPermission(session.user.role, "holidays:read");

  const filters = (await searchParams) ?? {};
  const guardId = filters.guardId?.trim() ? filters.guardId.trim() : undefined;
  const objectId = filters.objectId?.trim() ? filters.objectId.trim() : undefined;
  const unpricedOnly = filters.unpriced === "1";

  const month = normalizeMonth(filters.month) ?? normalizeMonth(currentMonthKey());
  const week = normalizeWeekStart(filters.week);
  const rangeStart = week
    ? week
    : month
      ? monthStartKhabarovsk(month.year, month.monthIndex)
      : new Date(0);
  const rangeEnd = week
    ? new Date(week.getTime() + 7 * 24 * 60 * 60_000)
    : month
      ? monthEndKhabarovsk(month.year, month.monthIndex)
      : new Date();

  const [rowsRaw, filterOptions] = await Promise.all([
    listTimesheetEntries(rangeStart, rangeEnd, { guardId, objectId }),
    listTimesheetFilterOptions(),
  ]);

  const query = filters.q?.trim().toLowerCase() ?? "";
  let rows = query
    ? rowsRaw.filter((row) => {
        const haystack = `${row.guardName} ${row.objectName}`.toLowerCase();
        return haystack.includes(query);
      })
    : rowsRaw;
  if (unpricedOnly) {
    rows = rows.filter((row) => row.unpriced);
  }

  const showPayrollHalves =
    !!month &&
    hasPermission(session.user.role, "timesheet:read") &&
    hasPermission(session.user.role, "advances:read");

  let payrollHalfByGuardName: ReturnType<typeof payrollHalfSummaryByGuardName> | undefined;
  let objectPayrollHalves: ReturnType<typeof buildObjectPayrollHalfSummaries> | undefined;
  if (showPayrollHalves && month) {
    const advancesByGuardId = await sumAdvancesByGuardForMonth(month.year, month.monthIndex);
    const guardIdByName = new Map(filterOptions.guards.map((g) => [g.name, g.id] as const));
    const payrollRows = unpricedOnly ? rows : rowsRaw;
    const summaries = buildGuardPayrollHalfSummaries({
      rows: payrollRows,
      guardIdByName,
      advancesByGuardId,
      month: { year: month.year, monthIndex0: month.monthIndex },
    });
    payrollHalfByGuardName = payrollHalfSummaryByGuardName(summaries);
    objectPayrollHalves = buildObjectPayrollHalfSummaries(payrollRows, {
      year: month.year,
      monthIndex0: month.monthIndex,
    });
  }

  let guardPayrollHalfBreakdownByName: ReturnType<typeof buildGuardPayrollHalfBreakdownByName> | undefined;
  if (objectId && month) {
    const guardIdByName = new Map(filterOptions.guards.map((g) => [g.name, g.id] as const));
    const guardIds = [
      ...new Set(
        rows
          .map((row) => guardIdByName.get(row.guardName))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (guardIds.length > 0) {
      const [profileResolver, guards, periods] = await Promise.all([
        buildGuardProfileResolver(guardIds),
        listGuardsByIds(guardIds),
        listProfilePeriodsForGuards(guardIds),
      ]);
      const guardsById = new Map(guards.map((guard) => [guard.id, guard] as const));
      guardPayrollHalfBreakdownByName = buildGuardPayrollHalfBreakdownByName({
        rows,
        month: { year: month.year, monthIndex0: month.monthIndex },
        guardIdByName,
        guardsById,
        profileResolver,
        periods,
      });
    }
  }

  return (
    <main className="min-h-screen bg-app-bg p-3 text-app-text sm:p-6">
      <TimesheetView
        rows={rows}
        currentRole={session.user.role}
        guardOptions={filterOptions.guards}
        objectOptions={filterOptions.objects}
        filters={{
          ...filters,
          month: month ? `${month.year}-${String(month.monthIndex + 1).padStart(2, "0")}` : filters.month,
        }}
        payrollHalfByGuardName={payrollHalfByGuardName}
        payrollHalfMonth={month ? { year: month.year, monthIndex0: month.monthIndex } : undefined}
        objectPayrollHalves={objectPayrollHalves}
        guardPayrollHalfBreakdownByName={guardPayrollHalfBreakdownByName}
      />
    </main>
  );
}

function normalizeMonth(value?: string): { year: number; monthIndex: number } | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return undefined;
  const [yearStr, monthStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return undefined;
  if (month < 1 || month > 12) return undefined;
  return { year, monthIndex: month - 1 };
}

function currentMonthKey(): string {
  const kh = getKhabarovskComponents(new Date());
  return `${kh.year}-${String(kh.month0 + 1).padStart(2, "0")}`;
}

function normalizeWeekStart(value?: string): Date | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const [year, month, day] = trimmed.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+10:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}
