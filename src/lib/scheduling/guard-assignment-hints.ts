import { formatCompactTimeRangeLocal } from "../format/display-date";
import { formatMinutesAsHours, type OtherObjectDayShift } from "./guard-daily-load";

export function formatOtherObjectShiftSegmentOnDate(shift: OtherObjectDayShift): string {
  return formatCompactTimeRangeLocal(shift.segmentStartsAt, shift.segmentEndsAt);
}

type OtherObjectsHintItem = {
  available: boolean;
  otherObjectShifts?: OtherObjectDayShift[];
  assignmentDayUsedMinutes?: number;
};

export function formatGuardOtherObjectsHint(
  item: OtherObjectsHintItem,
  objectNameById: ReadonlyMap<string, string>,
): string | null {
  const others = item.otherObjectShifts;
  if (!others?.length) return null;

  const parts = others.map((shift) => {
    const objectName = objectNameById.get(shift.objectId) ?? "другой объект";
    const range = formatOtherObjectShiftSegmentOnDate(shift);
    return `«${objectName}» ${range} (${formatMinutesAsHours(shift.minutesOnDate)} ч)`;
  });
  const usedMinutes = item.assignmentDayUsedMinutes ?? others.reduce((sum, shift) => sum + shift.minutesOnDate, 0);

  if (item.available) {
    return `Также стоит на других объектах: ${parts.join("; ")} — всего ${formatMinutesAsHours(usedMinutes)} ч за сутки.`;
  }

  return `На других объектах: ${parts.join("; ")} — всего ${formatMinutesAsHours(usedMinutes)} ч.`;
}
