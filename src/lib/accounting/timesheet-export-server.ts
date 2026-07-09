import { listTimesheetEntries } from "../accounting/timesheet-entries-repository";
import type { TimesheetRow } from "../scheduling/timesheet";
import { getKhabarovskComponents } from "../format/display-date";
import { monthEndKhabarovsk, monthStartKhabarovsk } from "../payroll/advance-period";

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

export async function getTimesheetRowsForExport(parsed: ParsedTimesheetExportUrl): Promise<TimesheetRow[]> {
  const { guardId, objectId, q, rangeStart, rangeEnd } = parsed;
  const rowsRaw = await listTimesheetEntries(rangeStart, rangeEnd, {
    guardId: guardId || undefined,
    objectId: objectId || undefined,
  });

  return q
    ? rowsRaw.filter((row) => `${row.guardName} ${row.objectName}`.toLowerCase().includes(q))
    : rowsRaw;
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
