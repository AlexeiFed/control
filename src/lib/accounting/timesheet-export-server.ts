import { listTimesheetEntries } from "../accounting/timesheet-entries-repository";
import {
  loadTimesheetOperationalDayContext,
  monthKeysForPayrollMonth,
  padTimesheetQueryRange,
} from "../accounting/timesheet-operational-day";
import { getKhabarovskComponents } from "../format/display-date";
import { listObjectSwitchTabs } from "../operations/objects-repository";
import { dateIsoInPayrollMonth, monthEndKhabarovsk, monthStartKhabarovsk } from "../payroll/advance-period";
import type { TimesheetRow } from "../scheduling/timesheet";

export type ParsedTimesheetExportUrl = {
  guardId: string;
  objectId: string;
  month: { year: number; monthIndex: number } | undefined;
  week: Date | undefined;
  q: string;
  rangeStart: Date;
  rangeEnd: Date;
};

export function parseTimesheetExportUrl(url: URL): ParsedTimesheetExportUrl {
  const guardId = url.searchParams.get("guardId")?.trim() || "";
  const objectId = url.searchParams.get("objectId")?.trim() || "";
  const month = normalizeMonth(url.searchParams.get("month") || "") ?? normalizeMonth(currentMonthKey());
  const week = normalizeWeekStart(url.searchParams.get("week") || "");
  const q = url.searchParams.get("q")?.trim().toLowerCase() || "";

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

  return { guardId, objectId, month, week, q, rangeStart, rangeEnd };
}

export async function getTimesheetRowsForExport(parsed: ParsedTimesheetExportUrl): Promise<{
  rows: TimesheetRow[];
  resolveOperationalDateIso: ((row: TimesheetRow) => string) | undefined;
}> {
  const { guardId, objectId, q, rangeStart, rangeEnd, month, week } = parsed;
  const queryRange =
    month && !week ? padTimesheetQueryRange(rangeStart, rangeEnd) : { start: rangeStart, end: rangeEnd };

  const rowsRaw = await listTimesheetEntries(queryRange.start, queryRange.end, {
    guardId: guardId || undefined,
    objectId: objectId || undefined,
  });

  let resolveOperationalDateIso: ((row: TimesheetRow) => string) | undefined;
  let rows = rowsRaw;

  if (month) {
    const objects = await listObjectSwitchTabs();
    const scoped = objectId ? objects.filter((o) => o.id === objectId) : objects;
    const opDay = await loadTimesheetOperationalDayContext(
      scoped,
      monthKeysForPayrollMonth(month.year, month.monthIndex),
    );
    resolveOperationalDateIso = opDay.resolveRowDateIso;
    if (!week) {
      const monthCtx = { year: month.year, monthIndex0: month.monthIndex };
      rows = rows.filter((row) => dateIsoInPayrollMonth(opDay.resolveRowDateIso(row), monthCtx));
    }
  }

  if (q) {
    rows = rows.filter((row) => `${row.guardName} ${row.objectName}`.toLowerCase().includes(q));
  }

  return { rows, resolveOperationalDateIso };
}

function normalizeMonth(value: string): { year: number; monthIndex: number } | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
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

function normalizeWeekStart(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return undefined;
  const [yearStr, monthStr, dayStr] = trimmed.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  if (!year || !month || !day) return undefined;
  const date = new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+10:00`);
  if (Number.isNaN(date.getTime())) return undefined;
  return date;
}
