import { findScheduleConflict, type ScheduleConflict } from "./conflicts";
import type { Guard, Shift } from "./types";

type CreateShiftInput = {
  guards: Guard[];
  existingShifts: Shift[];
  candidate: Omit<Shift, "id">;
};

type CreateShiftResult =
  | { ok: true; shift: Shift }
  | { ok: false; conflict: ScheduleConflict | { type: "guard-not-found"; guardId: string } };

export function createShiftWithConflictCheck({
  guards,
  existingShifts,
  candidate,
}: CreateShiftInput): CreateShiftResult {
  const guard = guards.find((item) => item.id === candidate.guardId);

  if (!guard) {
    return { ok: false, conflict: { type: "guard-not-found", guardId: candidate.guardId } };
  }

  const conflict = findScheduleConflict(guard, candidate, existingShifts);
  if (conflict) return { ok: false, conflict };

  return {
    ok: true,
    shift: {
      id: crypto.randomUUID(),
      ...candidate,
    },
  };
}
