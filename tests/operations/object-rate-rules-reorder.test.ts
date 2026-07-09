import { describe, expect, it } from "vitest";
import {
  defaultRateRuleEffectiveFrom,
  prioritiesForDisplayOrder,
} from "../../src/lib/operations/object-rate-rules-priority";

describe("prioritiesForDisplayOrder", () => {
  it("верх списка получает больший priority", () => {
    expect(prioritiesForDisplayOrder(3)).toEqual([30, 20, 10]);
  });
});

describe("defaultRateRuleEffectiveFrom", () => {
  it("возвращает 1 января года по Хабаровску", () => {
    expect(defaultRateRuleEffectiveFrom(new Date("2026-06-04T12:00:00+10:00"))).toBe("2026-01-01");
    expect(defaultRateRuleEffectiveFrom(new Date("2027-12-31T23:00:00+10:00"))).toBe("2027-01-01");
  });
});
