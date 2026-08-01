import { describe, expect, it } from "vitest";
import { GuardProfileResolver, type GuardProfilePeriodRecord } from "../../src/lib/guards/profile-periods";
import type { ObjectRateRuleRecord } from "../../src/lib/operations/object-rate-rules-repository";
import { computeShiftRateBreakdown } from "../../src/lib/rates/rate-calculator";
import { createSchedulerGuard, createSchedulerShift } from "../../src/lib/scheduling/types";
import { buildTimesheetRows } from "../../src/lib/scheduling/timesheet";

const TZ = "Asia/Khabarovsk";

function rule(
  partial: Partial<ObjectRateRuleRecord> & Pick<ObjectRateRuleRecord, "id" | "name">,
): ObjectRateRuleRecord {
  return {
    objectId: "o-shantie",
    daysOfWeek: null,
    isHoliday: null,
    shiftKind: "Regular",
    startsAt: "08:00",
    endsAt: "08:00",
    position: "Guard",
    licenseType: "Licensed",
    employmentType: "Employed",
    isTrainee: null,
    clientRateCents: 0,
    guardRateCents: 17_500,
    rateUnit: "Hour",
    priority: 100,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    ...partial,
  };
}

function period(
  partial: Partial<GuardProfilePeriodRecord> &
    Pick<GuardProfilePeriodRecord, "id" | "periodKind" | "effectiveFrom">,
): GuardProfilePeriodRecord {
  return {
    guardId: "g-kalinin",
    effectiveTo: null,
    position: null,
    employmentType: null,
    isTrainee: null,
    traineeUntil: null,
    licenseType: null,
    note: "",
    createdBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("Kalinin-like: Employed before personal card (LK)", () => {
  const shantieRules = [
    rule({ id: "bu", name: "ОХРАННИК Б/У", licenseType: "None", employmentType: "Unemployed", guardRateCents: 16_667 }),
    rule({ id: "lk", name: "ОХРАННИК ЛК", licenseType: "Licensed", employmentType: "Unemployed", guardRateCents: 17_083 }),
    rule({ id: "tu", name: "ОХРАННИК ТУ", licenseType: "Licensed", employmentType: "Employed", guardRateCents: 17_500 }),
  ];

  const baseGuard = createSchedulerGuard({
    id: "g-kalinin",
    name: "Калинин Игорь",
    status: "Active",
  });
  baseGuard.position = "Guard";
  baseGuard.licenseType = "Licensed";
  baseGuard.employmentType = "Employed";
  baseGuard.isTrainee = false;

  const periods = [
    period({
      id: "lic-none",
      periodKind: "license",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2026-06-18",
      licenseType: "None",
    }),
    period({
      id: "lic-ok",
      periodKind: "license",
      effectiveFrom: "2026-06-19",
      licenseType: "Licensed",
    }),
    period({
      id: "emp-off",
      periodKind: "employment",
      effectiveFrom: "2020-01-01",
      effectiveTo: "2026-06-15",
      employmentType: "Unemployed",
    }),
    period({
      id: "emp-on",
      periodKind: "employment",
      effectiveFrom: "2026-06-16",
      employmentType: "Employed",
    }),
  ];

  it("16.06: Employed без ЛК → ставка ОХРАННИК ТУ (ТУ приоритетнее ЛК)", () => {
    const resolver = new GuardProfileResolver(periods);
    const resolved = resolver.resolveGuardAt(baseGuard, "2026-06-16");
    expect(resolved.licenseType).toBe("None");
    expect(resolved.employmentType).toBe("Employed");

    const shift = createSchedulerShift({
      id: "s1",
      guardId: baseGuard.id,
      objectId: "o-shantie",
      startsAt: new Date("2026-06-16T08:00:00+10:00"),
      endsAt: new Date("2026-06-17T08:00:00+10:00"),
    });
    shift.shiftKind = "Regular";

    const withHistorical = computeShiftRateBreakdown(shift, resolved, shantieRules, new Set(), TZ);
    expect(withHistorical.guardAmountCents).toBe(17_500 * 24);
    expect(withHistorical.unpricedMinutes).toBe(0);

    const rows = buildTimesheetRows({
      guards: [baseGuard],
      objects: [{ id: "o-shantie", name: "ШАНТЬЕ", address: "", status: "Active", operationalDayStartTime: "08:00" }],
      shifts: [shift],
      rateRulesByObjectId: { "o-shantie": shantieRules },
      profileResolver: resolver,
      timeZone: TZ,
    });
    expect(rows[0]?.guardAmountCents).toBe(17_500 * 24);
    expect(rows[0]?.unpriced).toBe(false);
  });

  it("19.06: после даты ЛК матчится ОХРАННИК ТУ", () => {
    const resolver = new GuardProfileResolver(periods);
    const resolved = resolver.resolveGuardAt(baseGuard, "2026-06-19");
    expect(resolved.licenseType).toBe("Licensed");
    expect(resolved.employmentType).toBe("Employed");

    const shift = createSchedulerShift({
      id: "s2",
      guardId: baseGuard.id,
      objectId: "o-shantie",
      startsAt: new Date("2026-06-19T08:00:00+10:00"),
      endsAt: new Date("2026-06-20T08:00:00+10:00"),
    });
    const out = computeShiftRateBreakdown(shift, resolved, shantieRules, new Set(), TZ);
    expect(out.guardAmountCents).toBe(17_500 * 24);
    expect(out.unpricedMinutes).toBe(0);
  });
});
