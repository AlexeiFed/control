import { coerceToDate, getHoursKhabarovsk } from "../format/display-date";
import { scheduleShiftColumnDateIso } from "./operational-day-timeline";
import { incidentCategoryLabels } from "../operations/status-labels";
import { isFullNoShow, isPartialAttendance, partialAttendanceWindow } from "./shift-attendance";
import type { Shift, ShiftKind } from "./types";
import type { ScheduleExportDayColumn } from "./schedule-export-periods";

export type ScheduleExportGuardRow = {
  guardId: string;
  displayName: string;
};

export type ScheduleExportCellEntry = {
  text: string;
  shiftKind: ShiftKind;
  isNoShow: boolean;
};

export type ScheduleExportTable = {
  title: string;
  guards: ScheduleExportGuardRow[];
  dayColumns: ScheduleExportDayColumn[];
  cells: Record<string, Record<string, ScheduleExportCellEntry[]>>;
};

export const SCHEDULE_EXPORT_BASE_ROW_HEIGHT = 52;
export const SCHEDULE_EXPORT_COMPACT_BLOCK_HEIGHT = 20;
export const SCHEDULE_EXPORT_FULL_BLOCK_HEIGHT = 36;

/** Одна строка на смену, если в ячейке больше одной — иначе двухстрочный блок. */
export function formatScheduleExportEntryDisplayText(
  entry: ScheduleExportCellEntry,
  multiShiftInCell: boolean,
): string {
  if (!multiShiftInCell) return entry.text;
  return entry.text.split("\n").filter(Boolean).join(" ");
}

export function formatScheduleExportCellText(entries: ReadonlyArray<ScheduleExportCellEntry>): string {
  const multi = entries.length > 1;
  return entries.map((entry) => formatScheduleExportEntryDisplayText(entry, multi)).join("\n");
}

export function maxScheduleExportEntriesInRow(
  table: ScheduleExportTable,
  guardId: string,
): number {
  let maxEntries = 0;
  for (const col of table.dayColumns) {
    const count = table.cells[guardId]?.[col.dateIso]?.length ?? 0;
    if (count > maxEntries) maxEntries = count;
  }
  return maxEntries;
}

export function computeScheduleExportRowHeight(maxEntriesInRow: number): number {
  if (maxEntriesInRow <= 1) return SCHEDULE_EXPORT_BASE_ROW_HEIGHT;
  return Math.max(
    SCHEDULE_EXPORT_BASE_ROW_HEIGHT,
    maxEntriesInRow * SCHEDULE_EXPORT_COMPACT_BLOCK_HEIGHT + 8,
  );
}

export function computeScheduleExportRowHeights(table: ScheduleExportTable): number[] {
  return table.guards.map((guard) =>
    computeScheduleExportRowHeight(maxScheduleExportEntriesInRow(table, guard.guardId)),
  );
}

function formatDurationRuHours(start: Date, end: Date): string {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  if (!Number.isFinite(rounded) || rounded <= 0) return "0 ч";
  if (rounded === Math.trunc(rounded)) return `${Math.trunc(rounded)} ч`;
  return `${String(rounded).replace(".", ",")} ч`;
}

function formatShiftExportIncidentLine(shift: Shift): string | null {
  if (isFullNoShow(shift)) return "невыход";
  if (isPartialAttendance(shift) && shift.incidentCategory) {
    return incidentCategoryLabels[shift.incidentCategory];
  }
  if (shift.incidentRecordedAt && shift.incidentCategory) {
    return incidentCategoryLabels[shift.incidentCategory];
  }
  return null;
}

export function formatShiftExportCell(shift: Shift): string {
  const startsAt = coerceToDate(shift.startsAt);
  const endsAt = coerceToDate(shift.endsAt);
  const worked = partialAttendanceWindow(shift);
  const displayStart = worked?.start ?? startsAt;
  const displayEnd = worked?.end ?? endsAt;
  const duration = formatDurationRuHours(displayStart, displayEnd);
  const time = `${getHoursKhabarovsk(displayStart)}-${getHoursKhabarovsk(displayEnd)}`;
  const lines = [duration, time];
  if (worked && worked.end.getTime() < endsAt.getTime()) {
    lines.push(`${getHoursKhabarovsk(worked.end)}-${getHoursKhabarovsk(endsAt)} пропуск`);
  }
  const incident = formatShiftExportIncidentLine(shift);
  if (incident) lines.push(incident);
  return lines.join("\n");
}

export function buildScheduleExportTable(
  title: string,
  guards: ScheduleExportGuardRow[],
  dayColumns: ScheduleExportDayColumn[],
  shifts: Shift[],
  operationalDayStartTime: string,
): ScheduleExportTable {
  const cells: Record<string, Record<string, ScheduleExportCellEntry[]>> = {};
  const dateIsoSet = new Set(dayColumns.map((c) => c.dateIso));

  for (const guard of guards) {
    cells[guard.guardId] = {};
    for (const col of dayColumns) {
      cells[guard.guardId]![col.dateIso] = [];
    }
  }

  for (const shift of shifts) {
    const key = scheduleShiftColumnDateIso(shift, operationalDayStartTime);
    if (!dateIsoSet.has(key)) continue;

    const guardCells = cells[shift.guardId];
    if (!guardCells) continue;

    guardCells[key]!.push({
      text: formatShiftExportCell(shift),
      shiftKind: shift.shiftKind,
      isNoShow: shift.isNoShow === true,
    });
  }

  return { title, guards, dayColumns, cells };
}
