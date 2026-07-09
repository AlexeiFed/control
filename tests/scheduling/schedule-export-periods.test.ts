import { describe, expect, it } from "vitest";
import {
  buildDefaultMonthExportPeriods,
  expandExportPeriodToDayColumns,
  expandSelectedExportPeriods,
  formatExportPeriodLabel,
} from "../../src/lib/scheduling/schedule-export-periods";

describe("schedule-export-periods", () => {
  it("builds Mon–Sun weeks for June 2026 when the 1st is Monday", () => {
    const periods = buildDefaultMonthExportPeriods(2026, 5);
    expect(periods).toHaveLength(5);
    expect(periods[0]).toMatchObject({ startDay: 1, endDay: 7, startMonth0: 5, endMonth0: 5 });
    expect(periods[4]).toMatchObject({ startDay: 29, endDay: 5, startMonth0: 5, endMonth0: 6 });
  });

  it("starts May 2026 from Monday of the week containing May 1", () => {
    const periods = buildDefaultMonthExportPeriods(2026, 4);
    expect(periods[0]).toMatchObject({ startYear: 2026, startMonth0: 3, startDay: 27, endMonth0: 4, endDay: 3 });
    expect(periods.at(-1)).toMatchObject({ startDay: 25, endDay: 31, startMonth0: 4, endMonth0: 4 });
  });

  it("expands cross-month week into July days", () => {
    const period = buildDefaultMonthExportPeriods(2026, 5)[4]!;
    const cols = expandExportPeriodToDayColumns(period, 2026, 5);
    expect(cols.map((c) => c.dateIso)).toEqual([
      "2026-06-29",
      "2026-06-30",
      "2026-07-01",
      "2026-07-02",
      "2026-07-03",
      "2026-07-04",
      "2026-07-05",
    ]);
    expect(cols[0]?.header).toBe("29\nПн");
    expect(cols[4]?.header).toBe("3*\nПт");
  });

  it("merges multiple selected weeks without duplicate days", () => {
    const periods = buildDefaultMonthExportPeriods(2026, 5).filter(
      (p) => p.startDay === 1 || p.startDay === 15,
    );
    const cols = expandSelectedExportPeriods(periods, 2026, 5);
    expect(cols).toHaveLength(14);
    expect(cols[0]?.dateIso).toBe("2026-06-01");
    expect(cols.at(-1)?.dateIso).toBe("2026-06-21");
  });

  it("formats cross-month label for last June week", () => {
    const period = buildDefaultMonthExportPeriods(2026, 5)[4]!;
    expect(formatExportPeriodLabel(period, 2026, 5)).toBe("29 – 5 июл");
  });

  it("formats cross-month label for first May week", () => {
    const period = buildDefaultMonthExportPeriods(2026, 4)[0]!;
    expect(formatExportPeriodLabel(period, 2026, 4)).toBe("27 апр – 3");
  });
});
