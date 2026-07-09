import { describe, expect, it } from "vitest";
import type { ObjectShiftTemplateRow } from "../../src/lib/operations/shift-templates-repository";
import {
  activeShiftsSequence,
  buildExpectedShiftsByObjectAndDay,
  buildExpectedShiftsForLocalMonth,
  dominantTemplateEffectiveFromForMonth,
  weeklyExpectedShiftsFromDateMap,
  civilDateKeyFromDate,
  countRegularShiftsOnObjectDay,
  expectedRegularShiftsForDate,
  expectedShiftsForDate,
  jsWeekdayToIso,
  resolveShiftKindForTemplate,
  shiftKindsInTemplate,
} from "../../src/lib/scheduling/object-shift-templates";

describe("object shift templates", () => {
  it("maps JS weekday to ISO 1–7", () => {
    expect(jsWeekdayToIso(1)).toBe(1);
    expect(jsWeekdayToIso(0)).toBe(7);
  });

  it("lists only shift kinds present in template", () => {
    expect(
      shiftKindsInTemplate({
        regular: 0,
        reinforcement: 0,
        shiftHours: 12,
        reinforcementShiftHours: 24,
        rapidResponse: 3,
        rapidResponseShiftHours: 12,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      }),
    ).toEqual(["RapidResponse"]);
    expect(
      shiftKindsInTemplate({
        regular: 2,
        reinforcement: 1,
        shiftHours: 12,
        reinforcementShiftHours: 24,
        rapidResponse: 0,
        rapidResponseShiftHours: 24,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      }),
    ).toEqual(["Regular", "Reinforcement"]);
  });

  it("resolves preferred shift kind when allowed", () => {
    const expected = {
      regular: 0,
      reinforcement: 0,
      shiftHours: 12,
      reinforcementShiftHours: 24,
      rapidResponse: 3,
      rapidResponseShiftHours: 12,
      shiftLead: 0,
      shiftLeadShiftHours: 24,
    };
    expect(resolveShiftKindForTemplate(expected, "Regular")).toBe("RapidResponse");
    expect(resolveShiftKindForTemplate(expected, "RapidResponse")).toBe("RapidResponse");
  });

  it("picks active row by effective range", () => {
    const rows: ObjectShiftTemplateRow[] = [
      {
        objectId: "o1",
        dayOfWeek: 3,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        effectiveFrom: "2026-01-01",
        effectiveTo: "2026-05-31",
      },
      {
        objectId: "o1",
        dayOfWeek: 3,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        effectiveFrom: "2026-06-01",
        effectiveTo: null,
      },
    ];
    expect(expectedRegularShiftsForDate(rows, "o1", "2026-05-06")).toBe(1);
    expect(expectedRegularShiftsForDate(rows, "o1", "2026-06-10")).toBe(2);
  });

  it("builds expected map for a week", () => {
    const rows: ObjectShiftTemplateRow[] = [
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 3,
        shiftsReinforcementPerDay: 0,
        effectiveFrom: "2020-01-01",
        effectiveTo: null,
      },
    ];
    const mon = new Date(2026, 4, 4, 12, 0, 0, 0);
    const weekIsos = Array.from({ length: 7 }, (_, i) =>
      civilDateKeyFromDate(new Date(mon.getTime() + i * 86400000)),
    );
    const map = buildExpectedShiftsByObjectAndDay(["o1"], weekIsos, rows);
    expect(map.o1?.[weekIsos[0]!]).toEqual({
      regular: 3,
      reinforcement: 0,
      shiftHours: 24,
      reinforcementShiftHours: 24,
      rapidResponse: 0,
      rapidResponseShiftHours: 24,
      shiftLead: 0,
      shiftLeadShiftHours: 24,
    });
    expect(map.o1?.[weekIsos[1]!]).toEqual({
      regular: 2,
      reinforcement: 0,
      shiftHours: 24,
      reinforcementShiftHours: 24,
      rapidResponse: 0,
      rapidResponseShiftHours: 24,
      shiftLead: 0,
      shiftLeadShiftHours: 24,
    });
  });

  it("builds expected map with default 2 shifts when no template row", () => {
    const weekIsos = ["2026-05-18", "2026-05-19"];
    const map = buildExpectedShiftsByObjectAndDay(["o-new"], weekIsos, []);
    expect(map["o-new"]).toEqual({
      "2026-05-18": {
        regular: 2,
        reinforcement: 0,
        shiftHours: 24,
        reinforcementShiftHours: 24,
        rapidResponse: 0,
        rapidResponseShiftHours: 24,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      },
      "2026-05-19": {
        regular: 2,
        reinforcement: 0,
        shiftHours: 24,
        reinforcementShiftHours: 24,
        rapidResponse: 0,
        rapidResponseShiftHours: 24,
        shiftLead: 0,
        shiftLeadShiftHours: 24,
      },
    });
  });

  it("activeShiftsSequence fills defaults", () => {
    const rows: ObjectShiftTemplateRow[] = [];
    const { regular } = activeShiftsSequence(rows, "o1", "2026-01-05");
    expect(regular).toHaveLength(7);
    expect(regular.every((n: number) => n === 2)).toBe(true);
  });

  it("inherits MP and reinforcement when new version stores zeros", () => {
    const rows: ObjectShiftTemplateRow[] = [
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        shiftsRapidResponsePerDay: 1,
        rapidResponseShiftHours: 12,
        effectiveFrom: "2026-05-01",
        effectiveTo: "2026-06-09",
      },
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        shiftHours: 24,
        shiftsRapidResponsePerDay: 0,
        rapidResponseShiftHours: 24,
        effectiveFrom: "2026-06-10",
        effectiveTo: null,
      },
    ];
    const may = expectedShiftsForDate(rows, "o1", "2026-05-04");
    expect(may?.shiftHours).toBe(14);
    expect(may?.rapidResponse).toBe(1);

    const june = expectedShiftsForDate(rows, "o1", "2026-06-15");
    expect(june?.shiftHours).toBe(24);
    expect(june?.rapidResponse).toBe(1);
    expect(june?.rapidResponseShiftHours).toBe(12);
  });

  it("buildExpectedShiftsForLocalMonth resolves each calendar day", () => {
    const rows: ObjectShiftTemplateRow[] = [
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 1,
        shiftsReinforcementPerDay: 0,
        shiftHours: 24,
        effectiveFrom: "2026-06-01",
        effectiveTo: "2026-06-09",
      },
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        shiftHours: 24,
        effectiveFrom: "2026-06-10",
        effectiveTo: null,
      },
    ];
    const map = buildExpectedShiftsForLocalMonth("o1", 2026, 5, rows);
    expect(map["2026-06-01"]?.regular).toBe(1);
    expect(map["2026-06-01"]?.shiftHours).toBe(24);
    expect(map["2026-06-08"]?.regular).toBe(1);
    expect(map["2026-06-15"]?.regular).toBe(2);
    expect(map["2026-06-10"]?.shiftHours).toBe(24);
  });

  it("weeklyExpectedShiftsFromDateMap matches per-day plan for each weekday", () => {
    const byDate = buildExpectedShiftsForLocalMonth("o1", 2026, 5, [
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        shiftHours: 14,
        shiftsRapidResponsePerDay: 1,
        rapidResponseShiftHours: 12,
        effectiveFrom: "2026-05-01",
        effectiveTo: null,
      },
    ]);
    const weekly = weeklyExpectedShiftsFromDateMap(byDate, 2026, 5);
    expect(weekly.shiftHours[0]).toBe(14);
    expect(weekly.rapidResponse[0]).toBe(1);
    expect(byDate["2026-06-01"]?.shiftHours).toBe(14);
  });

  it("dominantTemplateEffectiveFromForMonth picks latest version in range", () => {
    const rows: ObjectShiftTemplateRow[] = [
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        effectiveFrom: "2026-05-01",
        effectiveTo: "2026-06-30",
      },
      {
        objectId: "o1",
        dayOfWeek: 1,
        shiftsPerDay: 2,
        shiftsReinforcementPerDay: 0,
        effectiveFrom: "2026-07-01",
        effectiveTo: null,
      },
    ];
    expect(dominantTemplateEffectiveFromForMonth(rows, "o1", 2026, 5)).toBe("2026-05-01");
    expect(dominantTemplateEffectiveFromForMonth(rows, "o1", 2026, 6)).toBe("2026-07-01");
  });

  it("counts only regular shifts for object-day", () => {
    const count = countRegularShiftsOnObjectDay(
      [
        {
          objectId: "o1",
          startsAt: new Date(2026, 4, 5, 8, 0, 0),
          shiftKind: "Regular",
        },
        {
          objectId: "o1",
          startsAt: new Date(2026, 4, 5, 20, 0, 0),
          shiftKind: "Reinforcement",
        },
      ],
      "o1",
      "2026-05-05",
    );
    expect(count).toBe(1);
  });
});
