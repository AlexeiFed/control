import { addDaysToIsoDate, formatDisplayDateFromIso, getHoursKhabarovsk } from "../format/display-date";
import {
  DEFAULT_OPERATIONAL_DAY_START_TIME,
  scheduleShiftColumnDateIso,
} from "./operational-day-timeline";

type NeighborShiftLike = {
  guardId: string;
  objectId: string;
  startsAt: Date;
  endsAt: Date;
  isNoShow?: boolean;
};

export type NeighborDayShiftInfo = {
  objectId: string;
  objectName: string;
  timeRange: string;
  dateIso: string;
  /** Длительность смены в часах (для подписи «сутки»). */
  durationHours: number;
};

export type NeighborDayShifts = {
  prev: NeighborDayShiftInfo | null;
  next: NeighborDayShiftInfo | null;
};

export type NeighborDayShiftsOptions = {
  operationalDayStartTime?: string;
  anchorByObjectId?: ReadonlyMap<string, string>;
};

function anchorForShift(shift: NeighborShiftLike, options: NeighborDayShiftsOptions): string {
  return (
    options.anchorByObjectId?.get(shift.objectId) ??
    options.operationalDayStartTime ??
    DEFAULT_OPERATIONAL_DAY_START_TIME
  );
}

function isSutkiShift(info: NeighborDayShiftInfo): boolean {
  if (info.durationHours >= 20) return true;
  const [startH, endH] = info.timeRange.split("-");
  return Boolean(startH && endH && startH === endH && info.durationHours >= 12);
}

function summarizeShiftsOnOperationalDay(
  guardId: string,
  columnDateIso: string,
  shifts: ReadonlyArray<NeighborShiftLike>,
  objectNameById: ReadonlyMap<string, string>,
  options: NeighborDayShiftsOptions,
): NeighborDayShiftInfo | null {
  const dayShifts = shifts.filter((shift) => {
    if (shift.guardId !== guardId || shift.isNoShow === true) return false;
    return scheduleShiftColumnDateIso(shift, anchorForShift(shift, options)) === columnDateIso;
  });
  if (dayShifts.length === 0) return null;

  dayShifts.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const primary = dayShifts[0]!;
  const durationHours =
    Math.round(((primary.endsAt.getTime() - primary.startsAt.getTime()) / 3_600_000) * 10) / 10;
  const extra = dayShifts.length > 1 ? ` +${dayShifts.length - 1}` : "";
  return {
    objectId: primary.objectId,
    objectName: objectNameById.get(primary.objectId) ?? "объект",
    timeRange: `${getHoursKhabarovsk(primary.startsAt)}-${getHoursKhabarovsk(primary.endsAt)}${extra}`,
    dateIso: columnDateIso,
    durationHours,
  };
}

/** Смены в операционные сутки до и после дня назначения. */
export function getNeighborDayShifts(
  guardId: string,
  assignmentDateIso: string,
  shifts: ReadonlyArray<NeighborShiftLike>,
  objectNameById: ReadonlyMap<string, string>,
  options: NeighborDayShiftsOptions = {},
): NeighborDayShifts {
  const prevIso = addDaysToIsoDate(assignmentDateIso, -1);
  const nextIso = addDaysToIsoDate(assignmentDateIso, 1);
  return {
    prev: summarizeShiftsOnOperationalDay(guardId, prevIso, shifts, objectNameById, options),
    next: summarizeShiftsOnOperationalDay(guardId, nextIso, shifts, objectNameById, options),
  };
}

function formatNeighborPart(info: NeighborDayShiftInfo): string {
  const dateLabel = formatDisplayDateFromIso(info.dateIso).slice(0, 5);
  const when = isSutkiShift(info) ? `${dateLabel} сутки` : `${dateLabel} ${info.timeRange}`;
  return `${when} «${info.objectName}»`;
}

/** Справа от ФИО: «12.07 сутки «Объект» · 15.07 10-22 «Объект»». */
export function formatNeighborDayShiftsHint(neighbors: NeighborDayShifts): string {
  const parts: string[] = [];
  if (neighbors.prev) parts.push(formatNeighborPart(neighbors.prev));
  if (neighbors.next) parts.push(formatNeighborPart(neighbors.next));
  return parts.join(" · ");
}

export function hasNeighborDayShifts(neighbors: NeighborDayShifts): boolean {
  return neighbors.prev != null || neighbors.next != null;
}
