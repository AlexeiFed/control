import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildShortageDayFingerprint,
  filterShortagesByDismissals,
  isShortageDismissValid,
  shortageDismissKey,
  type ShortageDismissPlanSnapshot,
  type ShortageDismissShiftInput,
} from "../../src/lib/scheduling/schedule-shortage-dismiss";
import type { ScheduleObjectShortage } from "../../src/lib/scheduling/schedule-shortage";

const plan: ShortageDismissPlanSnapshot = {
  regular: 2,
  shiftHours: 12,
  reinforcement: 0,
  reinforcementShiftHours: 24,
  rapidResponse: 0,
  rapidResponseShiftHours: 24,
  shiftLead: 1,
  shiftLeadShiftHours: 12,
};

const shiftA: ShortageDismissShiftInput = {
  id: "s-b",
  startsAtIso: "2026-07-20T08:00:00.000+10:00",
  endsAtIso: "2026-07-20T20:00:00.000+10:00",
  shiftKind: "Regular",
  postId: null,
  incidentRecordedAtIso: null,
  replacedByShiftId: null,
};

const shiftB: ShortageDismissShiftInput = {
  id: "s-a",
  startsAtIso: "2026-07-20T08:00:00.000+10:00",
  endsAtIso: "2026-07-20T20:00:00.000+10:00",
  shiftKind: "ShiftLead",
  postId: null,
  incidentRecordedAtIso: null,
  replacedByShiftId: null,
};

describe("buildShortageDayFingerprint", () => {
  it("is stable regardless of shift input order", () => {
    const a = buildShortageDayFingerprint({
      shifts: [shiftA, shiftB],
      plan,
      pendingIncident: false,
    });
    const b = buildShortageDayFingerprint({
      shifts: [shiftB, shiftA],
      plan,
      pendingIncident: false,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when a shift is removed", () => {
    const full = buildShortageDayFingerprint({
      shifts: [shiftA, shiftB],
      plan,
      pendingIncident: false,
    });
    const partial = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: false,
    });
    expect(full).not.toBe(partial);
  });

  it("changes when plan norms change", () => {
    const base = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: false,
    });
    const changed = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan: { ...plan, regular: 3 },
      pendingIncident: false,
    });
    expect(base).not.toBe(changed);
  });

  it("changes when pendingIncident flips", () => {
    const no = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: false,
    });
    const yes = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: true,
    });
    expect(no).not.toBe(yes);
  });
});

describe("filterShortagesByDismissals", () => {
  const shortages: ScheduleObjectShortage[] = [
    {
      objectId: "o1",
      objectName: "Объект",
      totalHoursShort: 10,
      totalReinforcementShort: 0,
      totalRapidResponseShort: 0,
      totalShiftLeadShort: 0,
      days: [
        {
          dateIso: "2026-07-20",
          dayLabel: "Пн, 20",
          hoursShort: 10,
          reinforcementShort: 0,
          rapidResponseShort: 0,
          shiftLeadShort: 0,
          expectedHoursRegular: 24,
          regularDayHours: 14,
        },
        {
          dateIso: "2026-07-21",
          dayLabel: "Вт, 21",
          hoursShort: 5,
          reinforcementShort: 0,
          rapidResponseShort: 0,
          shiftLeadShort: 0,
          expectedHoursRegular: 24,
          regularDayHours: 19,
        },
      ],
    },
  ];

  it("removes dismissed days and drops empty objects; recalculates totals", () => {
    const filtered = filterShortagesByDismissals(
      shortages,
      new Set([shortageDismissKey("o1", "2026-07-20")]),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.days.map((d) => d.dateIso)).toEqual(["2026-07-21"]);
    expect(filtered[0]?.totalHoursShort).toBe(5);
  });

  it("drops object when all days dismissed", () => {
    const filtered = filterShortagesByDismissals(
      shortages,
      new Set([
        shortageDismissKey("o1", "2026-07-20"),
        shortageDismissKey("o1", "2026-07-21"),
      ]),
    );
    expect(filtered).toEqual([]);
  });

  it("isShortageDismissValid only on exact match", () => {
    expect(isShortageDismissValid("abc", "abc")).toBe(true);
    expect(isShortageDismissValid("abc", "abd")).toBe(false);
  });
});
