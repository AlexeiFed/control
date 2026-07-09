import { describe, expect, it } from "vitest";
import { getPreviousCivilDate, getTemplateVersionEffectiveTo } from "../../src/lib/scheduling/shift-template-history";

describe("shift template history", () => {
  it("closes the previous template on the day before a new version starts", () => {
    expect(getPreviousCivilDate("2026-05-01")).toBe("2026-04-30");
  });

  it("sets the new version end before the next future version", () => {
    expect(getTemplateVersionEffectiveTo("2026-05-01", "2026-06-01")).toBe("2026-05-31");
    expect(getTemplateVersionEffectiveTo("2026-05-01", null)).toBeNull();
  });
});
