import { describe, expect, it } from "vitest";
import { isIsoInCurrentKhabarovskWeek } from "../../src/lib/format/display-date";

describe("isIsoInCurrentKhabarovskWeek", () => {
  it("Mon 13 Jul week is 13–19", () => {
    const now = new Date("2026-07-13T18:00:00+10:00");
    expect(isIsoInCurrentKhabarovskWeek("2026-07-13", now)).toBe(true);
    expect(isIsoInCurrentKhabarovskWeek("2026-07-19", now)).toBe(true);
    expect(isIsoInCurrentKhabarovskWeek("2026-07-12", now)).toBe(false);
    expect(isIsoInCurrentKhabarovskWeek("2026-07-20", now)).toBe(false);
  });

  it("Wed 9 Jul week is 6–12", () => {
    const now = new Date("2026-07-09T12:00:00+10:00");
    expect(isIsoInCurrentKhabarovskWeek("2026-07-06", now)).toBe(true);
    expect(isIsoInCurrentKhabarovskWeek("2026-07-12", now)).toBe(true);
    expect(isIsoInCurrentKhabarovskWeek("2026-07-05", now)).toBe(false);
    expect(isIsoInCurrentKhabarovskWeek("2026-07-13", now)).toBe(false);
  });
});
