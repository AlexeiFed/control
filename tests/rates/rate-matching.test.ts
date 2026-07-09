import { describe, expect, it } from "vitest";
import type { ObjectRateRuleRecord } from "../../src/lib/operations/object-rate-rules-repository";
import {
  buildSegmentContext,
  findBestMatchingRule,
  minuteInTimeWindow,
  parseTimeToMinutes,
  ruleMatchesSegment,
} from "../../src/lib/rates/rate-matching";
import { createSchedulerGuard, createSchedulerShift } from "../../src/lib/scheduling/types";

const TZ = "Australia/Sydney";

function R(partial: Partial<ObjectRateRuleRecord> & Pick<ObjectRateRuleRecord, "id" | "name" | "priority">): ObjectRateRuleRecord {
  return {
    objectId: "o1",
    daysOfWeek: null,
    isHoliday: null,
    shiftKind: null,
    startsAt: null,
    endsAt: null,
    position: null,
    licenseType: null,
    employmentType: null,
    isTrainee: null,
    clientRateCents: 0,
    guardRateCents: 0,
    rateUnit: "Hour",
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    ...partial,
  };
}

describe("rate-matching", () => {
  it("minuteInTimeWindow supports overnight interval", () => {
    expect(minuteInTimeWindow(22 * 60 + 30, "22:00", "08:00")).toBe(true);
    expect(minuteInTimeWindow(7 * 60 + 30, "22:00", "08:00")).toBe(true);
    expect(minuteInTimeWindow(12 * 60, "22:00", "08:00")).toBe(false);
  });

  it("parseTimeToMinutes", () => {
    expect(parseTimeToMinutes("08:30")).toBe(8 * 60 + 30);
    expect(parseTimeToMinutes(null)).toBe(null);
  });

  it("picks higher priority when both rules match", () => {
    const low = R({ id: "1", name: "База", priority: 50, licenseType: "None", position: "Guard" });
    const high = R({ id: "2", name: "Пятница", priority: 80, daysOfWeek: [5], licenseType: "None", position: "Guard" });
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    guard.licenseType = "None";
    guard.position = "Guard";
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    const holidays = new Set<string>();
    const at = new Date("2026-05-01T10:30:00+10:00");
    const ctx = buildSegmentContext(at, guard, shift, holidays, TZ);
    expect(ctx.dayOfWeekMon1Sun7).toBe(5);
    expect(findBestMatchingRule([low, high], ctx)?.id).toBe("2");
  });

  it("matches when segment day is in rule daysOfWeek", () => {
    const weekdays = R({ id: "wd", name: "Будни", priority: 80, daysOfWeek: [1, 3, 5] });
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-06T10:00:00+10:00"),
      endsAt: new Date("2026-05-06T11:00:00+10:00"),
    });
    const at = new Date("2026-05-06T10:30:00+10:00");
    const ctx = buildSegmentContext(at, guard, shift, new Set(), TZ);
    expect(ctx.dayOfWeekMon1Sun7).toBe(3);
    expect(ruleMatchesSegment(weekdays, ctx)).toBe(true);
    const atFriday = new Date("2026-05-08T10:30:00+10:00");
    expect(ruleMatchesSegment(weekdays, buildSegmentContext(atFriday, guard, shift, new Set(), TZ))).toBe(true);
    const atTuesday = new Date("2026-05-05T10:30:00+10:00");
    expect(ruleMatchesSegment(weekdays, buildSegmentContext(atTuesday, guard, shift, new Set(), TZ))).toBe(false);
  });

  it("holiday rule only on holiday dates", () => {
    const holidayRule = R({
      id: "h",
      name: "Праздник",
      priority: 90,
      isHoliday: true,
      clientRateCents: 999,
    });
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-09T10:00:00+10:00"),
      endsAt: new Date("2026-05-09T11:00:00+10:00"),
    });
    const at = new Date("2026-05-09T10:30:00+10:00");
    expect(
      ruleMatchesSegment(
        holidayRule,
        buildSegmentContext(at, guard, shift, new Set(["2026-05-09"]), TZ),
      ),
    ).toBe(true);
    expect(
      ruleMatchesSegment(
        holidayRule,
        buildSegmentContext(at, guard, shift, new Set<string>(), TZ),
      ),
    ).toBe(false);
  });

  it("reinforcement shift_kind filter", () => {
    const reinf = R({ id: "r", name: "Усиление", priority: 85, shiftKind: "Reinforcement" });
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    shift.shiftKind = "Reinforcement";
    const at = new Date("2026-05-01T10:30:00+10:00");
    expect(ruleMatchesSegment(reinf, buildSegmentContext(at, guard, shift, new Set(), TZ))).toBe(true);
    shift.shiftKind = "Regular";
    expect(ruleMatchesSegment(reinf, buildSegmentContext(at, guard, shift, new Set(), TZ))).toBe(false);
  });

  it("Curator matches Curator + Licensed rule on Saturday in overnight window", () => {
    const curatorRule = R({
      id: "c1",
      name: "КУРАТОР ТУ",
      priority: 100,
      daysOfWeek: [6, 7],
      shiftKind: "Regular",
      startsAt: "14:00",
      endsAt: "08:00",
      position: "Curator",
      licenseType: "Licensed",
      employmentType: "Employed",
      guardRateCents: 18889,
    });
    const curator = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    curator.position = "Curator";
    curator.licenseType = "Licensed";
    curator.employmentType = "Employed";
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-02T14:00:00+10:00"),
      endsAt: new Date("2026-05-02T18:00:00+10:00"),
    });
    const at = new Date("2026-05-02T15:00:00+10:00");
    expect(ruleMatchesSegment(curatorRule, buildSegmentContext(at, curator, shift, new Set(), TZ))).toBe(true);
    expect(findBestMatchingRule([curatorRule], buildSegmentContext(at, curator, shift, new Set(), TZ))?.id).toBe(
      "c1",
    );
  });

  it("ShiftLead matches ShiftLead rule with license filter regardless of guard license", () => {
    const leadRule = R({
      id: "sl1",
      name: "Старший У",
      priority: 90,
      position: "ShiftLead",
      licenseType: "Licensed",
      guardRateCents: 20_000,
    });
    const lead = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    lead.position = "ShiftLead";
    lead.licenseType = null;
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    const at = new Date("2026-05-01T10:30:00+10:00");
    expect(ruleMatchesSegment(leadRule, buildSegmentContext(at, lead, shift, new Set(), TZ))).toBe(true);
  });

  it("Curator with null license matches Curator + None rule", () => {
    const rule = R({
      id: "c0",
      name: "Куратор Б/У",
      priority: 80,
      position: "Curator",
      licenseType: "None",
      guardRateCents: 15_000,
    });
    const curator = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    curator.position = "Curator";
    curator.licenseType = null;
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    const at = new Date("2026-05-01T10:30:00+10:00");
    expect(ruleMatchesSegment(rule, buildSegmentContext(at, curator, shift, new Set(), TZ))).toBe(true);
  });

  it("ShiftLead does not match Guard + license rule", () => {
    const guardRule = R({
      id: "g1",
      name: "Охранник У",
      priority: 55,
      position: "Guard",
      licenseType: "Licensed",
    });
    const lead = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    lead.position = "ShiftLead";
    lead.licenseType = null;
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    const at = new Date("2026-05-01T10:30:00+10:00");
    expect(ruleMatchesSegment(guardRule, buildSegmentContext(at, lead, shift, new Set(), TZ))).toBe(false);
  });

  it("trainee flag matches", () => {
    const tr = R({ id: "t", name: "Стажёр", priority: 70, isTrainee: true });
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    guard.isTrainee = true;
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    const at = new Date("2026-05-01T10:30:00+10:00");
    expect(ruleMatchesSegment(tr, buildSegmentContext(at, guard, shift, new Set(), TZ))).toBe(true);
    guard.isTrainee = false;
    expect(ruleMatchesSegment(tr, buildSegmentContext(at, guard, shift, new Set(), TZ))).toBe(false);
  });

  it("employment filter", () => {
    const emp = R({ id: "e", name: "Нет труд", priority: 65, employmentType: "Unemployed" });
    const guard = createSchedulerGuard({ id: "g", name: "G", status: "Active" });
    guard.employmentType = "Unemployed";
    const shift = createSchedulerShift({
      id: "s",
      guardId: "g",
      objectId: "o1",
      startsAt: new Date("2026-05-01T10:00:00+10:00"),
      endsAt: new Date("2026-05-01T11:00:00+10:00"),
    });
    const at = new Date("2026-05-01T10:30:00+10:00");
    expect(ruleMatchesSegment(emp, buildSegmentContext(at, guard, shift, new Set(), TZ))).toBe(true);
    guard.employmentType = "Employed";
    expect(ruleMatchesSegment(emp, buildSegmentContext(at, guard, shift, new Set(), TZ))).toBe(false);
  });
});
