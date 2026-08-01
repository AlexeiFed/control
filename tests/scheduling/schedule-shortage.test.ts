import { describe, expect, it } from "vitest";
import {
  computeDayPlanMetrics,
  computeDayScheduleShortage,
  computeScheduleShortages,
  filterShiftsToVisibleScheduleDays,
} from "../../src/lib/scheduling/schedule-shortage";
import { operationalDayMonthKey } from "../../src/lib/scheduling/operational-day-anchors";
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
      [{ id: "obj1", name: "Объект А" }],
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

  it("counts partial attendance hours toward plan coverage", () => {
    const metrics = computeDayPlanMetrics(
      [
        {
          id: "partial",
          guardId: "g1",
          objectId: "obj1",
          startsAt: new Date("2026-07-12T08:00:00+10:00"),
          endsAt: new Date("2026-07-13T08:00:00+10:00"),
          shiftKind: "Regular",
          manualClientRateCents: null,
          manualGuardRateCents: null,
          manualRateUnit: null,
          manualRateReason: "",
          isNoShow: true,
          incidentCategory: "LeftWork",
          incidentComment: "",
          incidentWorkedUntilAt: new Date("2026-07-12T20:00:00+10:00"),
          incidentRecordedAt: new Date("2026-07-12T20:05:00+10:00"),
          replacedByShiftId: null,
          selectedRateRuleId: null,
          postId: null,
        },
        {
          id: "replacement",
          guardId: "g2",
          objectId: "obj1",
          startsAt: new Date("2026-07-12T20:00:00+10:00"),
          endsAt: new Date("2026-07-13T08:00:00+10:00"),
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
          postId: null,
        },
      ],
      {
        regular: 1,
        reinforcement: 0,
        shiftHours: 24,
        reinforcementShiftHours: 24,
        rapidResponse: 0,
        rapidResponseShiftHours: 24,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      },
    );
    expect(metrics?.regularDayHours).toBe(24);
    expect(metrics?.hoursShort).toBe(0);
  });

  it("ignores full no-show without workedUntil in plan coverage", () => {
    const metrics = computeDayPlanMetrics(
      [
        {
          id: "noshow",
          guardId: "g1",
          objectId: "obj1",
          startsAt: new Date("2026-07-12T08:00:00+10:00"),
          endsAt: new Date("2026-07-13T08:00:00+10:00"),
          shiftKind: "Regular",
          manualClientRateCents: null,
          manualGuardRateCents: null,
          manualRateUnit: null,
          manualRateReason: "",
          isNoShow: true,
          incidentCategory: "FullNoShow",
          incidentComment: "",
          incidentWorkedUntilAt: null,
          incidentRecordedAt: new Date("2026-07-12T09:00:00+10:00"),
          replacedByShiftId: null,
          selectedRateRuleId: null,
          postId: null,
        },
      ],
      {
        regular: 1,
        reinforcement: 0,
        shiftHours: 24,
        reinforcementShiftHours: 24,
        rapidResponse: 0,
        rapidResponseShiftHours: 24,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      },
    );
    expect(metrics?.regularDayHours).toBe(0);
    expect(metrics?.hoursShort).toBe(24);
  });

  it("counts LeftWork without workedUntil as full planned shift hours", () => {
    const metrics = computeDayPlanMetrics(
      [
        {
          id: "left-no-until",
          guardId: "g1",
          objectId: "obj1",
          startsAt: new Date("2026-07-12T08:00:00+10:00"),
          endsAt: new Date("2026-07-12T20:00:00+10:00"),
          shiftKind: "Regular",
          manualClientRateCents: null,
          manualGuardRateCents: null,
          manualRateUnit: null,
          manualRateReason: "",
          isNoShow: true,
          incidentCategory: "LeftWork",
          incidentComment: "",
          incidentWorkedUntilAt: null,
          incidentRecordedAt: new Date("2026-07-12T20:05:00+10:00"),
          replacedByShiftId: null,
          selectedRateRuleId: null,
          postId: null,
        },
        {
          id: "tail",
          guardId: "g2",
          objectId: "obj1",
          startsAt: new Date("2026-07-12T20:00:00+10:00"),
          endsAt: new Date("2026-07-13T08:00:00+10:00"),
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
          postId: null,
        },
      ],
      {
        regular: 1,
        reinforcement: 0,
        shiftHours: 24,
        reinforcementShiftHours: 24,
        rapidResponse: 0,
        rapidResponseShiftHours: 24,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      },
    );
    expect(metrics?.regularDayHours).toBe(24);
    expect(metrics?.hoursShort).toBe(0);
  });

  it("uses monthly operational-day override when assigning shifts to shortage days", () => {
    // Хвост 08:00–09:00: при якоре 08:00 — сутки 22-го; при 09:00 — сутки 21-го.
    const weekDays = [{ iso: "2026-07-22", label: "Ср, 22" }];
    const objects = [
      { id: "obj1", name: "КОМПЛЕКС", operationalDayStartTime: "08:00" },
    ];
    const shifts: Shift[] = [
      {
        id: "tail-1h",
        guardId: "g1",
        objectId: "obj1",
        startsAt: new Date("2026-07-22T08:00:00+10:00"),
        endsAt: new Date("2026-07-22T09:00:00+10:00"),
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
        postId: null,
      },
    ];
    const norms = {
      obj1: {
        "2026-07-22": {
          regular: 1,
          reinforcement: 0,
          shiftHours: 1,
          reinforcementShiftHours: 24,
          rapidResponse: 0,
          rapidResponseShiftHours: 24,
          shiftLead: 0,
          shiftLeadShiftHours: 24,
        },
      },
    };

    const withObjectDefault = computeScheduleShortages(objects, shifts, norms, weekDays);
    // 1ч на сутки 22-го при якоре 08:00 → недобора нет (день не попадает в shortages).
    expect(withObjectDefault).toEqual([]);

    const monthly = new Map([[operationalDayMonthKey("obj1", "2026-07"), "09:00"]]);
    const withMonthly = computeScheduleShortages(objects, shifts, norms, weekDays, monthly);
    expect(withMonthly).toHaveLength(1);
    expect(withMonthly[0]?.days[0]?.hoursShort).toBe(1);
    expect(withMonthly[0]?.days[0]?.regularDayHours).toBe(0);
  });
});
