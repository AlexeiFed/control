import { describe, expect, it } from "vitest";
import { shouldAlertSickGuardFutureShift } from "../../src/lib/scheduling/sick-guard-shift-alert";

describe("shouldAlertSickGuardFutureShift", () => {
  const now = new Date("2026-07-13T12:00:00+10:00");

  it("alerts sick guard on today and future dates", () => {
    expect(shouldAlertSickGuardFutureShift("Sick", "2026-07-13", now)).toBe(true);
    expect(shouldAlertSickGuardFutureShift("Sick", "2026-07-14", now)).toBe(true);
  });

  it("skips past dates and non-sick statuses", () => {
    expect(shouldAlertSickGuardFutureShift("Sick", "2026-07-12", now)).toBe(false);
    expect(shouldAlertSickGuardFutureShift("Active", "2026-07-14", now)).toBe(false);
    expect(shouldAlertSickGuardFutureShift("OnVacation", "2026-07-14", now)).toBe(false);
  });
});
