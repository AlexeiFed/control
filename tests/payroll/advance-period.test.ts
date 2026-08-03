import { describe, expect, it } from "vitest";
import {
  dateIsoBelongsToHalf,
  dateIsoInPayrollMonth,
  dayOfMonthInZone,
  halfPeriodLabelRu,
  halfPeriodShortRu,
  shiftBelongsToHalf,
  shiftStartsInPayrollMonth,
  type PayrollMonthContext,
} from "../../src/lib/payroll/advance-period";
import { resolveTimesheetRowOperationalDateIso } from "../../src/lib/accounting/timesheet-operational-day";
import { operationalDayMonthKey } from "../../src/lib/scheduling/operational-day-anchors";
import { buildGuardPayrollHalfSummaries, buildObjectPayrollHalfSummaries } from "../../src/lib/payroll/timesheet-payroll-summary";
import type { TimesheetRow } from "../../src/lib/scheduling/timesheet";

const MAY_2026: PayrollMonthContext = { year: 2026, monthIndex0: 4 };
const JUNE_2026: PayrollMonthContext = { year: 2026, monthIndex0: 5 };

describe("advance-period", () => {
  it("определяет полупериод по дате смены (Хабаровск)", () => {
    expect(shiftBelongsToHalf("2026-05-02T04:00:00.000Z", "first", MAY_2026)).toBe(true);
    expect(shiftBelongsToHalf("2026-05-02T04:00:00.000Z", "second", MAY_2026)).toBe(false);
    expect(shiftBelongsToHalf("2026-05-16T04:00:00.000Z", "second", MAY_2026)).toBe(true);
    expect(dayOfMonthInZone("2026-05-15T13:00:00.000Z")).toBe(15);
    expect(shiftBelongsToHalf("2026-06-15T22:00:00.000Z", "first", JUNE_2026)).toBe(false);
    expect(shiftBelongsToHalf("2026-06-15T22:00:00.000Z", "second", JUNE_2026)).toBe(true);
    expect(shiftBelongsToHalf("2026-06-16T01:00:00+03:00", "first", JUNE_2026)).toBe(false);
  });

  it("не переносит смену 1 июля в половину 1–15 июня", () => {
    const julyFirstShift = "2026-06-30T23:00:00.000Z";
    expect(shiftStartsInPayrollMonth(julyFirstShift, JUNE_2026)).toBe(false);
    expect(shiftBelongsToHalf(julyFirstShift, "first", JUNE_2026)).toBe(false);
    expect(shiftBelongsToHalf(julyFirstShift, "first")).toBe(true);
  });

  it("формирует подписи полупериодов", () => {
    expect(halfPeriodShortRu("first", 2026, 4)).toBe("1–15");
    expect(halfPeriodShortRu("second", 2026, 4)).toBe("16–31");
    expect(halfPeriodLabelRu("second", 2026, 1)).toBe("с 16 по 28");
  });

  it("dateIsoBelongsToHalf режет по операционным суткам", () => {
    const july = { year: 2026, monthIndex0: 6 };
    expect(dateIsoInPayrollMonth("2026-07-17", july)).toBe(true);
    expect(dateIsoBelongsToHalf("2026-07-15", "first", july)).toBe(true);
    expect(dateIsoBelongsToHalf("2026-07-16", "second", july)).toBe(true);
    expect(dateIsoBelongsToHalf("2026-07-15", "second", july)).toBe(false);
  });
});

describe("resolveTimesheetRowOperationalDateIso + payroll halves", () => {
  it("хвост 8–9 при якоре 09:00 уходит в 15-е, не в 16-е", () => {
    const objectId = "obj-1";
    const monthly = new Map([[operationalDayMonthKey(objectId, "2026-07"), "09:00"]]);
    const defaults = new Map([[objectId, "08:00"]]);
    const dateIso = resolveTimesheetRowOperationalDateIso(
      {
        objectId,
        startsAt: "2026-07-15T22:00:00.000Z",
        endsAt: "2026-07-15T23:00:00.000Z",
      },
      defaults,
      monthly,
    );
    expect(dateIso).toBe("2026-07-15");
    expect(dateIsoBelongsToHalf(dateIso, "first", { year: 2026, monthIndex0: 6 })).toBe(true);
    expect(dateIsoBelongsToHalf(dateIso, "second", { year: 2026, monthIndex0: 6 })).toBe(false);
  });
});

describe("buildGuardPayrollHalfSummaries", () => {
  const baseRow = (overrides: Partial<TimesheetRow>): TimesheetRow => ({
    guardName: "Иванов",
    objectName: "Объект",
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
    guardAmountCents: 10_000,
    marginCents: 0,
    unpriced: false,
    ...overrides,
  });

  it("считает аванс и к выдаче по полупериодам", () => {
    const rows = [
      baseRow({ startsAt: "2026-05-02T04:00:00.000Z", guardAmountCents: 300_000 }),
      baseRow({ startsAt: "2026-05-20T04:00:00.000Z", guardAmountCents: 500_000 }),
    ];
    const summaries = buildGuardPayrollHalfSummaries({
      rows,
      guardIdByName: new Map([["Иванов", "g1"]]),
      advancesByGuardId: new Map([["g1", { firstHalfRub: 3_000, secondHalfRub: 5_000 }]]),
      month: MAY_2026,
    });
    const s = summaries.get("g1");
    expect(s?.advanceFirstHalfRub).toBe(3_000);
    expect(s?.advanceSecondHalfRub).toBe(5_000);
    expect(s?.toPayFirstHalfRub).toBe(0);
    expect(s?.toPaySecondHalfRub).toBe(0);
    expect(s?.salaryCents).toBe(800_000);
  });

  it("к выдаче не уходит в минус", () => {
    const rows = [baseRow({ startsAt: "2026-05-02T04:00:00.000Z", guardAmountCents: 500_000 })];
    const summaries = buildGuardPayrollHalfSummaries({
      rows,
      guardIdByName: new Map([["Иванов", "g1"]]),
      advancesByGuardId: new Map([["g1", { firstHalfRub: 2_000, secondHalfRub: 0 }]]),
      month: MAY_2026,
    });
    expect(summaries.get("g1")?.toPayFirstHalfRub).toBe(3_000);
  });
});

describe("buildObjectPayrollHalfSummaries", () => {
  const baseRow = (overrides: Partial<TimesheetRow>): TimesheetRow => ({
    guardName: "Иванов",
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
    guardAmountCents: 10_000,
    marginCents: 0,
    unpriced: false,
    ...overrides,
  });

  it("суммирует начисления по объектам за полупериоды", () => {
    const rows = [
      baseRow({ objectName: "АВТОБАЗА", startsAt: "2026-05-02T04:00:00.000Z", guardAmountCents: 100_000 }),
      baseRow({ objectName: "АВТОБАЗА", startsAt: "2026-05-10T04:00:00.000Z", guardAmountCents: 50_000 }),
      baseRow({ objectName: "АВТОБАЗА", startsAt: "2026-05-20T04:00:00.000Z", guardAmountCents: 200_000 }),
      baseRow({ objectName: "СКЛАД", startsAt: "2026-05-05T04:00:00.000Z", guardAmountCents: 30_000 }),
    ];
    const summaries = buildObjectPayrollHalfSummaries(rows, MAY_2026);
    const avtobaza = summaries.find((s) => s.objectName === "АВТОБАЗА");
    const sklad = summaries.find((s) => s.objectName === "СКЛАД");
    expect(avtobaza?.toPayFirstHalfRub).toBe(1_500);
    expect(avtobaza?.toPaySecondHalfRub).toBe(2_000);
    expect(avtobaza?.totalMonthRub).toBe(3_500);
    expect(sklad?.toPayFirstHalfRub).toBe(300);
    expect(sklad?.toPaySecondHalfRub).toBe(0);
    expect(sklad?.totalMonthRub).toBe(300);
  });

  it("склеивает смены одного objectId после переименования объекта", () => {
    const rows = [
      baseRow({
        objectId: "o1",
        objectName: "Старое имя",
        startsAt: "2026-05-02T04:00:00.000Z",
        guardAmountCents: 100_000,
      }),
      baseRow({
        objectId: "o1",
        objectName: "Новое имя",
        startsAt: "2026-05-10T04:00:00.000Z",
        guardAmountCents: 50_000,
      }),
      baseRow({
        objectId: "o1",
        objectName: "Новое имя",
        startsAt: "2026-05-20T04:00:00.000Z",
        guardAmountCents: 200_000,
      }),
    ];
    const summaries = buildObjectPayrollHalfSummaries(rows, MAY_2026);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.objectId).toBe("o1");
    expect(summaries[0]?.objectName).toBe("Новое имя");
    expect(summaries[0]?.toPayFirstHalfRub).toBe(1_500);
    expect(summaries[0]?.toPaySecondHalfRub).toBe(2_000);
    expect(summaries[0]?.totalMonthRub).toBe(3_500);
  });

  it("не включает смену 16.06 в первую половину", () => {
    const rows = [
      baseRow({
        objectName: "АВТОБАЗА",
        startsAt: "2026-06-15T22:00:00.000Z",
        guardAmountCents: 400_008,
      }),
      baseRow({
        objectName: "АВТОБАЗА",
        startsAt: "2026-06-01T22:00:00.000Z",
        guardAmountCents: 400_008,
      }),
    ];
    const summaries = buildObjectPayrollHalfSummaries(rows, JUNE_2026);
    const avtobaza = summaries.find((s) => s.objectName === "АВТОБАЗА");
    expect(avtobaza?.toPayFirstHalfRub).toBe(4_000.08);
    expect(avtobaza?.toPaySecondHalfRub).toBe(4_000.08);
    expect(avtobaza?.totalMonthRub).toBe(8_000.16);
  });

  it("не включает смену 1 июля в половину 1–15 июня", () => {
    const rows = [
      baseRow({
        objectName: "АВТОБАЗА",
        startsAt: "2026-06-01T22:00:00.000Z",
        guardAmountCents: 400_008,
      }),
      baseRow({
        objectName: "АВТОБАЗА",
        startsAt: "2026-06-30T23:00:00.000Z",
        guardAmountCents: 400_008,
      }),
    ];
    const summaries = buildObjectPayrollHalfSummaries(rows, JUNE_2026);
    const avtobaza = summaries.find((s) => s.objectName === "АВТОБАЗА");
    expect(avtobaza?.toPayFirstHalfRub).toBe(4_000.08);
    expect(avtobaza?.toPaySecondHalfRub).toBe(0);
    expect(avtobaza?.totalMonthRub).toBe(4_000.08);
  });
});
