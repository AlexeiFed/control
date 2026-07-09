import { describe, expect, it } from "vitest";
import {
  buildPayrollStatementSheets,
  formatPayrollStatementFooter,
  formatPayrollStatementPeriodLabel,
} from "../../src/lib/accounting/payroll-statement";
import type { TimesheetRow } from "../../src/lib/scheduling/timesheet";

describe("payroll statement labels", () => {
  it("подпись внизу зависит от выбранного месяца", () => {
    expect(formatPayrollStatementFooter(2026, 4)).toBe("МАЙ 2026 года");
    expect(formatPayrollStatementFooter(2026, 5)).toBe("ИЮНЬ 2026 года");
    expect(formatPayrollStatementFooter(2026, 0)).toBe("ЯНВАРЬ 2026 года");
  });

  it("период в заголовке зависит от выбранного месяца", () => {
    expect(formatPayrollStatementPeriodLabel(2026, 4, "second")).toBe("за МАЙ 16-31, 2026г.");
    expect(formatPayrollStatementPeriodLabel(2026, 1, "second")).toBe("за ФЕВРАЛЬ 16-28, 2026г.");
  });
});

describe("buildPayrollStatementSheets", () => {
  const baseRow = (overrides: Partial<TimesheetRow>): TimesheetRow => ({
    guardName: "Иванов Иван",
    objectName: "Объект А",
    startsAt: "2026-05-02T04:00:00.000Z",
    endsAt: "2026-05-02T12:00:00.000Z",
    totalHours: 8,
    nightHours: 0,
    holidayHours: 0,
    incidentsCount: 0,
    attendanceIncident: null,
    incidentLogLines: [],
    regularHours: 8,
    reinforcementHours: 0,
    rapidResponseHours: 0,
    unworkedHours: 0,
    isNoShow: false,
    clientAmountCents: 0,
    guardAmountCents: 200_004,
    marginCents: 0,
    unpriced: false,
    ...overrides,
  });

  it("формирует строку ведомости с авансом и итого к выдаче", () => {
    const sheets = buildPayrollStatementSheets({
      rows: [baseRow({})],
      objects: [{ id: "o1", name: "Объект А", address: "ул. Тест, 1" }],
      half: "first",
      year: 2026,
      monthIndex0: 4,
      guardIdByName: new Map([["Иванов Иван", "g1"]]),
      advancesByGuardId: new Map([["g1", { firstHalfRub: 500, secondHalfRub: 0 }]]),
    });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]?.rows[0]).toMatchObject({
      guardName: "Иванов Иван",
      totalSalaryRub: 2000.04,
      advanceRub: 500,
      fineCount: 0,
      toPayRub: 1500.04,
    });
  });

  it("не заполняет итого к выдаче при инцидентах", () => {
    const sheets = buildPayrollStatementSheets({
      rows: [baseRow({ incidentsCount: 2 })],
      objects: [{ id: "o1", name: "Объект А", address: "ул. Тест, 1" }],
      half: "first",
      year: 2026,
      monthIndex0: 4,
      guardIdByName: new Map([["Иванов Иван", "g1"]]),
      advancesByGuardId: new Map(),
    });
    expect(sheets[0]?.rows[0]?.fineCount).toBe(2);
    expect(sheets[0]?.rows[0]?.toPayRub).toBeNull();
  });
});
