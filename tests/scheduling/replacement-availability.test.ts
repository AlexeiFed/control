import { describe, expect, it } from "vitest";
import {
  formatRequestedGuardSubstitutionHint,
  formatGuardAvailabilityMessage,
  listAvailableGuardsForShiftInterval,
  listGuardsWithAvailability,
} from "../../src/lib/scheduling/replacement-availability";

const guards = [
  { id: "original", status: "Active" },
  { id: "free", status: "Active" },
  { id: "busy", status: "Active" },
  { id: "sick", status: "Sick" },
] as const;

describe("formatRequestedGuardSubstitutionHint", () => {
  it("описывает пересечение со сменой на другом объекте", () => {
    const hint = formatRequestedGuardSubstitutionHint(
      "Криштапов Михаил",
      {
        available: false,
        reason: "ConflictingShift",
        conflictStart: new Date("2026-06-21T08:00:00+10:00"),
        conflictEnd: new Date("2026-06-22T08:00:00+10:00"),
        conflictObjectId: "gidro",
      },
      new Map([["gidro", "Гидрострой"]]),
    );
    expect(hint).toContain("В строке — Криштапов Михаил");
    expect(hint).toContain("пересечение");
    expect(hint).toContain("Гидрострой");
    expect(hint).toContain("8 - 8");
    expect(hint).not.toContain("нет свободных часов");
  });

  it("указывает подобранного охранника", () => {
    const hint = formatRequestedGuardSubstitutionHint(
      "Кудряшов Сергей",
      {
        available: false,
        reason: "ConflictingShift",
        conflictStart: new Date("2026-06-21T20:00:00+10:00"),
        conflictEnd: new Date("2026-06-22T08:00:00+10:00"),
        conflictObjectId: "stroykor",
      },
      new Map([["stroykor", "ООО СТРОЙКОР"]]),
      "Авдеев Юрий",
    );
    expect(hint).toContain("Кудряшов Сергей");
    expect(hint).toContain("ООО СТРОЙКОР");
    expect(hint).toContain("Назначен Авдеев Юрий");
  });
});

describe("formatGuardAvailabilityMessage", () => {
  it("описывает суточный лимит с остатком часов", () => {
    const message = formatGuardAvailabilityMessage(
      "Иванов Иван",
      {
        available: false,
        reason: "DailyHoursExceeded",
        assignmentDayUsedMinutes: 12 * 60,
        candidateDayMinutes: 16.8 * 60,
        remainingDayMinutes: 12 * 60,
      },
      new Map(),
    );
    expect(message).toContain("уже 12 ч");
    expect(message).toContain("16.8 ч");
    expect(message).toContain("свободно 12 ч");
    expect(message).not.toContain("нет свободных часов в этот день");
  });

  it("описывает полностью занятые сутки", () => {
    const message = formatGuardAvailabilityMessage(
      "Иванов Иван",
      {
        available: false,
        reason: "DailyHoursExceeded",
        assignmentDayUsedMinutes: 24 * 60,
        candidateDayMinutes: 8 * 60,
        remainingDayMinutes: 0,
      },
      new Map(),
    );
    expect(message).toContain("свободных часов нет");
  });
});

describe("replacement guard availability", () => {
  it("excludes the incident guard and guards with overlap on the same object", () => {
    const interval = {
      startsAt: new Date("2026-05-13T08:00:00+10:00"),
      endsAt: new Date("2026-05-13T20:00:00+10:00"),
      objectId: "o-current",
    };

    const available = listAvailableGuardsForShiftInterval(
      guards,
      [
        {
          id: "incident-shift",
          guardId: "original",
          objectId: "o-current",
          startsAt: interval.startsAt,
          endsAt: interval.endsAt,
          isNoShow: true,
        },
        {
          id: "busy-shift",
          guardId: "busy",
          objectId: "o-current",
          startsAt: new Date("2026-05-13T12:00:00+10:00"),
          endsAt: new Date("2026-05-13T18:00:00+10:00"),
          isNoShow: false,
        },
      ],
      interval,
      { replaceShiftId: "incident-shift", excludeGuardId: "original", currentObjectId: "o-current" },
    );

    expect(available.map((guard) => guard.id)).toEqual(["free"]);
  });

  it("blocks overlap on another object even when daily total is within 24h", () => {
    const interval = {
      startsAt: new Date("2026-05-13T09:00:00+10:00"),
      endsAt: new Date("2026-05-13T10:00:00+10:00"),
      objectId: "o-current",
    };

    const available = listAvailableGuardsForShiftInterval(
      guards,
      [
        {
          id: "other-object-shift",
          guardId: "busy",
          objectId: "o-other",
          startsAt: new Date("2026-05-13T08:00:00+10:00"),
          endsAt: new Date("2026-05-13T10:00:00+10:00"),
          isNoShow: false,
        },
      ],
      interval,
      { currentObjectId: "o-current", assignmentDateIso: "2026-05-13" },
    );

    expect(available.map((guard) => guard.id)).not.toContain("busy");
  });

  it("marks guard available for 08:00-20:00 after overnight shift ending at 08:00", () => {
    const interval = {
      startsAt: new Date("2026-06-14T08:00:00+10:00"),
      endsAt: new Date("2026-06-14T20:00:00+10:00"),
      objectId: "o-dars",
    };

    const availability = listGuardsWithAvailability(
      [{ id: "shavrin", status: "Active" }],
      [
        {
          id: "stroykor-24h",
          guardId: "shavrin",
          objectId: "o-stroykor",
          startsAt: new Date("2026-06-13T08:00:00+10:00"),
          endsAt: new Date("2026-06-14T08:00:00+10:00"),
          isNoShow: false,
        },
      ],
      interval,
      { currentObjectId: "o-dars", assignmentDateIso: "2026-06-14" },
    );

    expect(availability[0]?.available).toBe(true);
  });

  it("blocks when next 24h shift on other object starts at 08:00 same day", () => {
    const interval = {
      startsAt: new Date("2026-06-14T08:00:00+10:00"),
      endsAt: new Date("2026-06-14T20:00:00+10:00"),
      objectId: "o-dars",
    };

    const availability = listGuardsWithAvailability(
      [{ id: "shavrin", status: "Active" }],
      [
        {
          id: "stroykor-next",
          guardId: "shavrin",
          objectId: "o-stroykor",
          startsAt: new Date("2026-06-14T08:00:00+10:00"),
          endsAt: new Date("2026-06-15T08:00:00+10:00"),
          isNoShow: false,
        },
      ],
      interval,
      { currentObjectId: "o-dars", assignmentDateIso: "2026-06-14" },
    );

    expect(availability[0]?.available).toBe(false);
    expect(availability[0]?.reason).toBe("ConflictingShift");
  });

  it("does not double-count overlapping tail when checking daily limit", () => {
    const interval = {
      startsAt: new Date("2026-06-14T08:00:00+10:00"),
      endsAt: new Date("2026-06-14T20:00:00+10:00"),
      objectId: "o-dars",
    };

    const availability = listGuardsWithAvailability(
      [{ id: "shavrin", status: "Active" }],
      [
        {
          id: "stroykor-24h",
          guardId: "shavrin",
          objectId: "o-stroykor",
          startsAt: new Date("2026-06-13T08:00:00+10:00"),
          endsAt: new Date("2026-06-14T08:00:00+10:00"),
          isNoShow: false,
        },
        {
          id: "stroykor-morning",
          guardId: "shavrin",
          objectId: "o-stroykor",
          startsAt: new Date("2026-06-14T01:00:00+10:00"),
          endsAt: new Date("2026-06-14T08:00:00+10:00"),
          isNoShow: false,
        },
      ],
      interval,
      { currentObjectId: "o-dars", assignmentDateIso: "2026-06-14" },
    );

    expect(availability[0]?.available).toBe(true);
  });
});
