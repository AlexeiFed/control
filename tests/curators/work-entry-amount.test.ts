import { describe, expect, it } from "vitest";
import {
  computeCuratorEntryRub,
  NIGHT_INSPECTION_RUB,
  ROUTE_BASE_RUB,
  ROUTE_HOURLY_RUB,
} from "../../src/lib/curators/work-entry-amount";

describe("computeCuratorEntryRub", () => {
  it("маршрут: 500 + 265 за час", () => {
    expect(computeCuratorEntryRub("RouteObjects", 1)).toBe(ROUTE_BASE_RUB + ROUTE_HOURLY_RUB);
    expect(computeCuratorEntryRub("RouteObjects", 2)).toBe(ROUTE_BASE_RUB + ROUTE_HOURLY_RUB * 2);
    expect(computeCuratorEntryRub("RouteObjects", 1.5)).toBe(Math.round(ROUTE_BASE_RUB + ROUTE_HOURLY_RUB * 1.5));
  });

  it("ночная проверка фикс", () => {
    expect(computeCuratorEntryRub("NightInspection", null)).toBe(NIGHT_INSPECTION_RUB);
  });

  it("замена: 200 за час", () => {
    expect(computeCuratorEntryRub("ReplacementShift", 3)).toBe(600);
  });

  it("оклад по должности: фиксированная сумма", () => {
    expect(
      computeCuratorEntryRub("MonthlySalary", null, undefined, {
        monthlySalaryRub: 25_000,
      }),
    ).toBe(25_000);
  });
});
