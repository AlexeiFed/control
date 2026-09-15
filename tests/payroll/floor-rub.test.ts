import { describe, expect, it } from "vitest";
import { floorCentsToRub, floorRub } from "../../src/lib/payroll/floor-rub";

describe("floorRub", () => {
  it("отбрасывает копейки вниз", () => {
    expect(floorRub(958.32)).toBe(958);
    expect(floorRub(10750.2)).toBe(10750);
    expect(floorRub(15552)).toBe(15552);
    expect(floorRub(0.99)).toBe(0);
    expect(floorRub(-1)).toBe(0);
  });
});

describe("floorCentsToRub", () => {
  it("делит копейки на 100 и округляет вниз", () => {
    expect(floorCentsToRub(200_004)).toBe(2000);
    expect(floorCentsToRub(560_006)).toBe(5600);
    expect(floorCentsToRub(99)).toBe(0);
  });
});
