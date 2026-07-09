import { describe, expect, it } from "vitest";
import {
  dateInProfilePeriod,
  GuardProfilePeriodRecord,
  GuardProfileResolver,
  periodsOverlap,
  resolveGuardProfileFromPeriods,
} from "../../src/lib/guards/profile-periods";
import { createSchedulerGuard } from "../../src/lib/scheduling/types";

function P(
  partial: Partial<GuardProfilePeriodRecord> & Pick<GuardProfilePeriodRecord, "id" | "periodKind" | "effectiveFrom">,
): GuardProfilePeriodRecord {
  return {
    guardId: "g1",
    effectiveTo: null,
    position: null,
    employmentType: null,
    isTrainee: null,
    traineeUntil: null,
    licenseType: null,
    note: "",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("profile-periods", () => {
  it("dateInProfilePeriod inclusive bounds", () => {
    expect(dateInProfilePeriod("2026-05-02", "2026-05-01", "2026-05-31")).toBe(true);
    expect(dateInProfilePeriod("2026-05-01", "2026-05-01", "2026-05-31")).toBe(true);
    expect(dateInProfilePeriod("2026-05-31", "2026-05-01", "2026-05-31")).toBe(true);
    expect(dateInProfilePeriod("2026-06-01", "2026-05-01", "2026-05-31")).toBe(false);
  });

  it("resolves temporary curator position on shift date", () => {
    const guard = createSchedulerGuard({ id: "g1", name: "G", status: "Active" });
    guard.position = "Guard";
    guard.licenseType = "Licensed";
    guard.employmentType = "Employed";

    const periods = [
      P({ id: "1", periodKind: "position", effectiveFrom: "2020-01-01", effectiveTo: "2026-04-30", position: "Guard" }),
      P({ id: "2", periodKind: "position", effectiveFrom: "2026-05-01", effectiveTo: "2026-05-31", position: "Curator" }),
      P({ id: "3", periodKind: "position", effectiveFrom: "2026-06-01", position: "Guard" }),
    ];

    expect(resolveGuardProfileFromPeriods(guard, "2026-04-15", periods).position).toBe("Guard");
    expect(resolveGuardProfileFromPeriods(guard, "2026-05-02", periods).position).toBe("Curator");
    expect(resolveGuardProfileFromPeriods(guard, "2026-06-10", periods).position).toBe("Guard");
  });

  it("overlap detection", () => {
    expect(
      periodsOverlap({ effectiveFrom: "2026-05-01", effectiveTo: "2026-05-31" }, { effectiveFrom: "2026-05-15", effectiveTo: null }),
    ).toBe(true);
    expect(
      periodsOverlap({ effectiveFrom: "2026-05-01", effectiveTo: "2026-05-10" }, { effectiveFrom: "2026-05-11", effectiveTo: null }),
    ).toBe(false);
  });

  it("resolver picks latest effective_from on overlap", () => {
    const resolver = new GuardProfileResolver([
      P({ id: "a", periodKind: "employment", effectiveFrom: "2026-01-01", employmentType: "Unemployed" }),
      P({ id: "b", periodKind: "employment", effectiveFrom: "2026-05-15", employmentType: "Employed" }),
    ]);
    const guard = createSchedulerGuard({ id: "g1", name: "G", status: "Active" });
    guard.employmentType = "Unemployed";
    expect(resolver.resolveGuardAt(guard, "2026-05-20").employmentType).toBe("Employed");
  });

  it("does not throw when guard traineeUntil is invalid Date", () => {
    const guard = createSchedulerGuard({ id: "g1", name: "G", status: "Active" });
    guard.traineeUntil = new Date("invalid");

    expect(() => new GuardProfileResolver([]).resolveGuardAt(guard, "2026-06-01")).not.toThrow();
    expect(new GuardProfileResolver([]).resolveGuardAt(guard, "2026-06-01").traineeUntil).toBeNull();
  });

  it("снимает статус стажёра после traineeUntil", () => {
    const guard = createSchedulerGuard({ id: "g1", name: "G", status: "Active" });
    guard.isTrainee = true;
    guard.traineeUntil = new Date("2026-07-10T12:00:00+10:00");

    const periods = [
      P({
        id: "t1",
        periodKind: "trainee",
        effectiveFrom: "2026-01-01",
        isTrainee: true,
        traineeUntil: "2026-07-10",
      }),
    ];

    expect(resolveGuardProfileFromPeriods(guard, "2026-07-10", periods).isTrainee).toBe(true);
    expect(resolveGuardProfileFromPeriods(guard, "2026-07-11", periods).isTrainee).toBe(false);
  });

  it("досрочное снятие стажёра через период isTrainee=false", () => {
    const guard = createSchedulerGuard({ id: "g1", name: "G", status: "Active" });
    guard.isTrainee = true;
    guard.traineeUntil = new Date("2026-07-10T12:00:00+10:00");

    const periods = [
      P({
        id: "t1",
        periodKind: "trainee",
        effectiveFrom: "2026-01-01",
        isTrainee: true,
        traineeUntil: "2026-07-10",
      }),
      P({
        id: "t2",
        periodKind: "trainee",
        effectiveFrom: "2026-07-01",
        isTrainee: false,
        traineeUntil: null,
      }),
    ];

    expect(resolveGuardProfileFromPeriods(guard, "2026-07-05", periods).isTrainee).toBe(false);
  });
});
