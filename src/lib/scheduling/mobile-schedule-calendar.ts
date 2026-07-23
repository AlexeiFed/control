import { getDayKhabarovsk } from "../format/display-date";
import {
  dateTimeToHmKhabarovsk,
  shiftBelongsToOperationalDayColumn,
} from "./operational-day-timeline";
import type { ExpectedShifts } from "./object-shift-templates";
import {
  buildOperationalDayAnchorByObjectId,
  computeDayPlanMetrics,
} from "./schedule-shortage";
import { shiftCoverageMinutes } from "./shift-attendance";
import type { Guard, SecurityObject, Shift, ShiftKind } from "./types";

export type MobileScheduleShift = {
  id: string;
  guardId: string;
  guardName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  shiftKind: ShiftKind;
  isNoShow: boolean;
};

export type MobileScheduleDay = {
  dateIso: string;
  label: string;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  workedHours: number;
  shortageHours: number;
  hasShortage: boolean;
  shifts: MobileScheduleShift[];
};

export type MobileScheduleCard = {
  objectId: string;
  objectName: string;
  address: string;
  totalShortageHours: number;
  days: MobileScheduleDay[];
};

type MobileScheduleWeekDay = {
  iso: string;
  label: string;
  date: Date;
};

export function buildMobileScheduleCards(input: {
  objects: readonly SecurityObject[];
  guards: readonly Guard[];
  shifts: readonly Shift[];
  weekDays: readonly MobileScheduleWeekDay[];
  expectedShiftsByObjectDay: Record<string, Record<string, ExpectedShifts>>;
  holidayDateKeys: ReadonlySet<string>;
  todayIso: string;
}): MobileScheduleCard[] {
  const {
    objects,
    guards,
    shifts,
    weekDays,
    expectedShiftsByObjectDay,
    holidayDateKeys,
    todayIso,
  } = input;
  const guardNameById = new Map(guards.map((guard) => [guard.id, guard.name]));
  const anchorByObjectId = buildOperationalDayAnchorByObjectId(objects);

  return objects.map((objectItem) => {
    const objectShifts = shifts.filter((shift) => shift.objectId === objectItem.id);
    const days = weekDays.map((day): MobileScheduleDay => {
      const dayShifts = objectShifts
        .filter((shift) =>
          shiftBelongsToOperationalDayColumn(shift, day.iso, anchorByObjectId),
        )
        .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
      const metrics = computeDayPlanMetrics(
        dayShifts,
        expectedShiftsByObjectDay[objectItem.id]?.[day.iso],
      );
      const shortageHours = metrics
        ? metrics.hoursShort +
          metrics.reinforcementHoursShort +
          metrics.rapidResponseHoursShort +
          metrics.shiftLeadHoursShort
        : 0;
      const workedHours = roundHours(
        dayShifts.reduce(
          (sum, shift) => sum + shiftCoverageMinutes(shift) / 60,
          0,
        ),
      );
      const weekday = getDayKhabarovsk(day.date);

      return {
        dateIso: day.iso,
        label: day.label,
        isToday: day.iso === todayIso,
        isWeekend: weekday === 0 || weekday === 6,
        isHoliday: holidayDateKeys.has(day.iso),
        workedHours,
        shortageHours: roundHours(shortageHours),
        hasShortage: shortageHours > 0,
        shifts: dayShifts.map((shift) => ({
          id: shift.id,
          guardId: shift.guardId,
          guardName: guardNameById.get(shift.guardId) ?? shift.guardId,
          startTime: dateTimeToHmKhabarovsk(shift.startsAt),
          endTime: dateTimeToHmKhabarovsk(shift.endsAt),
          durationHours: roundHours(
            (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000,
          ),
          shiftKind: shift.shiftKind,
          isNoShow: shift.isNoShow,
        })),
      };
    });

    return {
      objectId: objectItem.id,
      objectName: objectItem.name,
      address: objectItem.address,
      totalShortageHours: roundHours(
        days.reduce((sum, day) => sum + day.shortageHours, 0),
      ),
      days,
    };
  });
}

function roundHours(value: number): number {
  return Math.round(value * 10) / 10;
}
