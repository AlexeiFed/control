import { describe, expect, it } from "vitest";
import {
  isIsoInCurrentKhabarovskWeek,
  isIsoInCurrentShortageControlWindow,
  shortageControlDates,
  toDateIsoKhabarovsk,
} from "../../src/lib/format/display-date";

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

describe("isIsoInCurrentShortageControlWindow", () => {
  it("пн 12 окт — окно 12–19, следующий понедельник включён", () => {
    const now = new Date("2026-10-12T19:54:00+10:00");
    const weekStart = new Date("2026-10-12T00:00:00+10:00");
    expect(shortageControlDates(weekStart).map((date) => toDateIsoKhabarovsk(date))).toEqual([
      "2026-10-12",
      "2026-10-13",
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
      "2026-10-17",
      "2026-10-18",
      "2026-10-19",
    ]);
    expect(isIsoInCurrentShortageControlWindow("2026-10-12", now)).toBe(true);
    expect(isIsoInCurrentShortageControlWindow("2026-10-18", now)).toBe(true);
    expect(isIsoInCurrentShortageControlWindow("2026-10-19", now)).toBe(true);
    expect(isIsoInCurrentShortageControlWindow("2026-10-11", now)).toBe(false);
    expect(isIsoInCurrentShortageControlWindow("2026-10-20", now)).toBe(false);
  });

  it("ср 14 окт — то же окно с понедельника 12 по понедельник 19", () => {
    const now = new Date("2026-10-14T12:00:00+10:00");
    expect(isIsoInCurrentShortageControlWindow("2026-10-12", now)).toBe(true);
    expect(isIsoInCurrentShortageControlWindow("2026-10-19", now)).toBe(true);
    expect(isIsoInCurrentShortageControlWindow("2026-10-11", now)).toBe(false);
    expect(isIsoInCurrentShortageControlWindow("2026-10-20", now)).toBe(false);
  });
});
