import { describe, expect, it } from "vitest";
import {
  buildPayrollTuData,
  buildPayrollTuPreview,
  buildPayrollTuRow,
  buildPayrollTuSalaryByGuardId,
  collectPayrollTuDaySegments,
  filterPayrollTuRowForPeriod,
  formatPayrollTuNoteLabel,
  isEmployedAtMonth,
  isIncludedInPayrollTuPeriod,
  payrollTuPeriodLabelRu,
  slicePayrollTuDataForPeriod,
  splitPersonsForPayrollTu,
} from "../../src/lib/accounting/payroll-tu";
import { buildGuardPeriodBreakdownByName } from "../../src/lib/payroll/timesheet-guard-period-summary";
import type { TimesheetRow } from "../../src/lib/scheduling/timesheet";
import { buildPayrollTuWorkbook } from "../../src/lib/accounting/payroll-tu-xlsx";
import { payrollTuPeriodFilenameSuffix } from "../../src/lib/payroll/advance-period";

describe("payroll-tu", () => {
  it("filters employed guards and splits by position", () => {
    const split = splitPersonsForPayrollTu({
      year: 2026,
      monthIndex0: 4,
      guards: [
        {
          id: "1",
          name: "Куратор А",
          position: "Curator",
          employmentType: "Employed",
          employedOn: "2020-01-01",
          status: "Active",
        },
        {
          id: "2",
          name: "Охранник Б",
          position: "Guard",
          employmentType: "Employed",
          employedOn: null,
          status: "Active",
        },
        {
          id: "3",
          name: "Охранник В",
          position: "Guard",
          employmentType: "Unemployed",
          employedOn: null,
          status: "Active",
        },
      ],
    });

    expect(split.office).toHaveLength(1);
    expect(split.office[0]?.name).toBe("Куратор А");
    expect(split.guards).toHaveLength(1);
    expect(split.guards[0]?.name).toBe("Охранник Б");
  });

  it("includes guards employed mid-month", () => {
    expect(isEmployedAtMonth("Employed", "2026-05-16", 2026, 4)).toBe(true);
    expect(isEmployedAtMonth("Employed", "2026-06-01", 2026, 4)).toBe(false);
    expect(isEmployedAtMonth("Unemployed", null, 2026, 4)).toBe(false);
    expect(isEmployedAtMonth("Unemployed", "2026-06-16", 2026, 5)).toBe(true);
  });

  it("uses salary from db fields, not daily entries", () => {
    const row = buildPayrollTuRow(
      {
        name: "Охранник Б",
        daily: [
          { day: 1, hours: 12 },
          { day: 16, hours: 24 },
        ],
        salaryFirstHalfRub: 3000,
        salarySecondHalfRub: 6000,
      },
      2026,
      4,
    );

    expect(row.workDaysCount).toBe(2);
    expect(row.totalHours).toBe(36);
    expect(row.salaryFirstHalfRub).toBe(3000);
    expect(row.salarySecondHalfRub).toBe(6000);
  });

  it("notes newly employed without highlight", () => {
    const row = buildPayrollTuRow(
      {
        name: "Новый",
        employedOn: "2026-05-16",
        daily: [{ day: 16, hours: 8 }],
        salaryFirstHalfRub: 0,
        salarySecondHalfRub: 2000,
      },
      2026,
      4,
    );

    expect(row.days.get(15)?.text).toContain("устроен с");
    expect(row.days.get(16)?.text).toBeUndefined();
    expect(row.days.get(16)?.hours).toBe(8);
  });

  it("merges pre-employment days for xlsx note segment", () => {
    const row = buildPayrollTuRow(
      {
        name: "Евстафьев",
        employedOn: "2026-06-08",
        daily: [
          { day: 1, hours: 12 },
          { day: 3, hours: 24 },
          { day: 8, hours: 12 },
          { day: 10, hours: 24 },
        ],
        salaryFirstHalfRub: 5000,
        salarySecondHalfRub: 0,
      },
      2026,
      5,
    );

    expect(row.totalHours).toBe(36);
    expect(row.days.get(1)).toMatchObject({ hours: 0, text: "устроен с 08.06.2026" });
    expect(row.days.get(3)).toMatchObject({ hours: 0, text: "устроен с 08.06.2026" });
    const segments = collectPayrollTuDaySegments(row, 1, 15);
    const employment = segments.find((segment) => segment.kind === "note" && segment.label.includes("устроен"));
    expect(employment).toMatchObject({ kind: "note", fromDay: 1, toDay: 7, label: "устроен с 08.06.2026" });
  });

  it("excludes guards employed from 16th in first-half export", () => {
    const data = buildPayrollTuData({
      year: 2026,
      monthIndex0: 5,
      office: [],
      guards: [
        {
          name: "Калинин",
          employedOn: "2026-06-16",
          daily: [
            { day: 1, hours: 24 },
            { day: 16, hours: 12 },
          ],
          salaryFirstHalfRub: 0,
          salarySecondHalfRub: 5000,
        },
      ],
    });

    expect(isIncludedInPayrollTuPeriod("2026-06-16", "first", 2026, 5)).toBe(false);
    const firstHalf = slicePayrollTuDataForPeriod(data, "first");
    expect(firstHalf.guardRows).toHaveLength(0);

    const month = slicePayrollTuDataForPeriod(data, "month");
    expect(month.guardRows).toHaveLength(1);
    expect(month.guardRows[0]?.totalHours).toBe(12);
    const segments = collectPayrollTuDaySegments(month.guardRows[0]!, 1, 30);
    expect(segments.find((segment) => segment.kind === "note")).toMatchObject({
      fromDay: 1,
      toDay: 15,
      label: "устроен с 16.06.2026",
    });
  });

  it("puts curators from registry position into office section", () => {
    const split = splitPersonsForPayrollTu({
      year: 2026,
      monthIndex0: 5,
      guards: [
        {
          id: "1",
          name: "Павлюк Александр",
          position: "Curator",
          employmentType: "Employed",
          employedOn: null,
          status: "Active",
        },
      ],
    });

    expect(split.office).toHaveLength(1);
    expect(split.guards).toHaveLength(0);
  });

  it("builds preview totals from salary columns", () => {
    const data = buildPayrollTuData({
      year: 2026,
      monthIndex0: 4,
      office: [
        {
          name: "Куратор",
          daily: [{ day: 2, hours: 8 }],
          salaryFirstHalfRub: 1000,
          salarySecondHalfRub: 500,
        },
      ],
      guards: [
        {
          name: "Охранник",
          daily: [{ day: 3, hours: 24 }],
          salaryFirstHalfRub: 2000,
          salarySecondHalfRub: 3000,
        },
      ],
    });

    const preview = buildPayrollTuPreview(data);
    expect(preview.firstHalfTotalRub).toBe(3000);
    expect(preview.monthTotalRub).toBe(6500);
    expect(preview.secondHalfTotalRub).toBe(3500);
    expect(preview.peopleCount).toBe(2);
  });

  it("builds xlsx workbook buffer", async () => {
    const data = buildPayrollTuData({
      year: 2026,
      monthIndex0: 4,
      office: [{ name: "Куратор", daily: [{ day: 1, hours: 8 }], salaryFirstHalfRub: 2620, salarySecondHalfRub: 0 }],
      guards: [{ name: "Охранник", daily: [{ day: 2, hours: 12 }], salaryFirstHalfRub: 0, salarySecondHalfRub: 3000 }],
    });
    const buffer = await buildPayrollTuWorkbook(data);
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it("filters rows and data by export period", () => {
    const row = buildPayrollTuRow(
      {
        name: "Охранник",
        daily: [
          { day: 1, hours: 12 },
          { day: 16, hours: 24 },
        ],
        salaryFirstHalfRub: 3000,
        salarySecondHalfRub: 6000,
      },
      2026,
      4,
    );

    const firstHalf = filterPayrollTuRowForPeriod(row, "first", 2026, 4);
    expect(firstHalf.workDaysCount).toBe(1);
    expect(firstHalf.totalHours).toBe(12);
    expect(firstHalf.salaryFirstHalfRub).toBe(3000);
    expect(firstHalf.salarySecondHalfRub).toBe(0);
    expect(firstHalf.days.has(16)).toBe(false);

    const secondHalf = filterPayrollTuRowForPeriod(row, "second", 2026, 4);
    expect(secondHalf.workDaysCount).toBe(1);
    expect(secondHalf.totalHours).toBe(24);
    expect(secondHalf.salarySecondHalfRub).toBe(6000);
    expect(secondHalf.salaryFirstHalfRub).toBe(0);
  });

  it("builds half-period xlsx workbooks", async () => {
    const data = buildPayrollTuData({
      year: 2026,
      monthIndex0: 4,
      office: [{ name: "Куратор", daily: [{ day: 1, hours: 8 }], salaryFirstHalfRub: 1000, salarySecondHalfRub: 500 }],
      guards: [{ name: "Охранник", daily: [{ day: 16, hours: 12 }], salaryFirstHalfRub: 0, salarySecondHalfRub: 3000 }],
    });

    const first = await buildPayrollTuWorkbook(slicePayrollTuDataForPeriod(data, "first"), "first");
    const second = await buildPayrollTuWorkbook(slicePayrollTuDataForPeriod(data, "second"), "second");
    expect(first.byteLength).toBeGreaterThan(1000);
    expect(second.byteLength).toBeGreaterThan(1000);
  });

  it("formats period labels and filename suffixes", () => {
    expect(payrollTuPeriodLabelRu("first", 2026, 4)).toBe("с 1 по 15");
    expect(payrollTuPeriodLabelRu("second", 2026, 4)).toBe("с 16 по 31");
    expect(payrollTuPeriodLabelRu("month", 2026, 4)).toBe("За весь месяц");
    expect(payrollTuPeriodFilenameSuffix("first", 2026, 4)).toBe("_1-15");
    expect(payrollTuPeriodFilenameSuffix("month", 2026, 4)).toBe("");
  });

  it("groups sick leave days into one note segment with date range", () => {
    const row = buildPayrollTuRow(
      {
        name: "Кулаков",
        status: "Sick",
        daily: [],
        salaryFirstHalfRub: 0,
        salarySecondHalfRub: 0,
      },
      2026,
      5,
    );

    const segments = collectPayrollTuDaySegments(row, 16, 30);
    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({
      kind: "note",
      fromDay: 16,
      toDay: 30,
      label: "больничный с 16 по 30",
    });
  });

  it("formats note labels for sick leave, vacation and employment", () => {
    expect(formatPayrollTuNoteLabel("больничный", 16, 30)).toBe("больничный с 16 по 30");
    expect(formatPayrollTuNoteLabel("отпуск", 5, 5)).toBe("отпуск с 5");
    expect(formatPayrollTuNoteLabel("устроен с 16.06.2026", 1, 15)).toBe("устроен с 16.06.2026");
  });

  it("salary totals match tabell guard_amount_cents by half without averaging", () => {
    const month = { year: 2026, monthIndex0: 5 };
    const rows: TimesheetRow[] = [
      {
        guardName: "Антонов Олег",
        objectName: "ИП ПЕТУХОВ",
        startsAt: "2026-06-05T08:00:00+10:00",
        endsAt: "2026-06-05T22:00:00+10:00",
        totalHours: 14,
        nightHours: 0,
        holidayHours: 0,
        regularHours: 14,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours: 0,
        incidentsCount: 0,
        attendanceIncident: null,
        incidentLogLines: [],
        clientAmountCents: 0,
        guardAmountCents: 240002,
        marginCents: 0,
        guardRateContributions: [{ guardRateCents: 17143, minutes: 840, amountCents: 240002 }],
        unpriced: false,
        isNoShow: false,
      },
      {
        guardName: "Антонов Олег",
        objectName: "ИП ПЕТУХОВ",
        startsAt: "2026-06-06T04:00:00+10:00",
        endsAt: "2026-06-06T22:00:00+10:00",
        totalHours: 18,
        nightHours: 0,
        holidayHours: 0,
        regularHours: 18,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours: 0,
        incidentsCount: 0,
        attendanceIncident: null,
        incidentLogLines: [],
        clientAmountCents: 0,
        guardAmountCents: 320004,
        marginCents: 0,
        guardRateContributions: [{ guardRateCents: 17778, minutes: 1080, amountCents: 320004 }],
        unpriced: false,
        isNoShow: false,
      },
    ];

    const guardIdByName = new Map([["Антонов Олег", "g1"]]);
    const employedOnByGuardId = new Map<string, string | null>([["g1", null]]);
    const includedGuardIds = new Set(["g1"]);

    const salary = buildPayrollTuSalaryByGuardId({
      rows,
      guardIdByName,
      employedOnByGuardId,
      month,
      includedGuardIds,
    });

    expect(salary.get("g1")).toEqual({ firstHalfRub: 5600.06, secondHalfRub: 0 });

    const breakdown = buildGuardPeriodBreakdownByName(rows, month);
    expect(breakdown.get("Антонов Олег")?.first.guardAmountCents).toBe(560006);
  });

  it("excludes salary for days before employedOn", () => {
    const month = { year: 2026, monthIndex0: 5 };
    const rows: TimesheetRow[] = [
      {
        guardName: "Калинин",
        objectName: "Объект",
        startsAt: "2026-06-01T08:00:00+10:00",
        endsAt: "2026-06-01T20:00:00+10:00",
        totalHours: 12,
        nightHours: 0,
        holidayHours: 0,
        regularHours: 12,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours: 0,
        incidentsCount: 0,
        attendanceIncident: null,
        incidentLogLines: [],
        clientAmountCents: 0,
        guardAmountCents: 100000,
        marginCents: 0,
        unpriced: false,
        isNoShow: false,
      },
      {
        guardName: "Калинин",
        objectName: "Объект",
        startsAt: "2026-06-16T08:00:00+10:00",
        endsAt: "2026-06-16T20:00:00+10:00",
        totalHours: 12,
        nightHours: 0,
        holidayHours: 0,
        regularHours: 12,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours: 0,
        incidentsCount: 0,
        attendanceIncident: null,
        incidentLogLines: [],
        clientAmountCents: 0,
        guardAmountCents: 200000,
        marginCents: 0,
        unpriced: false,
        isNoShow: false,
      },
    ];

    const salary = buildPayrollTuSalaryByGuardId({
      rows,
      guardIdByName: new Map([["Калинин", "g2"]]),
      employedOnByGuardId: new Map([["g2", "2026-06-16"]]),
      month,
      includedGuardIds: new Set(["g2"]),
    });

    expect(salary.get("g2")).toEqual({ firstHalfRub: 0, secondHalfRub: 2000 });
  });
});
