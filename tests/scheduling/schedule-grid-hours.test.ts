import { describe, expect, it } from "vitest";
import { buildShiftIntervalFromHm } from "../../src/lib/scheduling/operational-day-timeline";
import { sumMonthScheduleCoverageHours } from "../../src/lib/scheduling/schedule-grid-hours";
import type { Shift } from "../../src/lib/scheduling/types";

function sutki09(id: string, columnDateIso: string): Shift {
  const { startsAt, endsAt } = buildShiftIntervalFromHm(columnDateIso, "09:00", "09:00", "09:00");
  return {
    id,
    guardId: "g1",
    objectId: "o1",
    postId: null,
    startsAt,
    endsAt,
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
  };
}

describe("sumMonthScheduleCoverageHours", () => {
  it("не считает хвост предыдущего месяца при якоре 09:00 (31×24, не 768)", () => {
    const augustIsos = Array.from(
      { length: 31 },
      (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`,
    );
    const shifts = [
      sutki09("jul-31", "2026-07-31"),
      ...augustIsos.map((iso) => sutki09(iso, iso)),
    ];
    expect(shifts).toHaveLength(32);
    expect(sumMonthScheduleCoverageHours(shifts, new Set(augustIsos), "09:00")).toBe(744);
  });
});
