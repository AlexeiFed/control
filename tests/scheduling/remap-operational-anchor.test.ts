import { describe, expect, it } from "vitest";
import { buildShiftIntervalFromHm } from "../../src/lib/scheduling/operational-day-timeline";
import {
  planShiftsRematToNewAnchor,
  remapShiftToNewOperationalAnchor,
} from "../../src/lib/scheduling/remap-operational-anchor";

describe("remapShiftToNewOperationalAnchor", () => {
  it("сутки 8–8 1 сентября остаются 1-го и становятся 9–9", () => {
    const interval = buildShiftIntervalFromHm("2026-09-01", "08:00", "08:00", "08:00");
    const remapped = remapShiftToNewOperationalAnchor(interval, "08:00", "09:00");
    expect(remapped?.columnDateIso).toBe("2026-09-01");
    const expected = buildShiftIntervalFromHm("2026-09-01", "09:00", "09:00", "09:00");
    expect(remapped?.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
    expect(remapped?.endsAt.toISOString()).toBe(expected.endsAt.toISOString());
  });

  it("сутки 8–8 4 сентября не уезжают на 3-е", () => {
    const interval = buildShiftIntervalFromHm("2026-09-04", "08:00", "08:00", "08:00");
    const remapped = remapShiftToNewOperationalAnchor(interval, "08:00", "09:00");
    expect(remapped?.columnDateIso).toBe("2026-09-04");
    const expected = buildShiftIntervalFromHm("2026-09-04", "09:00", "09:00", "09:00");
    expect(remapped?.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
  });

  it("обратно 9–9 → 8–8 оставляет тот же день", () => {
    const interval = buildShiftIntervalFromHm("2026-09-01", "09:00", "09:00", "09:00");
    const remapped = remapShiftToNewOperationalAnchor(interval, "09:00", "08:00");
    expect(remapped?.columnDateIso).toBe("2026-09-01");
    const expected = buildShiftIntervalFromHm("2026-09-01", "08:00", "08:00", "08:00");
    expect(remapped?.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
  });
});

describe("planShiftsRematToNewAnchor", () => {
  it("переносит только смены выбранного месяца", () => {
    const sep = buildShiftIntervalFromHm("2026-09-01", "08:00", "08:00", "08:00");
    const aug = buildShiftIntervalFromHm("2026-08-31", "08:00", "08:00", "08:00");
    const plan = planShiftsRematToNewAnchor(
      [
        { id: "s-sep", ...sep },
        { id: "s-aug", ...aug },
      ],
      "2026-09",
      "08:00",
      "09:00",
    );
    expect(plan.map((item) => item.shiftId)).toEqual(["s-sep"]);
    expect(plan[0]?.columnDateIso).toBe("2026-09-01");
  });

  it("чинит уже сохранённые 8–8 при якоре 09:00", () => {
    const interval = buildShiftIntervalFromHm("2026-09-04", "08:00", "08:00", "08:00");
    const plan = planShiftsRematToNewAnchor([{ id: "s-4", ...interval }], "2026-09", "09:00", "09:00");
    expect(plan).toHaveLength(1);
    expect(plan[0]?.columnDateIso).toBe("2026-09-04");
    const expected = buildShiftIntervalFromHm("2026-09-04", "09:00", "09:00", "09:00");
    expect(plan[0]?.startsAt.toISOString()).toBe(expected.startsAt.toISOString());
  });
});
