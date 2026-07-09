import { describe, expect, it } from "vitest";
import { calculateShiftHours } from "../../src/lib/scheduling/hour-calculator";

describe("calculateShiftHours", () => {
  it("calculates a day shift", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T08:00:00+10:00"),
        endsAt: new Date("2026-05-01T20:00:00+10:00"),
      }),
    ).toMatchObject({
      totalMinutes: 720,
      nightMinutes: 0,
      holidayMinutes: 0,
      totalHours: 12,
      nightHours: 0,
      holidayHours: 0,
    });
  });

  it("calculates a night shift crossing midnight", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T20:00:00+10:00"),
        endsAt: new Date("2026-05-02T08:00:00+10:00"),
      }),
    ).toMatchObject({
      totalHours: 12,
      nightHours: 12,
      holidayHours: 0,
    });
  });

  it("counts partial night minutes", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T18:00:00+10:00"),
        endsAt: new Date("2026-05-01T22:30:00+10:00"),
      }),
    ).toMatchObject({
      totalMinutes: 270,
      nightMinutes: 150,
      totalHours: 4.5,
      nightHours: 2.5,
    });
  });

  it("counts holiday minutes independently from night minutes", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T20:00:00+10:00"),
        endsAt: new Date("2026-05-02T08:00:00+10:00"),
        holidayDates: new Set(["2026-05-02"]),
      }),
    ).toMatchObject({
      totalHours: 12,
      nightHours: 12,
      holidayHours: 8,
      holidayMinutes: 480,
    });
  });

  it("rejects invalid intervals", () => {
    expect(() =>
      calculateShiftHours({
        startsAt: new Date("2026-05-01T20:00:00+10:00"),
        endsAt: new Date("2026-05-01T20:00:00+10:00"),
      }),
    ).toThrow("Shift end must be after shift start");
  });

  it("can calculate against an explicit business timezone", () => {
    expect(
      calculateShiftHours({
        startsAt: new Date("2026-05-01T08:00:00Z"),
        endsAt: new Date("2026-05-01T20:00:00Z"),
        timeZone: "UTC",
      }),
    ).toMatchObject({
      totalHours: 12,
      nightHours: 0,
    });
  });
});
