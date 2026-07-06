import { describe, expect, it } from "vitest";
import { buildShiftIntervalFromHm } from "../../src/lib/scheduling/operational-day-timeline";
import { buildExportTitle } from "../../src/lib/scheduling/schedule-export-periods";
import {
  buildScheduleExportTable,
  formatShiftExportCell,
} from "../../src/lib/scheduling/schedule-export-table";
import {
  pickDominantShiftKind,
  resolveShiftExportColors,
  shiftExportFillArgb,
} from "../../src/lib/scheduling/schedule-export-shift-style";
import { designTokens } from "../../src/lib/design-tokens";
import type { Shift } from "../../src/lib/scheduling/types";

function makeShift(partial: Partial<Shift> & Pick<Shift, "startsAt" | "endsAt">): Shift {
  return {
    id: "shift-1",
    guardId: "guard-1",
    objectId: "object-1",
    postId: null,
    shiftKind: "Regular",
    manualClientRateCents: null,
    manualGuardRateCents: null,
    manualRateUnit: null,
    manualRateReason: "",
    isNoShow: false,
    incidentCategory: null,
    incidentComment: "",
    incidentWorkedUntilAt: null,
    incidentRecordedAt: null,
    replacedByShiftId: null,
    selectedRateRuleId: null,
    ...partial,
  };
}

describe("schedule-export-table", () => {
  it("formats shift cell on three lines with incident", () => {
    const cell = formatShiftExportCell(
      makeShift({
        startsAt: new Date("2026-05-10T08:00:00+10:00"),
        endsAt: new Date("2026-05-10T20:00:00+10:00"),
        isNoShow: true,
      }),
    );
    expect(cell).toBe("12 ч\n8-20\nневыход");
  });

  it("formats shift cell on two lines without incident", () => {
    const cell = formatShiftExportCell(
      makeShift({
        startsAt: new Date("2026-05-10T08:00:00+10:00"),
        endsAt: new Date("2026-05-10T20:00:00+10:00"),
      }),
    );
    expect(cell).toBe("12 ч\n8-20");
  });

  it("builds export title on two lines", () => {
    const title = buildExportTitle("БЦ Центральный", 2026, 4, [
      {
        id: "w1",
        startYear: 2026,
        startMonth0: 3,
        startDay: 27,
        endYear: 2026,
        endMonth0: 4,
        endDay: 3,
      },
      {
        id: "w2",
        startYear: 2026,
        startMonth0: 4,
        startDay: 4,
        endYear: 2026,
        endMonth0: 4,
        endDay: 10,
      },
    ]);
    expect(title).toBe(
      "График смен «БЦ Центральный»\nна период 27 апр – 3, 4–10 мая 2026 г.",
    );
  });

  it("stores shift kind per cell for export coloring", () => {
    const table = buildScheduleExportTable(
      "Тест",
      [{ guardId: "g1", displayName: "Иванов" }],
      [{ dateIso: "2026-07-03", header: "3\nЧт", day: 3, monthIndex0: 6, year: 2026 }],
      [
        makeShift({
          guardId: "g1",
          shiftKind: "Reinforcement",
          startsAt: new Date("2026-07-03T17:00:00+10:00"),
          endsAt: new Date("2026-07-04T01:00:00+10:00"),
        }),
        makeShift({
          id: "shift-2",
          guardId: "g1",
          shiftKind: "Regular",
          startsAt: new Date("2026-07-03T08:00:00+10:00"),
          endsAt: new Date("2026-07-03T20:00:00+10:00"),
        }),
      ],
      "08:00",
    );

    const entries = table.cells.g1?.["2026-07-03"] ?? [];
    expect(entries).toHaveLength(2);
    expect(entries.some((entry) => entry.shiftKind === "Reinforcement")).toBe(true);
    expect(entries.some((entry) => entry.shiftKind === "Regular")).toBe(true);
  });

  it("кладёт хвост 8-9 в колонку операционных суток, а не в календарный день", () => {
    const { startsAt: tailStart, endsAt: tailEnd } = buildShiftIntervalFromHm(
      "2026-07-02",
      "08:00",
      "09:00",
      "09:00",
    );
    const { startsAt: sutkiStart, endsAt: sutkiEnd } = buildShiftIntervalFromHm(
      "2026-07-02",
      "09:00",
      "09:00",
      "09:00",
    );

    const table = buildScheduleExportTable(
      "Тест",
      [{ guardId: "g1", displayName: "Честикин" }],
      [
        { dateIso: "2026-07-02", header: "2\nЧт", day: 2, monthIndex0: 6, year: 2026 },
        { dateIso: "2026-07-03", header: "3\nПт", day: 3, monthIndex0: 6, year: 2026 },
      ],
      [
        makeShift({
          guardId: "g1",
          startsAt: tailStart,
          endsAt: tailEnd,
        }),
        makeShift({
          id: "shift-2",
          guardId: "g1",
          startsAt: sutkiStart,
          endsAt: sutkiEnd,
        }),
      ],
      "09:00",
    );

    expect(table.cells.g1?.["2026-07-02"]).toHaveLength(2);
    expect(table.cells.g1?.["2026-07-03"]).toHaveLength(0);
    expect(table.cells.g1?.["2026-07-02"]?.some((entry) => entry.text.startsWith("1"))).toBe(true);
    expect(table.cells.g1?.["2026-07-02"]?.some((entry) => entry.text.startsWith("24"))).toBe(true);
  });
});

describe("schedule-export-shift-style", () => {
  it("uses red styling for reinforcement", () => {
    const colors = resolveShiftExportColors("Reinforcement", false);
    expect(colors.fill).toBe(designTokens.color.shift.reinforcementCellBg);
    expect(colors.border).toBe(designTokens.color.accent.danger);
    expect(colors.borderWidth).toBe(2);
  });

  it("uses yellow styling for rapid response", () => {
    const colors = resolveShiftExportColors("RapidResponse", false);
    expect(colors.fill).toBe(designTokens.color.shift.mobilePostCellBg);
    expect(colors.border).toBe(designTokens.color.accent.warning);
  });

  it("picks reinforcement as dominant when mixed", () => {
    expect(
      pickDominantShiftKind([
        { shiftKind: "Regular", isNoShow: false },
        { shiftKind: "Reinforcement", isNoShow: false },
      ]),
    ).toBe("Reinforcement");
  });

  it("converts rgba fill to excel argb", () => {
    const argb = shiftExportFillArgb("Reinforcement", false);
    expect(argb).toMatch(/^FF[0-9A-F]{6}$/);
  });
});
