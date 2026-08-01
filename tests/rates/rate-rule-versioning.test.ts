import { describe, expect, it } from "vitest";
import type {
  CreateObjectRateRuleInput,
  ObjectRateRuleRecord,
} from "../../src/lib/operations/object-rate-rules-repository";
import {
  defaultRateRuleVersionFrom,
  resolveRateRuleSavePlan,
} from "../../src/lib/rates/rate-rule-versioning";

function rule(
  partial: Partial<ObjectRateRuleRecord> & Pick<ObjectRateRuleRecord, "id" | "effectiveFrom">,
): ObjectRateRuleRecord {
  return {
    objectId: "o1",
    name: "База",
    priority: 100,
    daysOfWeek: null,
    isHoliday: null,
    shiftKind: null,
    startsAt: null,
    endsAt: null,
    position: null,
    licenseType: null,
    employmentType: null,
    isTrainee: null,
    clientRateCents: 100_00,
    guardRateCents: 50_00,
    rateUnit: "Hour",
    effectiveTo: null,
    ...partial,
  };
}

function input(partial: Partial<CreateObjectRateRuleInput> = {}): CreateObjectRateRuleInput {
  return {
    objectId: "o1",
    name: "База",
    priority: 100,
    daysOfWeek: null,
    isHoliday: null,
    shiftKind: null,
    startsAt: null,
    endsAt: null,
    position: null,
    licenseType: null,
    employmentType: null,
    isTrainee: null,
    clientRateCents: 200_00,
    guardRateCents: 80_00,
    rateUnit: "Hour",
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    ...partial,
  };
}

describe("rate-rule-versioning", () => {
  it("defaultRateRuleVersionFrom is first day of Khabarovsk month", () => {
    expect(defaultRateRuleVersionFrom(new Date("2026-07-17T12:00:00+10:00"))).toBe("2026-07-01");
  });

  it("same versionFrom as effectiveFrom → in-place update", () => {
    const plan = resolveRateRuleSavePlan(rule({ id: "r1", effectiveFrom: "2026-01-01" }), "2026-01-01", input());
    expect(plan).toEqual({ mode: "update", backfillFrom: "2026-01-01" });
  });

  it("later versionFrom → supersede and narrow backfill", () => {
    const plan = resolveRateRuleSavePlan(
      rule({ id: "r1", effectiveFrom: "2026-01-01", effectiveTo: null }),
      "2026-07-01",
      input({ guardRateCents: 90_00 }),
    );
    expect(plan).toEqual({
      mode: "supersede",
      closeEffectiveTo: "2026-06-30",
      newEffectiveFrom: "2026-07-01",
      newEffectiveTo: null,
      backfillFrom: "2026-07-01",
    });
  });

  it("preserves existing effectiveTo on new version when form omits it", () => {
    const plan = resolveRateRuleSavePlan(
      rule({ id: "r1", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31" }),
      "2026-07-01",
      input({ effectiveTo: null }),
    );
    expect(plan.mode).toBe("supersede");
    if (plan.mode === "supersede") {
      expect(plan.newEffectiveTo).toBe("2026-12-31");
      expect(plan.closeEffectiveTo).toBe("2026-06-30");
    }
  });

  it("rejects versionFrom before rule start", () => {
    expect(() =>
      resolveRateRuleSavePlan(rule({ id: "r1", effectiveFrom: "2026-06-01" }), "2026-05-01", input()),
    ).toThrow(/раньше начала/);
  });

  it("rejects versionFrom after rule end", () => {
    expect(() =>
      resolveRateRuleSavePlan(
        rule({ id: "r1", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" }),
        "2026-07-01",
        input(),
      ),
    ).toThrow(/выходит за период/);
  });
});
