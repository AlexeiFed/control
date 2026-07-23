import { billableShiftMinutes, billableShiftWindow } from "../rates/rate-calculator";
import type { Shift } from "./types";

/** Часы покрытия поста: полная смена или отработанный фрагмент при частичном невыходе. */
export function shiftCoverageMinutes(shift: Shift): number {
  return billableShiftMinutes(shift);
}

/** Полный невыход без отработанного интервала. */
export function isFullNoShow(shift: Shift): boolean {
  return shift.isNoShow === true && billableShiftWindow(shift) == null;
}

/** Частичная отработка: isNoShow + валидный incidentWorkedUntilAt. */
export function isPartialAttendance(shift: Shift): boolean {
  return shift.isNoShow === true && billableShiftWindow(shift) != null;
}

export function partialAttendanceWindow(shift: Shift): { start: Date; end: Date } | null {
  if (!shift.isNoShow) return null;
  return billableShiftWindow(shift);
}
