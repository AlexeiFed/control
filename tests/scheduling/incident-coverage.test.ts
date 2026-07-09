import { describe, expect, it } from "vitest";
import { mergedIntervalsCoverRange } from "../../src/lib/scheduling/incident-coverage";

describe("mergedIntervalsCoverRange", () => {
  it("returns true for empty range", () => {
    expect(mergedIntervalsCoverRange(100, 100, [{ start: 0, end: 200 }])).toBe(true);
  });

  it("detects full coverage by one interval", () => {
    expect(mergedIntervalsCoverRange(0, 100, [{ start: 0, end: 100 }])).toBe(true);
  });

  it("detects gap", () => {
    expect(mergedIntervalsCoverRange(0, 100, [{ start: 0, end: 40 }, { start: 60, end: 100 }])).toBe(false);
  });

  it("merges overlapping coverage", () => {
    expect(mergedIntervalsCoverRange(0, 100, [{ start: 0, end: 60 }, { start: 50, end: 100 }])).toBe(true);
  });

  it("clips intervals to range", () => {
    expect(mergedIntervalsCoverRange(20, 80, [{ start: 0, end: 200 }])).toBe(true);
  });
});
