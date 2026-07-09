import { describe, expect, it } from "vitest";
import {
  buildShiftIntervalFromHm,
  buildShiftIntervalFromOffsets,
  hmPairToOffsets,
  offsetsToHmPair,
  operationalDayDateIsoFromStart,
  scheduleShiftColumnDateIso,
  presetToOffsets,
} from "../../src/lib/scheduling/operational-day-timeline";

const D = "2026-06-16";

describe("operational day timeline", () => {
  it("maps sutki 8-8 preset to full cycle", () => {
    expect(presetToOffsets("08:00", "08:00")).toEqual({ startOffset: 0, endOffset: 24 * 60 });
  });

  it("maps sutki 9-9 preset with 09:00 anchor", () => {
    expect(presetToOffsets("09:00", "09:00", "09:00")).toEqual({ startOffset: 0, endOffset: 24 * 60 });
  });

  it("maps night 20-8 preset", () => {
    expect(presetToOffsets("20:00", "08:00")).toEqual({ startOffset: 12 * 60, endOffset: 24 * 60 });
  });

  it("maps day 8-20 preset", () => {
    expect(presetToOffsets("08:00", "20:00")).toEqual({ startOffset: 0, endOffset: 12 * 60 });
  });

  it("maps day 9-21 preset with 09:00 anchor", () => {
    expect(presetToOffsets("09:00", "21:00", "09:00")).toEqual({ startOffset: 0, endOffset: 12 * 60 });
  });

  it("round-trips hm pair through offsets", () => {
    const offsets = hmPairToOffsets(D, "20:00", "08:00");
    const pair = offsetsToHmPair(D, offsets.startOffset, offsets.endOffset);
    expect(pair).toEqual({ startTime: "20:00", endTime: "08:00" });
  });

  it("maps tail 7-8 preset to last hour of operational cycle", () => {
    expect(presetToOffsets("07:00", "08:00")).toEqual({ startOffset: 23 * 60, endOffset: 24 * 60 });
  });

  it("maps tail before 9-9 anchor", () => {
    expect(presetToOffsets("08:00", "09:00", "09:00")).toEqual({ startOffset: 23 * 60, endOffset: 24 * 60 });
  });

  it("buildShiftIntervalFromHm maps tail 7-8 to next morning", () => {
    const { startsAt, endsAt } = buildShiftIntervalFromHm(D, "07:00", "08:00");
    expect(startsAt.toISOString()).toBe("2026-06-16T21:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-06-16T22:00:00.000Z");
  });

  it("buildShiftIntervalFromHm maps night 20-8", () => {
    const { startsAt, endsAt } = buildShiftIntervalFromHm(D, "20:00", "08:00");
    expect(startsAt.toISOString()).toBe("2026-06-16T10:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-06-16T22:00:00.000Z");
  });

  it("buildShiftIntervalFromHm maps sutki 9-9 with anchor", () => {
    const { startsAt, endsAt } = buildShiftIntervalFromHm(D, "09:00", "09:00", "09:00");
    expect(startsAt.toISOString()).toBe("2026-06-15T23:00:00.000Z");
    expect(endsAt.toISOString()).toBe("2026-06-16T23:00:00.000Z");
  });
});

describe("operationalDayDateIsoFromStart", () => {
  it("assigns tail hour before 9-9 anchor to previous operational day", () => {
    const { startsAt } = buildShiftIntervalFromHm("2026-06-15", "08:00", "09:00", "09:00");
    expect(operationalDayDateIsoFromStart(startsAt, "09:00")).toBe("2026-06-15");
  });

  it("assigns shift starting at anchor to same calendar day", () => {
    const { startsAt } = buildShiftIntervalFromHm("2026-06-16", "09:00", "21:00", "09:00");
    expect(operationalDayDateIsoFromStart(startsAt, "09:00")).toBe("2026-06-16");
  });

  it("hmPairToOffsets does not throw for tail 8-9 on 9-9 anchor", () => {
    expect(() => hmPairToOffsets("2026-06-15", "08:00", "09:00", "09:00")).not.toThrow();
    expect(hmPairToOffsets("2026-06-15", "08:00", "09:00", "09:00")).toEqual({
      startOffset: 23 * 60,
      endOffset: 24 * 60,
    });
  });

  it("hmPairToOffsets does not throw on previously invalid pairs", () => {
    expect(() => hmPairToOffsets("2026-06-15", "08:00", "07:00", "09:00")).not.toThrow();
    expect(() => hmPairToOffsets("2026-06-15", "08:00", "07:00", "08:00")).not.toThrow();
  });
});

describe("scheduleShiftColumnDateIso", () => {
  it("кладёт хвост 7-8 в колонку дня достаивания при якоре 08:00", () => {
    const interval = buildShiftIntervalFromHm("2026-07-06", "07:00", "08:00", "08:00");
    expect(scheduleShiftColumnDateIso(interval, "08:00")).toBe("2026-07-06");
  });

  it("кладёт сутки, заканчивающиеся на якоре, в колонку начала цикла", () => {
    const interval = buildShiftIntervalFromHm("2026-07-07", "08:00", "08:00", "08:00");
    expect(scheduleShiftColumnDateIso(interval, "08:00")).toBe("2026-07-07");
  });
});
