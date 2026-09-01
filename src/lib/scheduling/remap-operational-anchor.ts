import { coerceToDate } from "../format/display-date";
import {
  buildShiftIntervalFromOffsets,
  clipIntervalToOperationalCycle,
  dateTimeToHmKhabarovsk,
  normalizeOperationalAnchorTime,
  scheduleShiftColumnDateIso,
} from "./operational-day-timeline";

export type RemapAnchorShift = {
  id: string;
  guardId?: string;
  startsAt: Date | string;
  endsAt: Date | string;
  incidentWorkedUntilAt?: Date | string | null;
};

export type RemapAnchorPlanItem = {
  shiftId: string;
  guardId: string;
  startsAt: Date;
  endsAt: Date;
  incidentWorkedUntilAt: Date | null;
  columnDateIso: string;
};

function inferSutkiAnchor(shift: { startsAt: Date | string; endsAt: Date | string }): string | null {
  const startsAt = coerceToDate(shift.startsAt);
  const endsAt = coerceToDate(shift.endsAt);
  const startHm = dateTimeToHmKhabarovsk(startsAt);
  const endHm = dateTimeToHmKhabarovsk(endsAt);
  if (startHm === endHm && (startHm === "08:00" || startHm === "09:00")) return startHm;
  return null;
}

/** Переносит интервал смены на тот же день графика при смене якоря 08:00 ↔ 09:00. */
export function remapShiftToNewOperationalAnchor(
  shift: { startsAt: Date | string; endsAt: Date | string; incidentWorkedUntilAt?: Date | string | null },
  oldAnchor: string,
  newAnchor: string,
): { startsAt: Date; endsAt: Date; incidentWorkedUntilAt: Date | null; columnDateIso: string } | null {
  const from = normalizeOperationalAnchorTime(oldAnchor);
  const to = normalizeOperationalAnchorTime(newAnchor);
  const startsAt = coerceToDate(shift.startsAt);
  const endsAt = coerceToDate(shift.endsAt);
  const columnDateIso = scheduleShiftColumnDateIso({ startsAt, endsAt }, from);
  const clip = clipIntervalToOperationalCycle(columnDateIso, startsAt, endsAt, from);
  if (!clip) return null;

  const next = buildShiftIntervalFromOffsets(columnDateIso, clip.startOffset, clip.endOffset, to);
  const deltaMs = next.startsAt.getTime() - startsAt.getTime();
  const workedUntil = shift.incidentWorkedUntilAt
    ? new Date(coerceToDate(shift.incidentWorkedUntilAt).getTime() + deltaMs)
    : null;

  return {
    startsAt: next.startsAt,
    endsAt: next.endsAt,
    incidentWorkedUntilAt: workedUntil,
    columnDateIso,
  };
}

export function planShiftsRematToNewAnchor(
  shifts: readonly RemapAnchorShift[],
  month: string,
  oldAnchor: string,
  newAnchor: string,
): RemapAnchorPlanItem[] {
  const fallbackFrom = normalizeOperationalAnchorTime(oldAnchor);
  const to = normalizeOperationalAnchorTime(newAnchor);

  const plan: RemapAnchorPlanItem[] = [];
  for (const shift of shifts) {
    const from = inferSutkiAnchor(shift) ?? fallbackFrom;
    const remapped = remapShiftToNewOperationalAnchor(shift, from, to);
    if (!remapped) continue;
    if (remapped.columnDateIso.slice(0, 7) !== month) continue;
    if (
      remapped.startsAt.getTime() === coerceToDate(shift.startsAt).getTime() &&
      remapped.endsAt.getTime() === coerceToDate(shift.endsAt).getTime()
    ) {
      continue;
    }
    plan.push({
      shiftId: shift.id,
      guardId: shift.guardId ?? "",
      startsAt: remapped.startsAt,
      endsAt: remapped.endsAt,
      incidentWorkedUntilAt: remapped.incidentWorkedUntilAt,
      columnDateIso: remapped.columnDateIso,
    });
  }
  return plan;
}
