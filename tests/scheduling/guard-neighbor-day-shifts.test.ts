import { describe, expect, it } from "vitest";
import {
  formatNeighborDayShiftsHint,
  getNeighborDayShifts,
  hasNeighborDayShifts,
} from "../../src/lib/scheduling/guard-neighbor-day-shifts";

describe("guard-neighbor-day-shifts", () => {
  const objectNames = new Map([["obj-a", "Живописный сад"]]);
  const sutki12 = {
    guardId: "g1",
    objectId: "obj-a",
    startsAt: new Date("2026-07-12T09:00:00+10:00"),
    endsAt: new Date("2026-07-13T09:00:00+10:00"),
  };
  const sutki15 = {
    guardId: "g1",
    objectId: "obj-a",
    startsAt: new Date("2026-07-15T09:00:00+10:00"),
    endsAt: new Date("2026-07-16T09:00:00+10:00"),
  };

  it("shows prev and next operational days as сутки labels", () => {
    const neighbors = getNeighborDayShifts(
      "g1",
      "2026-07-14",
      [sutki12, sutki15],
      objectNames,
      { operationalDayStartTime: "09:00" },
    );
    // prev column for 14th is 13th — sutki12 is column 12, not shown as prev
    expect(neighbors.prev).toBeNull();
    expect(neighbors.next?.dateIso).toBe("2026-07-15");
    expect(formatNeighborDayShiftsHint(neighbors)).toBe("15.07 сутки «Живописный сад»");
  });

  it("shows yesterday sutki when assigning the day after", () => {
    const neighbors = getNeighborDayShifts("g1", "2026-07-13", [sutki12], objectNames, {
      operationalDayStartTime: "09:00",
    });
    expect(neighbors.prev?.dateIso).toBe("2026-07-12");
    expect(neighbors.prev?.timeRange).toBe("9-9");
    expect(formatNeighborDayShiftsHint(neighbors)).toBe("12.07 сутки «Живописный сад»");
    expect(hasNeighborDayShifts(neighbors)).toBe(true);
  });

  it("shows both prev and next when both exist", () => {
    const dayShift13 = {
      guardId: "g1",
      objectId: "obj-a",
      startsAt: new Date("2026-07-13T09:00:00+10:00"),
      endsAt: new Date("2026-07-13T15:00:00+10:00"),
    };
    const neighbors = getNeighborDayShifts(
      "g1",
      "2026-07-14",
      [dayShift13, sutki15],
      objectNames,
      { operationalDayStartTime: "09:00" },
    );
    expect(formatNeighborDayShiftsHint(neighbors)).toBe(
      "13.07 9-15 «Живописный сад» · 15.07 сутки «Живописный сад»",
    );
  });
});
