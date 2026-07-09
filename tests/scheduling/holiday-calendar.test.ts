import { describe, expect, it } from "vitest";
import {
  holidayDateSetFromRecords,
  isHolidayLocalDateKey,
  localDateKeyInTimeZone,
  normalizeHolidayDateKey,
  toLocalCivilDateKey,
} from "../../src/lib/rates/holiday-calendar";

describe("holiday calendar", () => {
  it("builds a set from records", () => {
    const set = holidayDateSetFromRecords([
      { holidayDate: "2026-05-09" },
      { holidayDate: "2026-12-31" },
    ]);
    expect(set.has("2026-05-09")).toBe(true);
    expect(set.has("2026-05-10")).toBe(false);
  });

  it("detects holiday by local civil key", () => {
    const set = new Set(["2026-01-01"]);
    expect(isHolidayLocalDateKey("2026-01-01", set)).toBe(true);
    expect(isHolidayLocalDateKey("2026-01-02", set)).toBe(false);
  });

  it("normalizes date strings", () => {
    expect(normalizeHolidayDateKey("  2026-03-08T00:00:00.000Z  ")).toBe("2026-03-08");
  });

  it("maps Sydney local calendar day for UTC instant", () => {
    const key = localDateKeyInTimeZone(new Date("2026-05-08T14:00:00.000Z"), "Australia/Sydney");
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("formats local civil key like JS Date local getters", () => {
    const d = new Date(2026, 4, 9, 0, 0, 0, 0);
    expect(toLocalCivilDateKey(d)).toBe("2026-05-09");
  });
});
