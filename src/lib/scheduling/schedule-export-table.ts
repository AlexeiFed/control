import { coerceToDate, getHoursKhabarovsk } from "../format/display-date";
import { scheduleShiftColumnDateIso } from "./operational-day-timeline";
import { incidentCategoryLabels } from "../operations/status-labels";
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

export function formatScheduleExportCellText(entries: ReadonlyArray<ScheduleExportCellEntry>): string {
  return entries.map((entry) => entry.text).join("\n");
}

function formatDurationRuHours(start: Date, end: Date): string {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  if (!Number.isFinite(rounded) || rounded <= 0) return "0 ч";
  if (rounded === Math.trunc(rounded)) return `${Math.trunc(rounded)} ч`;
  return `${String(rounded).replace(".", ",")} ч`;
}

function formatShiftExportIncidentLine(shift: Shift): string | null {
  if (shift.isNoShow) return "невыход";
  if (shift.incidentRecordedAt && shift.incidentCategory) {
    return incidentCategoryLabels[shift.incidentCategory];
  }
  return null;
}

export function formatShiftExportCell(shift: Shift): string {
  const startsAt = coerceToDate(shift.startsAt);
  const endsAt = coerceToDate(shift.endsAt);
  const duration = formatDurationRuHours(startsAt, endsAt);
  const startH = getHoursKhabarovsk(startsAt);
  const endH = getHoursKhabarovsk(endsAt);
  const time = `${startH}-${endH}`;
  const incident = formatShiftExportIncidentLine(shift);
  return incident ? `${duration}\n${time}\n${incident}` : `${duration}\n${time}`;
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
