import { describe, expect, it } from "vitest";
import {
  buildGuardPeriodBreakdownByName,
  classifyShiftType,
} from "../../src/lib/payroll/timesheet-guard-period-summary";
import type { TimesheetRow } from "../../src/lib/scheduling/timesheet";

function row(partial: Partial<TimesheetRow> & Pick<TimesheetRow, "guardName" | "startsAt">): TimesheetRow {
  return {
    objectName: "Объект",
    endsAt: partial.startsAt,
    totalHours: 12,
    nightHours: 0,
    holidayHours: 0,
    incidentsCount: 0,
    attendanceIncident: null,
    incidentLogLines: [],
    regularHours: 12,
    reinforcementHours: 0,
    rapidResponseHours: 0,
    unworkedHours: 0,
    isNoShow: false,
    clientAmountCents: 0,
    guardAmountCents: 200000,
    marginCents: 0,
    unpriced: false,
    ...partial,
  };
}

describe("classifyShiftType", () => {
  it("различает типы смен по часам", () => {
    expect(classifyShiftType(row({ guardName: "A", startsAt: "2026-06-01T22:00:00+10:00" }))).toBe("regular");
    expect(
      classifyShiftType(
        row({
          guardName: "A",
          startsAt: "2026-06-01T22:00:00+10:00",
          regularHours: 0,
          reinforcementHours: 12,
        }),
      ),
    ).toBe("reinforcement");
    expect(
      classifyShiftType(
        row({
          guardName: "A",
          startsAt: "2026-06-01T22:00:00+10:00",
          regularHours: 0,
          rapidResponseHours: 12,
        }),
      ),
    ).toBe("rapidResponse");
  });
});

describe("buildGuardPeriodBreakdownByName", () => {
  it("группирует смены по половинам месяца и типам", () => {
    const rows = [
      row({ guardName: "Иванов", startsAt: "2026-06-05T22:00:00+10:00", guardAmountCents: 100000 }),
      row({ guardName: "Иванов", startsAt: "2026-06-20T22:00:00+10:00", guardAmountCents: 150000 }),
      row({
        guardName: "Иванов",
        startsAt: "2026-07-01T22:00:00+10:00",
        guardAmountCents: 99999,
      }),
    ];

    const map = buildGuardPeriodBreakdownByName(rows, { year: 2026, monthIndex0: 5 });
    const ivanov = map.get("Иванов");
    expect(ivanov).toBeDefined();
    expect(ivanov!.first.shiftsCount).toBe(1);
    expect(ivanov!.first.guardAmountCents).toBe(100000);
    expect(ivanov!.second.shiftsCount).toBe(1);
    expect(ivanov!.second.guardAmountCents).toBe(150000);
    expect(ivanov!.first.byType.regular[0]?.shiftsCount).toBe(1);
  });

  it("разделяет строки по тарифной ставке правила, без усреднения", () => {
    const rows = [
      row({
        guardName: "Антонов",
        startsAt: "2026-06-05T22:00:00+10:00",
        regularHours: 10,
        totalHours: 10,
        guardAmountCents: 171430,
        guardRateContributions: [{ guardRateCents: 17143, minutes: 600, amountCents: 171430 }],
      }),
      row({
        guardName: "Антонов",
        startsAt: "2026-06-07T22:00:00+10:00",
        regularHours: 12,
        totalHours: 12,
        guardAmountCents: 213336,
        guardRateContributions: [{ guardRateCents: 17778, minutes: 720, amountCents: 213336 }],
      }),
      row({
        guardName: "Антонов",
        startsAt: "2026-06-06T22:00:00+10:00",
        regularHours: 18,
        totalHours: 18,
        guardAmountCents: 314924,
        guardRateContributions: [
          { guardRateCents: 17143, minutes: 480, amountCents: 137144 },
          { guardRateCents: 17778, minutes: 600, amountCents: 177780 },
        ],
      }),
    ];

    const map = buildGuardPeriodBreakdownByName(rows, { year: 2026, monthIndex0: 5 });
    const antonov = map.get("Антонов");
    expect(antonov).toBeDefined();
    expect(antonov!.first.byType.regular).toHaveLength(2);
    expect(antonov!.first.byType.regular.map((line) => line.hourlyRateCents)).toEqual([17143, 17778]);
    expect(antonov!.first.guardAmountCents).toBe(699690);
  });
});
