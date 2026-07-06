import { describe, expect, it } from "vitest";
import { findScheduleConflict } from "../../src/lib/scheduling/conflicts";
import { createSchedulerGuard } from "../../src/lib/scheduling/types";
import {
  findDailyHoursExceeded,
  guardMergedDayMinutesByDate,
  listOtherObjectShiftsOnDate,
  MAX_GUARD_DAY_MINUTES,
  splitMinutesByLocalDay,
} from "../../src/lib/scheduling/guard-daily-load";

const candidate = {
  guardId: "g1",
  objectId: "o1",
  startsAt: new Date("2026-05-01T08:00:00+10:00"),
  endsAt: new Date("2026-05-01T20:00:00+10:00"),
  shiftKind: "Regular" as const,
  manualClientRateCents: null as number | null,
  manualGuardRateCents: null as number | null,
  manualRateUnit: null,
  manualRateReason: "",
  isNoShow: false,
  incidentCategory: null,
  incidentComment: "",
  incidentWorkedUntilAt: null,
  incidentRecordedAt: null,
  replacedByShiftId: null,
  postId: null,
  selectedRateRuleId: null,
};

describe("schedule conflicts", () => {
  it("blocks sick, vacation, and inactive guards", () => {
    expect(
      findScheduleConflict(createSchedulerGuard({ id: "g1", name: "Ivan", status: "Sick" }), candidate, []),
    ).toEqual({ type: "guard-status", status: "Sick" });
    expect(
      findScheduleConflict(createSchedulerGuard({ id: "g1", name: "Ivan", status: "OnVacation" }), candidate, []),
    ).toEqual({ type: "guard-status", status: "OnVacation" });
    expect(
      findScheduleConflict(createSchedulerGuard({ id: "g1", name: "Ivan", status: "Inactive" }), candidate, []),
    ).toEqual({ type: "guard-status", status: "Inactive" });
  });

  it("blocks overlapping shifts on the same object", () => {
    const conflict = findScheduleConflict(
      createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
      {
        ...candidate,
        guardId: "g1",
        objectId: "o1",
        startsAt: new Date("2026-05-01T12:00:00+10:00"),
        endsAt: new Date("2026-05-01T18:00:00+10:00"),
      },
      [
        {
          id: "s1",
          guardId: "g1",
          objectId: "o1",
          startsAt: new Date("2026-05-01T08:00:00+10:00"),
          endsAt: new Date("2026-05-01T20:00:00+10:00"),
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
  postId: null,
  selectedRateRuleId: null,
        },
      ],
    );

    expect(conflict).toEqual({ type: "shift-overlap", shiftId: "s1", objectId: "o1" });
  });

  it("blocks overlapping time on different objects", () => {
    const conflict = findScheduleConflict(
      createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
      {
        ...candidate,
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-05-06T09:00:00+10:00"),
        endsAt: new Date("2026-05-06T10:00:00+10:00"),
      },
      [
        {
          id: "s1",
          guardId: "g1",
          objectId: "o1",
          startsAt: new Date("2026-05-06T08:00:00+10:00"),
          endsAt: new Date("2026-05-06T10:00:00+10:00"),
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
  postId: null,
  selectedRateRuleId: null,
        },
      ],
    );

    expect(conflict).toEqual({ type: "shift-overlap", shiftId: "s1", objectId: "o1" });
  });

  it("allows non-overlapping shifts on different objects within 24h", () => {
    expect(
      findScheduleConflict(
        createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
        {
          ...candidate,
          guardId: "g1",
          objectId: "o2",
          startsAt: new Date("2026-05-06T14:00:00+10:00"),
          endsAt: new Date("2026-05-06T18:00:00+10:00"),
        },
        [
          {
            id: "s1",
            guardId: "g1",
            objectId: "o1",
            startsAt: new Date("2026-05-06T08:00:00+10:00"),
            endsAt: new Date("2026-05-06T10:00:00+10:00"),
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
  postId: null,
  selectedRateRuleId: null,
          },
        ],
      ),
    ).toBeNull();
  });

  it("prioritizes shift-overlap over daily-hours-exceeded", () => {
    const existingShifts = [
      {
        id: "s1",
        guardId: "g1",
        objectId: "o1",
        startsAt: new Date("2026-05-06T08:00:00+10:00"),
        endsAt: new Date("2026-05-06T10:00:00+10:00"),
        shiftKind: "Regular" as const,
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
  postId: null,
  selectedRateRuleId: null,
      },
      {
        id: "s2",
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-05-06T14:00:00+10:00"),
        endsAt: new Date("2026-05-06T15:00:00+10:00"),
        shiftKind: "Regular" as const,
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
  postId: null,
  selectedRateRuleId: null,
      },
    ];

    const conflict = findScheduleConflict(
      createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
      {
        ...candidate,
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-05-06T01:00:00+10:00"),
        endsAt: new Date("2026-05-07T00:00:00+10:00"),
      },
      existingShifts,
    );

    expect(conflict?.type).toBe("shift-overlap");
  });

  it("allows assignment on next calendar day while previous overnight shift still runs", () => {
    const overnightFromPrevDay = {
      id: "s-night",
      guardId: "g1",
      objectId: "o1",
      startsAt: new Date("2026-06-07T16:00:00+10:00"),
      endsAt: new Date("2026-06-08T08:00:00+10:00"),
      shiftKind: "Regular" as const,
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
  postId: null,
  selectedRateRuleId: null,
    };

    expect(
      findScheduleConflict(
        createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
        {
          ...candidate,
          guardId: "g1",
          objectId: "o2",
          startsAt: new Date("2026-06-08T01:00:00+10:00"),
          endsAt: new Date("2026-06-08T08:00:00+10:00"),
        },
        [overnightFromPrevDay],
        undefined,
        { assignmentDateIso: "2026-06-08" },
      ),
    ).toBeNull();
  });

  it("allows day shift at 08:00 after overnight shift ending at 08:00 on assignment day", () => {
    const overnightEndingMorning = {
      id: "s-24h",
      guardId: "g1",
      objectId: "o-stroykor",
      startsAt: new Date("2026-06-13T08:00:00+10:00"),
      endsAt: new Date("2026-06-14T08:00:00+10:00"),
      shiftKind: "Regular" as const,
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
  postId: null,
  selectedRateRuleId: null,
    };

    expect(
      findScheduleConflict(
        createSchedulerGuard({ id: "g1", name: "Shavrin", status: "Active" }),
        {
          ...candidate,
          guardId: "g1",
          objectId: "o-dars",
          startsAt: new Date("2026-06-14T08:00:00+10:00"),
          endsAt: new Date("2026-06-14T20:00:00+10:00"),
        },
        [overnightEndingMorning],
        undefined,
        { assignmentDateIso: "2026-06-14" },
      ),
    ).toBeNull();
  });

  it("blocks day shift when another object shift starts same morning on assignment day", () => {
    const sameMorningOtherObject = {
      id: "s-next",
      guardId: "g1",
      objectId: "o-stroykor",
      startsAt: new Date("2026-06-14T08:00:00+10:00"),
      endsAt: new Date("2026-06-15T08:00:00+10:00"),
      shiftKind: "Regular" as const,
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
  postId: null,
  selectedRateRuleId: null,
    };

    expect(
      findScheduleConflict(
        createSchedulerGuard({ id: "g1", name: "Shavrin", status: "Active" }),
        {
          ...candidate,
          guardId: "g1",
          objectId: "o-dars",
          startsAt: new Date("2026-06-14T08:00:00+10:00"),
          endsAt: new Date("2026-06-14T20:00:00+10:00"),
        },
        [sameMorningOtherObject],
        undefined,
        { assignmentDateIso: "2026-06-14" },
      ),
    ).toEqual({ type: "shift-overlap", shiftId: "s-next", objectId: "o-stroykor" });
  });

  it("allows adjacent shifts at 20:00 boundary and rejects invalid intervals", () => {
    expect(
      findScheduleConflict(
        createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
        {
          ...candidate,
          guardId: "g1",
          objectId: "o2",
          startsAt: new Date("2026-05-01T20:00:00+10:00"),
          endsAt: new Date("2026-05-02T08:00:00+10:00"),
        },
        [
          {
            id: "s1",
            guardId: "g1",
            objectId: "o1",
            startsAt: new Date("2026-05-01T08:00:00+10:00"),
            endsAt: new Date("2026-05-01T20:00:00+10:00"),
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
  postId: null,
  selectedRateRuleId: null,
          },
        ],
      ),
    ).toBeNull();

    expect(() =>
      findScheduleConflict(
        createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" }),
        {
          ...candidate,
          guardId: "g1",
          objectId: "o1",
          startsAt: new Date("2026-05-01T20:00:00+10:00"),
          endsAt: new Date("2026-05-01T08:00:00+10:00"),
        },
        [],
      ),
    ).toThrow("Shift end must be after shift start");
  });
});

describe("guard daily load", () => {
  it("splits minutes by local day", () => {
    expect(
      splitMinutesByLocalDay(
        new Date("2026-05-01T20:00:00+10:00"),
        new Date("2026-05-02T08:00:00+10:00"),
      ),
    ).toEqual({
      "2026-05-01": 240,
      "2026-05-02": 480,
    });
  });

  it("lists other object shifts on date", () => {
    const shifts = [
      {
        id: "s1",
        guardId: "g1",
        objectId: "o1",
        startsAt: new Date("2026-05-06T08:00:00+10:00"),
        endsAt: new Date("2026-05-06T10:00:00+10:00"),
      },
      {
        id: "s2",
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-05-06T14:00:00+10:00"),
        endsAt: new Date("2026-05-06T15:00:00+10:00"),
      },
    ];

    expect(listOtherObjectShiftsOnDate("g1", "2026-05-06", "o2", shifts)).toHaveLength(1);
    expect(findDailyHoursExceeded("g1", shifts[1]!.startsAt, shifts[1]!.endsAt, shifts)).toBeNull();
    expect(
      findDailyHoursExceeded(
        "g1",
        new Date("2026-05-06T01:00:00+10:00"),
        new Date("2026-05-07T00:00:00+10:00"),
        shifts,
      ),
    ).not.toBeNull();
    expect(MAX_GUARD_DAY_MINUTES).toBe(1440);
  });

  it("merges overlapping intervals on the same day", () => {
    const shifts = [
      {
        id: "tail",
        guardId: "g1",
        objectId: "o1",
        startsAt: new Date("2026-06-13T08:00:00+10:00"),
        endsAt: new Date("2026-06-14T08:00:00+10:00"),
      },
      {
        id: "morning",
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-06-14T01:00:00+10:00"),
        endsAt: new Date("2026-06-14T08:00:00+10:00"),
      },
    ];

    expect(guardMergedDayMinutesByDate("g1", shifts)["2026-06-14"]).toBe(480);
    expect(
      findDailyHoursExceeded(
        "g1",
        new Date("2026-06-14T08:00:00+10:00"),
        new Date("2026-06-14T20:00:00+10:00"),
        shifts,
      ),
    ).toBeNull();
  });

  it("detects daily limit when merged load plus candidate exceeds 24h", () => {
    const shifts = [
      {
        id: "a",
        guardId: "g1",
        objectId: "o1",
        startsAt: new Date("2026-06-14T00:00:00+10:00"),
        endsAt: new Date("2026-06-14T14:00:00+10:00"),
      },
      {
        id: "b",
        guardId: "g1",
        objectId: "o2",
        startsAt: new Date("2026-06-14T10:00:00+10:00"),
        endsAt: new Date("2026-06-14T20:00:00+10:00"),
      },
    ];

    expect(
      findDailyHoursExceeded(
        "g1",
        new Date("2026-06-14T19:00:00+10:00"),
        new Date("2026-06-15T02:00:00+10:00"),
        shifts,
      ),
    ).toMatchObject({ dateIso: "2026-06-14" });
  });
});
