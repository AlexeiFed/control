import { describe, expect, it } from "vitest";
import {
  defaultCuratorTariffVersionFrom,
  resolveCuratorTariffSavePlan,
} from "../../src/lib/curators/tariff-versioning";

describe("resolveCuratorTariffSavePlan", () => {
  it("updates in place when versionFrom equals open effectiveFrom", () => {
    expect(resolveCuratorTariffSavePlan("2020-01-01", "2020-01-01")).toEqual({ mode: "update" });
  });

  it("supersedes from a later date without touching prior days", () => {
    expect(resolveCuratorTariffSavePlan("2020-01-01", "2026-11-01")).toEqual({
      mode: "supersede",
      closeEffectiveTo: "2026-10-31",
      newEffectiveFrom: "2026-11-01",
    });
  });

  it("rejects versionFrom before open effectiveFrom", () => {
    expect(() => resolveCuratorTariffSavePlan("2026-01-01", "2025-12-01")).toThrow(
      /раньше начала текущей версии/,
    );
  });

  it("rejects invalid date", () => {
    expect(() => resolveCuratorTariffSavePlan("2020-01-01", "01.11.2026")).toThrow(/корректную дату/);
  });
});

describe("defaultCuratorTariffVersionFrom", () => {
  it("returns first day of next month in Khabarovsk", () => {
    // 2026-10-31 12:00 UTC = 2026-10-31 22:00 Хабаровск
    expect(defaultCuratorTariffVersionFrom(new Date("2026-10-31T12:00:00Z"))).toBe("2026-11-01");
  });

  it("rolls year on December", () => {
    expect(defaultCuratorTariffVersionFrom(new Date("2026-12-15T00:00:00+10:00"))).toBe("2027-01-01");
  });
});
