import { describe, expect, it } from "vitest";
import {
  collectMonthStaffUnionIds,
  collectScheduleMonthGuardIds,
  isKhabarovskMonthPast,
  nextMonthRosterIds,
  nextPostStaffIds,
  resolveScheduleMonthRosterIds,
  shouldShowLiveObjectGuardPool,
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

  it("текущий месяц с постами: штат поста, без докидывания с объекта", () => {
    const sep = new Date("2026-09-01T12:00:00+10:00");
    expect(
      resolveScheduleMonthRosterIds({
        year: 2026,
        monthIndex0: 8,
        objectGuardIds: ["a", "b"],
        monthlyStaffIds: ["a", "extra"],
        shiftGuardIds: [],
        now: sep,
        useMonthlyStaff: true,
      }),
    ).toEqual(expect.arrayContaining(["a", "extra"]));
    expect(
      resolveScheduleMonthRosterIds({
        year: 2026,
        monthIndex0: 8,
        objectGuardIds: ["a", "b"],
        monthlyStaffIds: ["a", "extra"],
        shiftGuardIds: [],
        now: sep,
        useMonthlyStaff: true,
      }),
    ).not.toContain("b");
  });
});

describe("shouldShowLiveObjectGuardPool", () => {
  const now = new Date("2026-09-01T10:36:00+10:00");

  it("сентябрь: живой пул скрыт для августа", () => {
    expect(shouldShowLiveObjectGuardPool(2026, 7, now)).toBe(false);
  });

  it("сентябрь: живой пул виден для сентября", () => {
    expect(shouldShowLiveObjectGuardPool(2026, 8, now)).toBe(true);
  });
});

describe("collectMonthStaffUnionIds", () => {
  it("собирает уникальные id штата по всем постам", () => {
    expect(
      collectMonthStaffUnionIds({
        postA: ["a", "b"],
        postB: ["b", "c"],
      }),
    ).toEqual(expect.arrayContaining(["a", "b", "c"]));
    expect(
      collectMonthStaffUnionIds({
        postA: ["a", "b"],
        postB: ["b", "c"],
      }),
    ).toHaveLength(3);
  });
});

describe("nextMonthRosterIds", () => {
  it("галка добавляет id в плоский штат месяца, не трогая остальных", () => {
    expect(nextMonthRosterIds(["a", "b"], "new", true)).toEqual(["a", "b", "new"]);
  });

  it("повторная галка не дублирует", () => {
    expect(nextMonthRosterIds(["a"], "a", true)).toEqual(["a"]);
  });

  it("снятие галки убирает только этого охранника", () => {
    expect(nextMonthRosterIds(["a", "new"], "new", false)).toEqual(["a"]);
  });

  it("галка без текущего штата не требует поста", () => {
    expect(nextMonthRosterIds([], "new", true)).toEqual(["new"]);
  });
});

describe("nextPostStaffIds", () => {
  it("добавляет на пост, не затирая остальных", () => {
    expect(nextPostStaffIds(["a", "b"], "c", true)).toEqual(["a", "b", "c"]);
  });

  it("снятие с поста не трогает других на этом посту", () => {
    expect(nextPostStaffIds(["a", "b", "c"], "b", false)).toEqual(["a", "c"]);
  });
});
