import { describe, expect, it } from "vitest";
import type { ObjectRateRuleRecord } from "../../src/lib/operations/object-rate-rules-repository";
import { computeShiftRateBreakdown } from "../../src/lib/rates/rate-calculator";
import { createSchedulerGuard, createSchedulerShift } from "../../src/lib/scheduling/types";

const TZ = "Australia/Sydney";

function R(partial: Partial<ObjectRateRuleRecord> & Pick<ObjectRateRuleRecord, "id" | "name" | "priority">): ObjectRateRuleRecord {
  return {
    objectId: "o1",
    daysOfWeek: null,
    isHoliday: null,
    shiftKind: null,
    startsAt: null,
    endsAt: null,
    position: null,
    licenseType: null,
    employmentType: null,
    isTrainee: null,
    clientRateCents: 0,
    guardRateCents: 0,
    rateUnit: "Hour",
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    ...partial,
  };
}

describe("rate-calculator", () => {
  it("hourly rate over 60 minutes", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    guard.licenseType = "None";
    guard.position = "Guard";
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T08:00:00+10:00"),
      endsAt: new Date("2026-05-01T09:00:00+10:00"),
    });
    const rules = [
      R({
        id: "1",
        name: "База",
        priority: 50,
        position: "Guard",
        licenseType: "None",
        clientRateCents: 60_000,
        guardRateCents: 30_000,
        rateUnit: "Hour",
      }),
    ];
    const out = computeShiftRateBreakdown(shift, guard, rules, new Set(), TZ);
    expect(out.clientAmountCents).toBe(60_000);
    expect(out.guardAmountCents).toBe(30_000);
    expect(out.marginCents).toBe(30_000);
    expect(out.unpricedMinutes).toBe(0);
  });

  it("shift rate prorates by duration", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T08:00:00+10:00"),
      endsAt: new Date("2026-05-01T20:00:00+10:00"),
    });
    shift.shiftKind = "Reinforcement";
    const rules = [
      R({
        id: "1",
        name: "Усиление",
        priority: 85,
        shiftKind: "Reinforcement",
        clientRateCents: 120_000,
        guardRateCents: 70_000,
        rateUnit: "Shift",
      }),
    ];
    const out = computeShiftRateBreakdown(shift, guard, rules, new Set(), TZ);
    expect(out.reinforcementHours).toBe(12);
    expect(out.regularHours).toBe(0);
    expect(out.clientAmountCents).toBe(120_000);
    expect(out.guardAmountCents).toBe(70_000);
  });

  it("uses single rule at shift start (no midnight split)", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    guard.licenseType = "None";
    guard.position = "Guard";
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T08:00:00+10:00"),
      endsAt: new Date("2026-05-01T16:00:00+10:00"),
    });
    const rules = [
      R({
        id: "a",
        name: "Утро",
        priority: 60,
        startsAt: "08:00",
        endsAt: "12:00",
        clientRateCents: 60_000,
        rateUnit: "Hour",
      }),
      R({
        id: "b",
        name: "День",
        priority: 60,
        startsAt: "12:00",
        endsAt: "20:00",
        clientRateCents: 120_000,
        rateUnit: "Hour",
      }),
    ];
    const out = computeShiftRateBreakdown(shift, guard, rules, new Set(), TZ);
    // 8h @ 60000/h — правило «Утро» по началу смены 08:00
    expect(out.clientAmountCents).toBe(8 * 60_000);
  });

  it("returns guard tariff contributions for weekday and weekend rules", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    guard.licenseType = "None";
    guard.employmentType = "Unemployed";
    guard.position = "Guard";
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-06-05T22:00:00+10:00"),
      endsAt: new Date("2026-06-06T16:00:00+10:00"),
    });
    const rules = [
      R({
        id: "wd",
        name: "Будни",
        priority: 60,
        daysOfWeek: [1, 2, 3, 4, 5],
        startsAt: "18:00",
        endsAt: "08:00",
        guardRateCents: 17143,
        rateUnit: "Hour",
      }),
      R({
        id: "we",
        name: "Выходные",
        priority: 60,
        daysOfWeek: [6, 7],
        startsAt: "14:00",
        endsAt: "08:00",
        guardRateCents: 17778,
        rateUnit: "Hour",
      }),
    ];
    const out = computeShiftRateBreakdown(shift, guard, rules, new Set(), "Asia/Vladivostok");
    expect(out.guardRateContributions).toEqual([
      { guardRateCents: 17143, minutes: 18 * 60, amountCents: 18 * 17143 },
    ]);
    expect(out.guardAmountCents).toBe(18 * 17143);
  });

  it("holiday rule segment", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-09T08:00:00+10:00"),
      endsAt: new Date("2026-05-09T10:00:00+10:00"),
    });
    const rules = [
      R({
        id: "h",
        name: "Праздник",
        priority: 90,
        isHoliday: true,
        clientRateCents: 100_000,
        rateUnit: "Hour",
      }),
      R({
        id: "b",
        name: "База",
        priority: 50,
        clientRateCents: 50_000,
        rateUnit: "Hour",
      }),
    ];
    const out = computeShiftRateBreakdown(shift, guard, rules, new Set(["2026-05-09"]), TZ);
    expect(out.clientAmountCents).toBe(2 * 100_000);
  });

  it("no rule yields unpriced and zero amounts", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T08:00:00+10:00"),
      endsAt: new Date("2026-05-01T09:00:00+10:00"),
    });
    const out = computeShiftRateBreakdown(shift, guard, [], new Set(), TZ);
    expect(out.clientAmountCents).toBe(0);
    expect(out.guardAmountCents).toBe(0);
    expect(out.unpricedMinutes).toBe(60);
  });

  it("manual client override bypasses rules", () => {
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T08:00:00+10:00"),
      endsAt: new Date("2026-05-01T10:00:00+10:00"),
    });
    shift.manualClientRateCents = 99_000;
    shift.manualRateUnit = "Shift";
    const out = computeShiftRateBreakdown(shift, guard, [], new Set(), TZ);
    expect(out.clientAmountCents).toBe(99_000);
    expect(out.unpricedMinutes).toBe(120);
  });
});
