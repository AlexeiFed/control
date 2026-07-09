import type { Shift } from "./types";

export const CONFIRM_DELETE_SHIFT_MSG = "Удалить эту смену? Это действие нельзя отменить.";

export function confirmDeleteShift(
  shift: Pick<Shift, "isNoShow" | "incidentRecordedAt" | "replacedByShiftId">,
): boolean {
  if (shift.isNoShow || shift.incidentRecordedAt) {
    if (shift.replacedByShiftId) {
      return window.confirm(
        "Удалить смену с инцидентом? Связанная смена замены тоже будет удалена. Это действие нельзя отменить.",
      );
    }
    return window.confirm(
      "Удалить смену с инцидентом? Запись о невыходе будет удалена без возможности восстановления.",
    );
  }
  return window.confirm(CONFIRM_DELETE_SHIFT_MSG);
}
