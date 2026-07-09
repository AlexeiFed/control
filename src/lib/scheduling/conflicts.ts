import {
  findDailyHoursExceeded,
  findGuardTimeOverlap,
  MAX_GUARD_DAY_MINUTES,
} from "./guard-daily-load";
import type { Guard, Shift } from "./types";

export type ScheduleConflict =
  | { type: "guard-status"; status: Guard["status"] }
  | { type: "shift-overlap"; shiftId: string; objectId: string }
  | {
      type: "daily-hours-exceeded";
      dateIso: string;
      existingMinutes: number;
      candidateMinutes: number;
      limitMinutes: number;
    };

export function findScheduleConflict(
  guard: Guard,
  candidate: Omit<Shift, "id">,
  existingShifts: Shift[],
  excludeShiftId?: string,
  options?: { assignmentDateIso?: string },
): ScheduleConflict | null {
  if (candidate.endsAt <= candidate.startsAt) {
    throw new Error("Shift end must be after shift start");
  }

  if (
    guard.status === "Sick" ||
    guard.status === "OnVacation" ||
    guard.status === "Inactive" ||
    guard.status === "Dismissed"
  ) {
    return { type: "guard-status", status: guard.status };
  }

  const timeOverlap = findGuardTimeOverlap(
    guard.id,
    candidate.startsAt,
    candidate.endsAt,
    existingShifts,
    excludeShiftId,
    options,
  );
  if (timeOverlap) {
    return {
      type: "shift-overlap",
      shiftId: timeOverlap.id ?? "",
      objectId: timeOverlap.objectId,
    };
  }

  const dailyExceeded = findDailyHoursExceeded(
    guard.id,
    candidate.startsAt,
    candidate.endsAt,
    existingShifts,
    excludeShiftId,
  );
  if (dailyExceeded) {
    return {
      type: "daily-hours-exceeded",
      dateIso: dailyExceeded.dateIso,
      existingMinutes: dailyExceeded.existingMinutes,
      candidateMinutes: dailyExceeded.candidateMinutes,
      limitMinutes: dailyExceeded.limitMinutes ?? MAX_GUARD_DAY_MINUTES,
    };
  }

  return null;
}
