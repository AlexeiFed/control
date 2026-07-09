import { describe, expect, it } from "vitest";
import type { ObjectRateRuleRecord } from "../../src/lib/operations/object-rate-rules-repository";
import { computeShiftRateBreakdown } from "../../src/lib/rates/rate-calculator";
import {
  buildRateRuleTimePresets,
  guardHasMatchingRateRulesForProfile,
  listManualSelectableRateRules,
  shiftNeedsManualRateRuleSelection,
} from "../../src/lib/rates/shift-rate-selection";
import { createSchedulerGuard, createSchedulerShift } from "../../src/lib/scheduling/types";

function rule(partial: Partial<ObjectRateRuleRecord> & Pick<ObjectRateRuleRecord, "id" | "name">): ObjectRateRuleRecord {
  return {
    objectId: "obj-1",
    priority: 100,
    daysOfWeek: [1, 2, 3, 4, 5, 6],
    isHoliday: null,
    shiftKind: "RapidResponse",
    startsAt: "20:00",
    endsAt: "08:00",
    position: "Curator",
    licenseType: null,
    employmentType: "Unemployed",
    isTrainee: null,
    clientRateCents: 0,
    guardRateCents: 23333,
    rateUnit: "Hour",
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    ...partial,
  };
}

describe("shift-rate-selection", () => {
  const guard = createSchedulerGuard({ id: "g1", name: "Токарев", status: "Active" });
  guard.position = "Curator";
  guard.employmentType = "Unemployed";

  it("builds time presets from matching rules", () => {
    const rules = [
      rule({ id: "r12", name: "КУРАТОР Б/У 12Ч", startsAt: "20:00", endsAt: "08:00" }),
      rule({ id: "r13", name: "КУРАТОР Б/У 13Ч", startsAt: "19:00", endsAt: "08:00" }),
    ];
    const presets = buildRateRuleTimePresets(rules, "obj-1", guard, "RapidResponse", "2026-05-06", new Set());
    expect(presets).toHaveLength(2);
    expect(presets.map((p) => p.startTime)).toEqual(["19:00", "20:00"]);
  });

  it("includes 24h preset for 08:00-08:00 and labels it as sutki", () => {
    const rules = [
      rule({
        id: "r24",
        name: "КУРАТОР Б/У 24Ч",
        daysOfWeek: [7],
        startsAt: "08:00",
        endsAt: "08:00",
      }),
      rule({ id: "r12", name: "КУРАТОР Б/У 12Ч", daysOfWeek: [6, 7], startsAt: "20:00", endsAt: "08:00" }),
    ];
    const presets = buildRateRuleTimePresets(rules, "obj-1", guard, "RapidResponse", "2026-05-03", new Set());
    expect(presets).toHaveLength(2);
    expect(presets[0]?.label).toContain("Сутки 8–8");
    expect(presets[0]?.label).toContain("24Ч");
  });

  it("includes sutki preset when only startsAt is set", () => {
    const rules = [
      rule({
        id: "r24",
        name: "КУРАТОР Б/У 24Ч",
        daysOfWeek: [7],
        startsAt: "08:00",
        endsAt: null,
      }),
    ];
    const presets = buildRateRuleTimePresets(rules, "obj-1", guard, "RapidResponse", "2026-05-03", new Set());
    expect(presets).toHaveLength(1);
    expect(presets[0]?.startTime).toBe("08:00");
    expect(presets[0]?.endTime).toBe("08:00");
  });

  it("detects missing profile rate rules for guard", () => {
    const matching = rule({ id: "r1", name: "КУРАТОР Б/У" });
    const wrongEmployment = rule({ id: "r2", name: "Трудоустроен", employmentType: "Employed" });
    expect(
      guardHasMatchingRateRulesForProfile([matching], "obj-1", guard, "RapidResponse", "2026-05-06", new Set()),
    ).toBe(true);
    expect(
      guardHasMatchingRateRulesForProfile(
        [wrongEmployment],
        "obj-1",
        guard,
        "RapidResponse",
        "2026-05-06",
        new Set(),
      ),
    ).toBe(false);
  });

  it("exposes other weekday rules for manual selection", () => {
    const weekdayRule = rule({ id: "wd", name: "Будни", daysOfWeek: [1, 2, 3, 4, 5] });
    const weekendRule = rule({ id: "we", name: "Выходные", daysOfWeek: [6, 7] });
    const { dayMatched, otherWeekdays } = listManualSelectableRateRules(
      [weekdayRule, weekendRule],
      "obj-1",
      guard,
      "RapidResponse",
      "2026-05-03",
      new Set(),
    );
    expect(dayMatched.map((r) => r.id)).toEqual(["we"]);
    expect(otherWeekdays.map((r) => r.id)).toEqual(["wd"]);
  });

  it("requires manual rate for early start outside rule windows", () => {
    const rules = [rule({ id: "r12", name: "КУРАТОР Б/У 12Ч" })];
    const needs = shiftNeedsManualRateRuleSelection({
      objectId: "obj-1",
      guard,
      shiftKind: "RapidResponse",
      shiftDateIso: "2026-05-06",
      startTime: "16:00",
      endTime: "08:00",
      rules,
      holidayDates: new Set(),
    });
    expect(needs).toBe(true);
  });

  it("applies pinned rule to full shift duration", () => {
    const rules = [rule({ id: "r12", name: "КУРАТОР Б/У 12Ч", guardRateCents: 23333 })];
    const shift = createSchedulerShift({
      id: "s1",
      guardId: guard.id,
      objectId: "obj-1",
      startsAt: new Date("2026-05-06T16:00:00+10:00"),
      endsAt: new Date("2026-05-07T08:00:00+10:00"),
    });
    shift.shiftKind = "RapidResponse";
    shift.selectedRateRuleId = "r12";

    const breakdown = computeShiftRateBreakdown(shift, guard, rules, new Set());
    expect(breakdown.unpricedMinutes).toBe(0);
    expect(breakdown.guardAmountCents).toBe(Math.round((23333 * 16 * 60) / 60));
  });
});
