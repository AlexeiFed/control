import { describe, expect, it } from "vitest";
import { buildMobileScheduleCards } from "../../src/lib/scheduling/mobile-schedule-calendar";
import type { ExpectedShifts } from "../../src/lib/scheduling/object-shift-templates";
import {
  createSchedulerGuard,
  createSchedulerShift,
  type SecurityObject,
  type Shift,
} from "../../src/lib/scheduling/types";

const dayIsos = Array.from(
  { length: 14 },
  (_, index) => `2026-07-${String(13 + index).padStart(2, "0")}`,
);
const weekDays = dayIsos.map((iso, index) => ({
  iso,
  label: `${index < 7 ? "Неделя 1" : "Неделя 2"} · ${iso}`,
  date: new Date(`${iso}T00:00:00+10:00`),
}));
const objectItem: SecurityObject = {
  id: "o1",
  name: "ТЦ Север",
  address: "ул. Ленина, 18",
  status: "Active",
  operationalDayStartTime: "08:00",
};
const guard = createSchedulerGuard({ id: "g1", name: "Иванов Иван", status: "Active" });
const fullNorm: ExpectedShifts = {
  regular: 1,
  reinforcement: 0,
  shiftHours: 12,
  reinforcementShiftHours: 12,
  rapidResponse: 0,
  rapidResponseShiftHours: 12,
  shiftLead: 0,
  shiftLeadShiftHours: 12,
};

function makeInput(shifts: Shift[] = [], norms: Record<string, ExpectedShifts> = {}) {
  return {
    objects: [objectItem],
    guards: [guard],
    shifts,
    weekDays,
    expectedShiftsByObjectDay: { o1: norms },
    holidayDateKeys: new Set<string>(),
    todayIso: "2026-07-13",
  };
}

describe("buildMobileScheduleCards", () => {
  it("returns exactly 14 ordered day cells for every object", () => {
    const [card] = buildMobileScheduleCards(makeInput());

    expect(card?.days.map((day) => day.dateIso)).toEqual(dayIsos);
  });

  it("assigns a tail shift to the operational day before the anchor", () => {
    const anchoredObject = { ...objectItem, operationalDayStartTime: "09:00" };
    const tail = createSchedulerShift({
      id: "tail",
      guardId: guard.id,
      objectId: objectItem.id,
      startsAt: new Date("2026-07-14T08:00:00+10:00"),
      endsAt: new Date("2026-07-14T09:00:00+10:00"),
    });

    const [card] = buildMobileScheduleCards({
      ...makeInput([tail]),
      objects: [anchoredObject],
    });

    expect(card?.days[0]?.shifts.map((shift) => shift.id)).toEqual(["tail"]);
  });

  it("calculates plan shortage with existing metrics", () => {
    const [card] = buildMobileScheduleCards(makeInput([], { "2026-07-13": fullNorm }));

    expect(card?.days[0]?.shortageHours).toBe(12);
    expect(card?.days[0]?.hasShortage).toBe(true);
    expect(card?.totalShortageHours).toBe(12);
  });

  it("keeps no-show shifts visible but excludes them from worked hours", () => {
    const noShow: Shift = {
      ...createSchedulerShift({
        id: "no-show",
        guardId: guard.id,
        objectId: objectItem.id,
        startsAt: new Date("2026-07-13T08:00:00+10:00"),
        endsAt: new Date("2026-07-13T20:00:00+10:00"),
      }),
      isNoShow: true,
    };

    const [card] = buildMobileScheduleCards(
      makeInput([noShow], { "2026-07-13": fullNorm }),
    );

    expect(card?.days[0]?.shifts[0]?.isNoShow).toBe(true);
    expect(card?.days[0]?.workedHours).toBe(0);
  });

  it("marks today, weekends and holidays", () => {
    const [card] = buildMobileScheduleCards({
      ...makeInput(),
      holidayDateKeys: new Set(["2026-07-18"]),
    });

    expect(card?.days[0]?.isToday).toBe(true);
    expect(card?.days[5]?.isWeekend).toBe(true);
    expect(card?.days[5]?.isHoliday).toBe(true);
  });
});
