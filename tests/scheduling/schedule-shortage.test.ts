import { describe, expect, it } from "vitest";
import {
  computeDayPlanMetrics,
  computeDayScheduleShortage,
  computeScheduleShortages,
  filterShiftsToVisibleScheduleDays,
} from "../../src/lib/scheduling/schedule-shortage";
import { operationalDayMonthKey } from "../../src/lib/scheduling/operational-day-anchors";
import { buildExpectedShiftsByObjectAndDay } from "../../src/lib/scheduling/object-shift-templates";
import type { ObjectShiftTemplateRow } from "../../src/lib/operations/shift-templates-repository";
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
  seniorGuard: 0,
  seniorGuardShiftHours: 24,
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
      seniorGuard: 0,
      seniorGuardShiftHours: 24,
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
      seniorGuard: 0,
      seniorGuardShiftHours: 24,
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
      seniorGuard: 0,
      seniorGuardShiftHours: 24,
    });
    expect(partial?.reinforcementShort).toBe(12);
    expect(partial?.rapidResponseShort).toBe(12);
    expect(partial?.shiftLeadShort).toBe(8);
    expect(partial?.hoursShort).toBe(0);
  });

  it("returns senior guard shortages in hours", () => {
    const partial = computeDayScheduleShortage([], {
      regular: 0,
      reinforcement: 0,
      shiftHours: 24,
      reinforcementShiftHours: 24,
      rapidResponse: 0,
      rapidResponseShiftHours: 24,
      shiftLead: 0,
      shiftLeadShiftHours: 24,
      seniorGuard: 1,
      seniorGuardShiftHours: 12,
    });
    expect(partial?.seniorGuardShort).toBe(12);
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
        seniorGuard: 0,
        seniorGuardShiftHours: 24,
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
        seniorGuard: 0,
        seniorGuardShiftHours: 24,
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
        seniorGuard: 0,
        seniorGuardShiftHours: 24,
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
          seniorGuard: 0,
          seniorGuardShiftHours: 24,
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

  it("does not flag a filled week day when leftover previous-month post templates exist", () => {
    const templates: ObjectShiftTemplateRow[] = [
      {
        objectId: "gidro",
        postId: "p-aug",
        postMonth: "2026-08",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
      {
        objectId: "gidro",
        postId: "p-sep",
        postMonth: "2026-09",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    ];
    const weekDays = [{ iso: "2026-09-14", label: "Пн, 14" }];
    const expected = buildExpectedShiftsByObjectAndDay(["gidro"], ["2026-09-14"], templates);
    const shifts: Shift[] = [
      {
        id: "filled",
        guardId: "g1",
        objectId: "gidro",
        startsAt: new Date("2026-09-14T08:00:00+10:00"),
        endsAt: new Date("2026-09-14T22:00:00+10:00"),
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
        postId: "p-sep",
      },
    ];
    expect(computeScheduleShortages([{ id: "gidro", name: "ООО ГИДРОСТРОЙ" }], shifts, expected, weekDays)).toEqual([]);
  });

  it("hydrostroy: night 18–08 covers the post 1×14 plan even if object-level template is 2×14", () => {
    const gidro = "1b8fd2cc-4f27-4d5b-ae2b-1b28afd08016";
    const sepPost = "53d3e723-26ea-4531-8ae3-189bbb39fb83";
    const augPost = "959c8d3c-0b40-4a2a-bac2-20147b3ba655";
    const templates: ObjectShiftTemplateRow[] = [
      {
        objectId: gidro,
        postId: null,
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        shiftsRapidResponsePerDay: 1,
        rapidResponseShiftHours: 24,
        effectiveFrom: "2026-05-01",
        effectiveTo: null,
      },
      {
        objectId: gidro,
        postId: augPost,
        postMonth: "2026-08",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
      },
      {
        objectId: gidro,
        postId: sepPost,
        postMonth: "2026-09",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-09-14",
        effectiveTo: null,
      },
    ];
    const weekDays = [{ iso: "2026-09-14", label: "Пн, 14" }];
    const expected = buildExpectedShiftsByObjectAndDay([gidro], ["2026-09-14"], templates);
    const shifts: Shift[] = [
      {
        id: "night",
        guardId: "g1",
        objectId: gidro,
        startsAt: new Date("2026-09-14T18:00:00+10:00"),
        endsAt: new Date("2026-09-15T08:00:00+10:00"),
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
        postId: sepPost,
      },
    ];
    const result = computeScheduleShortages(
      [{ id: gidro, name: "ООО ГИДРОСТРОЙ", operationalDayStartTime: "08:00" }],
      shifts,
      expected,
      weekDays,
    );
    expect(expected[gidro]?.["2026-09-14"]?.regular).toBe(1);
    expect(expected[gidro]?.["2026-09-14"]?.shiftHours).toBe(14);
    expect(result).toEqual([]);
  });

  it("hydrostroy: current-month object_posts win even if leftover templates have no postMonth", () => {
    const gidro = "1b8fd2cc-4f27-4d5b-ae2b-1b28afd08016";
    const sepPost = "53d3e723-26ea-4531-8ae3-189bbb39fb83";
    const augPost = "959c8d3c-0b40-4a2a-bac2-20147b3ba655";
    const templates: ObjectShiftTemplateRow[] = [
      {
        objectId: gidro,
        postId: null,
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        shiftsRapidResponsePerDay: 1,
        rapidResponseShiftHours: 24,
        effectiveFrom: "2026-05-01",
        effectiveTo: null,
      },
      {
        objectId: gidro,
        postId: augPost,
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-08-01",
        effectiveTo: null,
      },
      {
        objectId: gidro,
        postId: sepPost,
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-09-14",
        effectiveTo: null,
      },
    ];
    const postIdsByObjectMonth = new Map<string, readonly string[]>([[`${gidro}|2026-09`, [sepPost]]]);
    const expected = buildExpectedShiftsByObjectAndDay(
      [gidro],
      ["2026-09-14"],
      templates,
      postIdsByObjectMonth,
    );
    expect(expected[gidro]?.["2026-09-14"]?.regular).toBe(1);
    expect(expected[gidro]?.["2026-09-14"]?.shiftHours).toBe(14);
    const shifts: Shift[] = [
      {
        id: "night",
        guardId: "g1",
        objectId: gidro,
        startsAt: new Date("2026-09-14T18:00:00+10:00"),
        endsAt: new Date("2026-09-15T08:00:00+10:00"),
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
        postId: sepPost,
      },
    ];
    expect(
      computeScheduleShortages(
        [{ id: gidro, name: "ООО ГИДРОСТРОЙ", operationalDayStartTime: "08:00" }],
        shifts,
        expected,
        [{ iso: "2026-09-14", label: "Пн, 14" }],
        new Map(),
        { templates, postIdsByObjectMonth },
      ),
    ).toEqual([]);
  });

  it("flags an empty post even if another post on the same object is over plan", () => {
    const templates: ObjectShiftTemplateRow[] = [
      {
        objectId: "o1",
        postId: "pa",
        postMonth: "2026-09",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
      {
        objectId: "o1",
        postId: "pb",
        postMonth: "2026-09",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
      },
    ];
    const postIdsByObjectMonth = new Map<string, readonly string[]>([["o1|2026-09", ["pa", "pb"]]]);
    const expected = buildExpectedShiftsByObjectAndDay(["o1"], ["2026-09-14"], templates, postIdsByObjectMonth);
    const baseShift = {
      guardId: "g1",
      objectId: "o1",
      startsAt: new Date("2026-09-14T08:00:00+10:00"),
      endsAt: new Date("2026-09-14T22:00:00+10:00"),
      shiftKind: "Regular" as const,
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
      postId: "pa",
    };
    const shifts: Shift[] = [
      { ...baseShift, id: "a1", guardId: "g1" },
      { ...baseShift, id: "a2", guardId: "g2" },
    ];
    const pooled = computeScheduleShortages(
      [{ id: "o1", name: "Объект" }],
      shifts,
      expected,
      [{ iso: "2026-09-14", label: "Пн, 14" }],
    );
    expect(pooled).toEqual([]);

    const perPost = computeScheduleShortages(
      [{ id: "o1", name: "Объект" }],
      shifts,
      expected,
      [{ iso: "2026-09-14", label: "Пн, 14" }],
      new Map(),
      { templates, postIdsByObjectMonth },
    );
    expect(perPost[0]?.days[0]?.hoursShort).toBe(14);
  });
});
