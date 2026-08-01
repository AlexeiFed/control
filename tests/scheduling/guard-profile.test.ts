import { describe, expect, it } from "vitest";
import { isValidGuardLicenseForPosition, mapGuardLicenseForRates } from "../../src/lib/scheduling/guard-profile";

describe("guard profile invariants", () => {
  const positions = ["Guard", "ShiftLead", "Curator"] as const;

  it.each(positions)("requires Б/У or У for %s", (position) => {
    expect(isValidGuardLicenseForPosition(position, "None")).toBe(true);
    expect(isValidGuardLicenseForPosition(position, "Licensed")).toBe(true);
    expect(isValidGuardLicenseForPosition(position, null)).toBe(false);
  });

  it("ТУ без ЛК для ставок считается как с ЛК", () => {
    expect(mapGuardLicenseForRates({ licenseType: "None", employmentType: "Employed" })).toBe("Licensed");
    expect(mapGuardLicenseForRates({ licenseType: "Licensed", employmentType: "Employed" })).toBe("Licensed");
    expect(mapGuardLicenseForRates({ licenseType: "None", employmentType: "Unemployed" })).toBe("None");
    expect(mapGuardLicenseForRates({ licenseType: "Licensed", employmentType: "Unemployed" })).toBe("Licensed");
  });
});
