import { describe, expect, it } from "vitest";
import {
  computeScheduleRegularTopUp,
  isCuratorScheduleTopUpExcluded,
} from "../../src/lib/curators/schedule-top-up";

describe("computeScheduleRegularTopUp", () => {
  it("считает фиксированную доплату за час дежурства", () => {
    const r = computeScheduleRegularTopUp({
      timesheetGuardRub: 2100,
      hours: 12,
      scheduleRegularHourlyRub: 25,
      ruleName: "ОХРАННИК Б/У",
      rateUnit: "Hour",
      ruleGuardRateCents: 17500,
    });
    expect(r.topUpHourlyRub).toBe(25);
    expect(r.amountRub).toBe(300);
    expect(r.paymentFormula).toContain("Доплата: 25 ₽/ч × 12 ч = 300 ₽");
  });

  it("доплата не зависит от ставки объекта", () => {
    const lowRate = computeScheduleRegularTopUp({
      timesheetGuardRub: 2100,
      hours: 12,
      scheduleRegularHourlyRub: 25,
      ruleName: null,
      rateUnit: "Hour",
      ruleGuardRateCents: 17500,
    });
    const highRate = computeScheduleRegularTopUp({
      timesheetGuardRub: 3000,
      hours: 12,
      scheduleRegularHourlyRub: 25,
      ruleName: null,
      rateUnit: "Hour",
      ruleGuardRateCents: 25000,
    });
    expect(lowRate.amountRub).toBe(300);
    expect(highRate.amountRub).toBe(300);
  });

  it("доплата 0 если тариф 0", () => {
    const r = computeScheduleRegularTopUp({
      timesheetGuardRub: 2100,
      hours: 12,
      scheduleRegularHourlyRub: 0,
      ruleName: null,
      rateUnit: "Hour",
      ruleGuardRateCents: 17500,
    });
    expect(r.amountRub).toBe(0);
  });

  it("исключение: Коваленко Денис на КУЛЬТУРА КЛАССИКА", () => {
    expect(
      isCuratorScheduleTopUpExcluded({
        lastName: "Коваленко",
        firstName: "Денис",
        objectName: "ООО ЭК КУЛЬТУРА КЛАССИКА",
      }),
    ).toBe(true);
    expect(
      isCuratorScheduleTopUpExcluded({
        lastName: "Коваленко",
        firstName: "Денис",
        objectName: "ООО СТРОЙКОР",
      }),
    ).toBe(false);
  });
});
