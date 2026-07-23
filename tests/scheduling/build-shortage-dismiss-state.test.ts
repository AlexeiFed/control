import { describe, expect, it } from "vitest";
import {
  aggregatePlanSnapshot,
  buildValidShortageDismissKeySet,
  shiftToDismissInput,
} from "../../src/lib/scheduling/build-shortage-dismiss-state";
import {
  buildShortageDayFingerprint,
  shortageDismissKey,
} from "../../src/lib/scheduling/schedule-shortage-dismiss";
import type { ExpectedShifts } from "../../src/lib/scheduling/object-shift-templates";
import type { ScheduleObjectRef } from "../../src/lib/scheduling/schedule-shortage";
import type { Shift } from "../../src/lib/scheduling/types";

const norms: ExpectedShifts = {
  regular: 1,
  reinforcement: 0,
  shiftHours: 12,
  reinforcementShiftHours: 24,
  rapidResponse: 0,
  rapidResponseShiftHours: 24,
  shiftLead: 0,
  shiftLeadShiftHours: 24,
};

const objects: ReadonlyArray<ScheduleObjectRef> = [{ id: "o1", name: "Объект 1" }];

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: "s1",
    guardId: "g1",
    objectId: "o1",
    postId: null,
    startsAt: new Date("2026-07-20T08:00:00.000+10:00"),
    endsAt: new Date("2026-07-20T20:00:00.000+10:00"),
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
    ...overrides,
  };
}

describe("aggregatePlanSnapshot", () => {
  it("sums counts across posts and keeps first non-empty hours", () => {
    const acc = aggregatePlanSnapshot([norms, { ...norms, regular: 2, shiftHours: 8 }]);
    expect(acc.regular).toBe(3);
    expect(acc.shiftHours).toBe(12);
  });

  it("skips undefined plans", () => {
    const acc = aggregatePlanSnapshot([undefined, norms]);
    expect(acc.regular).toBe(1);
    expect(acc.shiftHours).toBe(12);
  });
});

describe("shiftToDismissInput", () => {
  it("maps dates to ISO strings and passes through incident fields", () => {
    const input = shiftToDismissInput(makeShift());
    expect(input.startsAtIso).toBe("2026-07-19T22:00:00.000Z");
    expect(input.incidentRecordedAtIso).toBeNull();
    expect(input.replacedByShiftId).toBeNull();
  });
});

describe("buildValidShortageDismissKeySet", () => {
  const weekDayIsos = ["2026-07-20"];
  const shifts = [makeShift()];
  const expectedByObjectDay = { o1: { "2026-07-20": norms } };

  it("keeps dismiss when stored fingerprint matches current state", () => {
    const key = shortageDismissKey("o1", "2026-07-20");
    const fingerprint = buildShortageDayFingerprint({
      shifts: shifts.map(shiftToDismissInput),
      plan: aggregatePlanSnapshot([norms]),
      pendingIncident: false,
    });

    const validKeys = buildValidShortageDismissKeySet({
      objects,
      shifts,
      expectedByObjectDay,
      weekDayIsos,
      storedDismissals: new Map([[key, fingerprint]]),
    });

    expect(validKeys.has(key)).toBe(true);
  });

  it("drops dismiss when state changed since it was stored", () => {
    const key = shortageDismissKey("o1", "2026-07-20");
    const validKeys = buildValidShortageDismissKeySet({
      objects,
      shifts,
      expectedByObjectDay,
      weekDayIsos,
      storedDismissals: new Map([[key, "stale-fingerprint"]]),
    });

    expect(validKeys.has(key)).toBe(false);
  });

  it("derives pendingIncident from shifts when no override is given", () => {
    const key = shortageDismissKey("o1", "2026-07-20");
    const incidentShifts = [makeShift({ incidentRecordedAt: new Date("2026-07-20T10:00:00Z") })];
    const fingerprintWithoutIncident = buildShortageDayFingerprint({
      shifts: incidentShifts.map(shiftToDismissInput),
      plan: aggregatePlanSnapshot([norms]),
      pendingIncident: false,
    });

    const validKeys = buildValidShortageDismissKeySet({
      objects,
      shifts: incidentShifts,
      expectedByObjectDay,
      weekDayIsos,
      storedDismissals: new Map([[key, fingerprintWithoutIncident]]),
    });

    expect(validKeys.has(key)).toBe(false);
  });

  it("respects explicit pendingIncidentKeys override", () => {
    const key = shortageDismissKey("o1", "2026-07-20");
    const fingerprintWithIncident = buildShortageDayFingerprint({
      shifts: shifts.map(shiftToDismissInput),
      plan: aggregatePlanSnapshot([norms]),
      pendingIncident: true,
    });

    const validKeys = buildValidShortageDismissKeySet({
      objects,
      shifts,
      expectedByObjectDay,
      weekDayIsos,
      storedDismissals: new Map([[key, fingerprintWithIncident]]),
      pendingIncidentKeys: new Set([key]),
    });

    expect(validKeys.has(key)).toBe(true);
  });
});
