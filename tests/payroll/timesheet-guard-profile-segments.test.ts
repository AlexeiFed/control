import { describe, expect, it } from "vitest";
import { GuardProfileResolver } from "../../src/lib/guards/profile-periods";
import type { GuardProfilePeriodRecord } from "../../src/lib/guards/profile-periods";
import { buildGuardPayrollHalfBreakdown } from "../../src/lib/payroll/timesheet-guard-profile-segments";
import type { TimesheetRow } from "../../src/lib/scheduling/timesheet";
import { createSchedulerGuard } from "../../src/lib/scheduling/types";

function period(
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

function row(partial: Partial<TimesheetRow> & Pick<TimesheetRow, "startsAt">): TimesheetRow {
  return {
    guardName: "Ворожбицкий Игорь",
    objectName: "АВТОБАЗА",
    endsAt: partial.startsAt,
    totalHours: 17,
    nightHours: 0,
    holidayHours: 0,
    incidentsCount: 0,
    attendanceIncident: null,
    incidentLogLines: [],
    regularHours: 17,
    reinforcementHours: 0,
    rapidResponseHours: 0,
    unworkedHours: 0,
    isNoShow: false,
    clientAmountCents: 0,
    guardAmountCents: 283339,
    marginCents: 0,
    unpriced: false,
    ...partial,
  };
}

describe("buildGuardPayrollHalfBreakdown", () => {
  it("группирует по половинам 1–15 и 16–30, внутри второй — смена ставки с даты", () => {
    const baseGuard = createSchedulerGuard({ id: "g1", name: "Ворожбицкий Игорь", status: "Active" });
    baseGuard.licenseType = "Licensed";
    baseGuard.employmentType = "Unemployed";

    const periods = [
      period({ id: "l1", periodKind: "license", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-18", licenseType: "None" }),
      period({ id: "l2", periodKind: "license", effectiveFrom: "2026-06-19", licenseType: "Licensed" }),
      period({ id: "e1", periodKind: "employment", effectiveFrom: "2026-01-01", employmentType: "Unemployed" }),
    ];
    const resolver = new GuardProfileResolver(periods);

    const breakdown = buildGuardPayrollHalfBreakdown(
      [
        row({ startsAt: "2026-06-05T22:00:00+10:00", guardAmountCents: 283339, totalHours: 17, regularHours: 17 }),
        row({ startsAt: "2026-06-18T22:00:00+10:00", guardAmountCents: 400008, totalHours: 24, regularHours: 24 }),
        row({ startsAt: "2026-06-20T22:00:00+10:00", guardAmountCents: 2049960, totalHours: 120, regularHours: 120 }),
      ],
      { year: 2026, monthIndex0: 5 },
      baseGuard,
      resolver,
      periods,
    );

    expect(breakdown.first.shiftsCount).toBe(1);
    expect(breakdown.first.segments).toHaveLength(1);
    expect(breakdown.first.segments[0]?.rateSinceLabel).toBeNull();

    expect(breakdown.second.shiftsCount).toBe(2);
    expect(breakdown.second.segments).toHaveLength(2);
    expect(breakdown.second.segments[0]?.profileLabel).toContain("Б/У");
    expect(breakdown.second.segments[0]?.rateSinceLabel).toBeNull();
    expect(breakdown.second.segments[1]?.profileLabel).toContain("У");
    expect(breakdown.second.segments[1]?.rateSinceLabel).toBe("с 19.06.2026");
  });

  it("не делит карточку, если период профиля повторяет те же значения", () => {
    const baseGuard = createSchedulerGuard({ id: "g1", name: "Ковылин Павел", status: "Active" });
    baseGuard.licenseType = "None";
    baseGuard.employmentType = "Unemployed";

    const periods = [
      period({ id: "l1", periodKind: "license", effectiveFrom: "2026-01-01", licenseType: "None" }),
      period({ id: "l2", periodKind: "license", effectiveFrom: "2026-06-26", licenseType: "None" }),
      period({ id: "e1", periodKind: "employment", effectiveFrom: "2026-01-01", employmentType: "Unemployed" }),
    ];
    const resolver = new GuardProfileResolver(periods);

    const breakdown = buildGuardPayrollHalfBreakdown(
      [
        row({
          guardName: "Ковылин Павел",
          startsAt: "2026-06-16T22:00:00+10:00",
          guardAmountCents: 240002,
          totalHours: 14,
          regularHours: 14,
        }),
        row({
          guardName: "Ковылин Павел",
          startsAt: "2026-06-26T22:00:00+10:00",
          guardAmountCents: 240002,
          totalHours: 14,
          regularHours: 14,
        }),
        row({
          guardName: "Ковылин Павел",
          startsAt: "2026-06-28T22:00:00+10:00",
          guardAmountCents: 240002,
          totalHours: 14,
          regularHours: 14,
        }),
      ],
      { year: 2026, monthIndex0: 5 },
      baseGuard,
      resolver,
      periods,
    );

    expect(breakdown.second.shiftsCount).toBe(3);
    expect(breakdown.second.segments).toHaveLength(1);
    expect(breakdown.second.segments[0]?.rateSinceLabel).toBeNull();
  });
});
