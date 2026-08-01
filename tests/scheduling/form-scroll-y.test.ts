import { describe, expect, it } from "vitest";
import { normalizeFormScrollY } from "../../src/lib/scheduling/form-scroll-y";

describe("normalizeFormScrollY", () => {
  it("принимает дробный window.scrollY (частая причина 500 на drag)", () => {
    expect(normalizeFormScrollY("412.5")).toBe("413");
    expect(normalizeFormScrollY(412.5)).toBe("413");
  });

  it("принимает целое и пустые значения", () => {
    expect(normalizeFormScrollY("120")).toBe("120");
    expect(normalizeFormScrollY(0)).toBe("0");
    expect(normalizeFormScrollY("")).toBeUndefined();
    expect(normalizeFormScrollY(undefined)).toBeUndefined();
    expect(normalizeFormScrollY(null)).toBeUndefined();
  });

  it("отбрасывает мусор и отрицательные", () => {
    expect(normalizeFormScrollY("abc")).toBeUndefined();
    expect(normalizeFormScrollY("-12")).toBeUndefined();
    expect(normalizeFormScrollY(Number.NaN)).toBeUndefined();
  });
});
