import { describe, expect, it } from "vitest";
import {
  formatCompactClockLocal,
  formatCompactTimeRangeLocal,
  formatDisplayDateFromIso,
  formatDisplayDateLocal,
  formatMonthYearLongRu,
  formatWeekdayDayLabel,
  intervalOverlaps,
  khabarovskMonthRangeContaining,
  khabarovskWeekRangeContaining,
  toDateIsoKhabarovsk,
} from "../../src/lib/format/display-date";

describe("display-date", () => {
  it("formats YYYY-MM-DD as dd.MM.yyyy", () => {
    expect(formatDisplayDateFromIso("2026-05-09")).toBe("09.05.2026");
  });

  it("formats local Date", () => {
    const d = new Date(2026, 4, 9, 12, 0, 0);
    expect(formatDisplayDateLocal(d)).toBe("09.05.2026");
  });

  it("formats scheduler column labels as short weekday and day number", () => {
    expect(formatWeekdayDayLabel(new Date(2026, 4, 4, 12, 0, 0))).toBe("Пн, 04");
    expect(formatWeekdayDayLabel(new Date(2026, 4, 5, 12, 0, 0))).toBe("Вт, 05");
  });

  it("formats long month year in Russian", () => {
    expect(formatMonthYearLongRu(2026, 4)).toMatch(/май.*2026/i);
  });

  it("formats compact local clock and shift range", () => {
    const dayStart = new Date(2026, 4, 4, 8, 0, 0);
    const dayEnd = new Date(2026, 4, 4, 20, 0, 0);
    expect(formatCompactClockLocal(dayStart)).toBe("8");
    expect(formatCompactTimeRangeLocal(dayStart, dayEnd)).toBe("8 - 20");
    const nightStart = new Date(2026, 4, 4, 20, 0, 0);
    const nightEnd = new Date(2026, 4, 5, 8, 0, 0);
    expect(formatCompactTimeRangeLocal(nightStart, nightEnd)).toBe("20 - 8");
    expect(formatCompactClockLocal(new Date(2026, 4, 4, 8, 30, 0))).toBe("8:30");
  });

  it("counts shift overlap for calendar week and month in Khabarovsk", () => {
    const juneShift = {
      startsAt: new Date("2026-06-29T08:00:00+10:00"),
      endsAt: new Date("2026-06-30T08:00:00+10:00"),
    };
    const mayShift = {
      startsAt: new Date("2026-05-28T08:00:00+10:00"),
      endsAt: new Date("2026-05-29T08:00:00+10:00"),
    };

    const week = khabarovskWeekRangeContaining("2026-06-27");
    const month = khabarovskMonthRangeContaining("2026-06-27");

    expect(toDateIsoKhabarovsk(week.start)).toBe("2026-06-22");
    expect(intervalOverlaps(juneShift, week)).toBe(false);
    expect(intervalOverlaps(mayShift, week)).toBe(false);
    expect(intervalOverlaps(juneShift, month)).toBe(true);
    expect(intervalOverlaps(mayShift, month)).toBe(false);

    const weekWithShift = khabarovskWeekRangeContaining("2026-06-29");
    expect(intervalOverlaps(juneShift, weekWithShift)).toBe(true);
  });
});
