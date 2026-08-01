import { describe, expect, it } from "vitest";
import type { ObjectRateRuleRecord } from "../../src/lib/operations/object-rate-rules-repository";
import {
  buildRateRuleVersionChains,
  flattenVersionChainsForReorder,
  rateRuleVersionProfileKey,
} from "../../src/lib/rates/rate-rule-version-chains";

function R(
  partial: Partial<ObjectRateRuleRecord> & Pick<ObjectRateRuleRecord, "id" | "name" | "effectiveFrom">,
): ObjectRateRuleRecord {
  return {
    objectId: "o1",
    priority: 100,
    daysOfWeek: null,
    isHoliday: null,
    shiftKind: null,
    startsAt: null,
    endsAt: null,
    position: "Guard",
    licenseType: "None",
    employmentType: null,
    isTrainee: null,
    clientRateCents: 200_00,
    guardRateCents: 100_00,
    rateUnit: "Hour",
    effectiveTo: null,
    ...partial,
  };
}

describe("rate-rule-version-chains", () => {
  it("same profile ignores guard rate and dates", () => {
    const a = R({ id: "1", name: "База", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30", guardRateCents: 100_00 });
    const b = R({ id: "2", name: "База", effectiveFrom: "2026-07-01", guardRateCents: 150_00 });
    expect(rateRuleVersionProfileKey(a)).toBe(rateRuleVersionProfileKey(b));
  });

  it("different client rate → different profile", () => {
    const a = R({ id: "1", name: "База", effectiveFrom: "2026-01-01", clientRateCents: 200_00 });
    const b = R({ id: "2", name: "База", effectiveFrom: "2026-07-01", clientRateCents: 250_00 });
    expect(rateRuleVersionProfileKey(a)).not.toBe(rateRuleVersionProfileKey(b));
  });

  it("builds chain with current = latest and history newer-first", () => {
    const old = R({
      id: "old",
      name: "База",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2026-06-30",
      guardRateCents: 100_00,
    });
    const mid = R({
      id: "mid",
      name: "База",
      effectiveFrom: "2026-07-01",
      effectiveTo: "2026-07-15",
      guardRateCents: 120_00,
    });
    const cur = R({
      id: "cur",
      name: "База",
      effectiveFrom: "2026-07-16",
      guardRateCents: 150_00,
    });
    const chains = buildRateRuleVersionChains([cur, mid, old]);
    expect(chains).toHaveLength(1);
    expect(chains[0]!.current.id).toBe("cur");
    expect(chains[0]!.history.map((h) => h.id)).toEqual(["mid", "old"]);
  });

  it("flatten keeps archive then current for reorder", () => {
    const old = R({ id: "old", name: "A", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" });
    const cur = R({ id: "cur", name: "A", effectiveFrom: "2026-07-01" });
    const other = R({ id: "x", name: "B", effectiveFrom: "2026-01-01", position: "ShiftLead" });
    const chains = buildRateRuleVersionChains([cur, old, other]);
    expect(flattenVersionChainsForReorder(chains)).toEqual(["old", "cur", "x"]);
  });
});
