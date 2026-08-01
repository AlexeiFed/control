import { describe, expect, it } from "vitest";
import { isOperationalDayPlanSatisfied } from "../../src/lib/scheduling/pending-incident-plan-satisfied";
import type { Shift } from "../../src/lib/scheduling/types";

const plan60 = {
  regular: 1,
  reinforcement: 0,
  shiftHours: 60,
  reinforcementShiftHours: 24,
  rapidResponse: 0,
  rapidResponseShiftHours: 24,
  shiftLead: 0,
  shiftLeadShiftHours: 24,
};

function regularShift(hours: number, id = "s1"): Shift {
  const startsAt = new Date("2026-08-01T08:00:00+10:00");
  return {
    id,
    guardId: "g1",
    objectId: "o1",
    postId: null,
    startsAt,
    endsAt: new Date(startsAt.getTime() + hours * 3600_000),
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
    selectedRateRuleId: null,
  };
}

describe("isOperationalDayPlanSatisfied", () => {
  it("false при недоборе (как 48/60)", () => {
    expect(isOperationalDayPlanSatisfied([regularShift(48)], plan60)).toBe(false);
  });

  it("true когда факт закрывает план (60/60), даже с невыходом без coverage", () => {
    const noShow: Shift = {
      ...regularShift(12, "noshow"),
      isNoShow: true,
      incidentCategory: "FullNoShow",
      incidentRecordedAt: new Date("2026-08-01T10:00:00+10:00"),
    };
    const cover = regularShift(60, "cover");
    expect(isOperationalDayPlanSatisfied([noShow, cover], plan60)).toBe(true);
  });

  it("false если плана нет", () => {
    expect(isOperationalDayPlanSatisfied([regularShift(24)], undefined)).toBe(false);
  });
});
