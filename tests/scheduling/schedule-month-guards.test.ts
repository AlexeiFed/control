import { describe, expect, it } from "vitest";
import {
  collectScheduleMonthGuardIds,
  isKhabarovskMonthPast,
  resolveScheduleMonthRosterIds,
} from "../../src/lib/scheduling/schedule-month-guards";

describe("collectScheduleMonthGuardIds", () => {
  it("объединяет штат месяца и смены, без дублей", () => {
    expect(collectScheduleMonthGuardIds(["a", "b"], ["b", "c"])).toEqual(
      expect.arrayContaining(["a", "b", "c"]),
    );
    expect(collectScheduleMonthGuardIds(["a", "b"], ["b", "c"])).toHaveLength(3);
  });
});

describe("isKhabarovskMonthPast", () => {
  const now = new Date("2026-08-11T12:00:00+10:00");

  it("июль 2026 — прошлый относительно августа", () => {
    expect(isKhabarovskMonthPast(2026, 6, now)).toBe(true);
  });

  it("август 2026 — не прошлый", () => {
    expect(isKhabarovskMonthPast(2026, 7, now)).toBe(false);
  });
});

describe("resolveScheduleMonthRosterIds", () => {
  const now = new Date("2026-08-11T12:00:00+10:00");

  it("прошлый месяц: только снимок штата + смены, без новых из пула объекта", () => {
    expect(
      resolveScheduleMonthRosterIds({
        year: 2026,
        monthIndex0: 6,
        objectGuardIds: ["old", "new-in-august"],
        monthlyStaffIds: ["old"],
        shiftGuardIds: ["shift-only"],
        now,
      }),
    ).toEqual(expect.arrayContaining(["old", "shift-only"]));
    expect(
      resolveScheduleMonthRosterIds({
        year: 2026,
        monthIndex0: 6,
        objectGuardIds: ["old", "new-in-august"],
        monthlyStaffIds: ["old"],
        shiftGuardIds: ["shift-only"],
        now,
      }),
    ).not.toContain("new-in-august");
  });

  it("текущий месяц: пул объекта + смены", () => {
    expect(
      resolveScheduleMonthRosterIds({
        year: 2026,
        monthIndex0: 7,
        objectGuardIds: ["a", "b"],
        monthlyStaffIds: ["stale"],
        shiftGuardIds: ["c"],
        now,
      }),
    ).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(
      resolveScheduleMonthRosterIds({
        year: 2026,
        monthIndex0: 7,
        objectGuardIds: ["a", "b"],
        monthlyStaffIds: ["stale"],
        shiftGuardIds: ["c"],
        now,
      }),
    ).not.toContain("stale");
  });
});
