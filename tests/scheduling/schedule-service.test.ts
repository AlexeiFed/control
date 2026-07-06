import { describe, expect, it } from "vitest";
import { createShiftWithConflictCheck } from "../../src/lib/scheduling/schedule-service";
import { createSchedulerGuard } from "../../src/lib/scheduling/types";

const guards = [
  createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
  createSchedulerGuard({ id: "g2", name: "Anna", status: "Sick" }),
];

const baseCandidate = {
  guardId: "g1",
  objectId: "o1",
  startsAt: new Date("2026-05-01T08:00:00+10:00"),
  endsAt: new Date("2026-05-01T20:00:00+10:00"),
  shiftKind: "Regular" as const,
  manualClientRateCents: null as number | null,
  manualGuardRateCents: null as number | null,
  manualRateUnit: null,
  manualRateReason: "",
  isNoShow: false,
  incidentCategory: null,
  incidentComment: "",
  incidentWorkedUntilAt: null,
  incidentRecordedAt: null,
  replacedByShiftId: null,
  postId: null,
  selectedRateRuleId: null,
};

describe("schedule service", () => {
  it("creates a shift when there is no conflict", () => {
    const result = createShiftWithConflictCheck({
      guards,
      existingShifts: [],
      candidate: baseCandidate,
    });

    expect(result).toMatchObject({
      ok: true,
      shift: {
        guardId: "g1",
        objectId: "o1",
      },
    });
  });

  it("blocks sick guards and overlapping shifts before write", () => {
    expect(
      createShiftWithConflictCheck({
        guards,
        existingShifts: [],
        candidate: {
          ...baseCandidate,
          guardId: "g2",
        },
      }),
    ).toEqual({ ok: false, conflict: { type: "guard-status", status: "Sick" } });

    expect(
      createShiftWithConflictCheck({
        guards,
        existingShifts: [
          {
            id: "existing",
            guardId: "g1",
            objectId: "o1",
            startsAt: new Date("2026-05-01T08:00:00+10:00"),
            endsAt: new Date("2026-05-01T20:00:00+10:00"),
            shiftKind: "Regular",
            manualClientRateCents: null,
            manualGuardRateCents: null,
            manualRateUnit: null,
            manualRateReason: "",
            isNoShow: false,
            incidentCategory: null,
            incidentComment: "",
            incidentWorkedUntilAt: null,
            incidentRecordedAt: null,
  replacedByShiftId: null,
  postId: null,
  selectedRateRuleId: null,
          },
        ],
        candidate: {
          ...baseCandidate,
          objectId: "o1",
          startsAt: new Date("2026-05-01T12:00:00+10:00"),
          endsAt: new Date("2026-05-01T18:00:00+10:00"),
        },
      }),
    ).toEqual({
      ok: false,
      conflict: { type: "shift-overlap", shiftId: "existing", objectId: "o1" },
    });

    expect(
      createShiftWithConflictCheck({
        guards,
        existingShifts: [
          {
            id: "existing",
            guardId: "g1",
            objectId: "o1",
            startsAt: new Date("2026-05-01T08:00:00+10:00"),
            endsAt: new Date("2026-05-01T10:00:00+10:00"),
            shiftKind: "Regular",
            manualClientRateCents: null,
            manualGuardRateCents: null,
            manualRateUnit: null,
            manualRateReason: "",
            isNoShow: false,
            incidentCategory: null,
            incidentComment: "",
            incidentWorkedUntilAt: null,
            incidentRecordedAt: null,
  replacedByShiftId: null,
  postId: null,
  selectedRateRuleId: null,
          },
        ],
        candidate: {
          ...baseCandidate,
          objectId: "o2",
          startsAt: new Date("2026-05-01T10:00:00+10:00"),
          endsAt: new Date("2026-05-01T12:00:00+10:00"),
        },
      }).ok,
    ).toBe(true);
  });
});
