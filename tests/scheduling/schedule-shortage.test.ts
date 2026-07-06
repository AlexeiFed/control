import { describe, expect, it } from "vitest";
import {
  buildOperationalDayAnchorByObjectId,
  computeDayPlanMetrics,
  computeDayScheduleShortage,
  computeScheduleShortages,
  filterShiftsToVisibleScheduleDays,
} from "../../src/lib/scheduling/schedule-shortage";
import type { Shift } from "../../src/lib/scheduling/types";

const fullNorm = {
  regular: 2,
  reinforcement: 0,
  shiftHours: 24,
  reinforcementShiftHours: 24,
  rapidResponse: 0,
  rapidResponseShiftHours: 24,
  shiftLead: 0,
  shiftLeadShiftHours: 24,
};

describe("schedule-shortage", () => {
  it("detects hour deficit on a planned day", () => {
    const partial = computeDayScheduleShortage([], fullNorm);
    expect(partial?.hoursShort).toBe(48);
    expect(partial?.regularDayHours).toBe(0);
  });

  it("uses shiftHours from template for regular plan", () => {
    const metrics = computeDayPlanMetrics([], {
      regular: 2,
      reinforcement: 0,
      shiftHours: 14,
      reinforcementShiftHours: 24,
      rapidResponse: 0,
      rapidResponseShiftHours: 24,
      shiftLead: 0,
      shiftLeadShiftHours: 24,
    });
    expect(metrics?.expectedHoursRegular).toBe(28);
    expect(metrics?.hoursShort).toBe(28);
  });

  it("tracks reinforcement and MP separately in plan metrics", () => {
    const metrics = computeDayPlanMetrics([], {
      regular: 0,
      reinforcement: 1,
      shiftHours: 24,
      reinforcementShiftHours: 12,
      rapidResponse: 1,
      rapidResponseShiftHours: 12,
      shiftLead: 0,
      shiftLeadShiftHours: 24,
    });
    expect(metrics?.reinforcementShort).toBe(1);
    expect(metrics?.rapidResponseShort).toBe(1);
    expect(metrics?.hoursShort).toBe(0);
  });

  it("returns reinforcement and MP shortages in hours", () => {
    const partial = computeDayScheduleShortage([], {
      regular: 0,
      reinforcement: 1,
      shiftHours: 24,
      reinforcementShiftHours: 12,
      rapidResponse: 1,
      rapidResponseShiftHours: 12,
      shiftLead: 1,
      shiftLeadShiftHours: 8,
    });
    expect(partial?.reinforcementShort).toBe(12);
    expect(partial?.rapidResponseShort).toBe(12);
    expect(partial?.shiftLeadShort).toBe(8);
    expect(partial?.hoursShort).toBe(0);
  });

  it("ignores shifts outside visible 14-day columns", () => {
    const weekDays = [
      { iso: "2026-05-11", label: "Пн, 11" },
      { iso: "2026-05-12", label: "Вт, 12" },
    ];
    const shifts: Shift[] = [
      {
        id: "outside",
        guardId: "g1",
        objectId: "obj1",
        startsAt: new Date("2026-05-08T08:00:00+10:00"),
        endsAt: new Date("2026-05-08T20:00:00+10:00"),
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
        replacedByShiftId: null, selectedRateRuleId: null, postId: null,
      },
      {
        id: "inside",
        guardId: "g1",
        objectId: "obj1",
        startsAt: new Date("2026-05-11T08:00:00+10:00"),
        endsAt: new Date("2026-05-11T20:00:00+10:00"),
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
        replacedByShiftId: null, selectedRateRuleId: null, postId: null,
      },
    ];
    const filtered = filterShiftsToVisibleScheduleDays(
      shifts,
      weekDays,
      buildOperationalDayAnchorByObjectId([{ id: "obj1", name: "Объект А" }]),
    );
    expect(filtered.map((s) => s.id)).toEqual(["inside"]);
    const result = computeScheduleShortages(
      [{ id: "obj1", name: "Объект А" }],
      shifts,
      {
        obj1: {
          "2026-05-11": fullNorm,
          "2026-05-12": fullNorm,
        },
      },
      weekDays,
    );
    expect(result[0]?.days.some((d) => d.dateIso === "2026-05-08")).toBe(false);
  });

  it("aggregates shortages by object and day", () => {
    const shifts: Shift[] = [
      {
        id: "s1",
        guardId: "g1",
        objectId: "obj1",
        startsAt: new Date("2026-05-11T00:00:00+10:00"),
        endsAt: new Date("2026-05-11T12:00:00+10:00"),
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
        replacedByShiftId: null, selectedRateRuleId: null, postId: null,
      },
    ];
    const result = computeScheduleShortages(
      [{ id: "obj1", name: "Объект А" }],
      shifts,
      { obj1: { "2026-05-11": fullNorm } },
      [{ iso: "2026-05-11", label: "Пн, 11" }],
    );
    expect(result).toHaveLength(1);
    expect(result[0]?.totalHoursShort).toBeGreaterThan(0);
    expect(result[0]?.days[0]?.hoursShort).toBeGreaterThan(0);
  });

  it("counts tail shift before 9-9 anchor on the previous operational day", () => {
    const weekDays = [{ iso: "2026-06-15", label: "Пн, 15" }];
    const shifts: Shift[] = [
      {
        id: "tail",
        guardId: "g1",
        objectId: "obj1",
        startsAt: new Date("2026-06-16T08:00:00+10:00"),
        endsAt: new Date("2026-06-16T09:00:00+10:00"),
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
        replacedByShiftId: null, selectedRateRuleId: null, postId: null,
      },
    ];
    const result = computeScheduleShortages(
      [{ id: "obj1", name: "Объект А", operationalDayStartTime: "09:00" }],
      shifts,
      { obj1: { "2026-06-15": fullNorm } },
      weekDays,
    );
    expect(result[0]?.days[0]?.dateIso).toBe("2026-06-15");
    expect(result[0]?.days[0]?.regularDayHours).toBe(1);
  });
});
