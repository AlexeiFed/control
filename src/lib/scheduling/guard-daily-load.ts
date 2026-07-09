import { addDaysToIsoDate, toDateIsoKhabarovsk } from "../format/display-date";

export const MAX_GUARD_DAY_MINUTES = 24 * 60;

export type ShiftIntervalLike = {
  id?: string;
  guardId: string;
  objectId: string;
  startsAt: Date;
  endsAt: Date;
  isNoShow?: boolean;
};

/** Минуты смены, приходящиеся на локальный календарный день (Хабаровск UTC+10). */
export function splitMinutesByLocalDay(startsAt: Date, endsAt: Date): Record<string, number> {
  if (endsAt <= startsAt) {
    throw new Error("Shift end must be after shift start");
  }

  const result: Record<string, number> = {};
  let cursor = new Date(startsAt);

  while (cursor < endsAt) {
    const dateIso = toDateIsoKhabarovsk(cursor);
    const dayStart = new Date(`${dateIso}T00:00:00+10:00`);
    const dayEnd = new Date(`${addDaysToIsoDate(dateIso, 1)}T00:00:00+10:00`);
    const segmentEnd = endsAt < dayEnd ? endsAt : dayEnd;
    const minutes = Math.max(0, Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000));
    if (minutes > 0) {
      result[dateIso] = (result[dateIso] ?? 0) + minutes;
    }
    cursor = segmentEnd;
  }

  return result;
}

export function shiftDurationMinutes(startsAt: Date, endsAt: Date): number {
  return Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));
}

export function localDatesSpannedByShift(startsAt: Date, endsAt: Date): string[] {
  return Object.keys(splitMinutesByLocalDay(startsAt, endsAt));
}

function isActiveShift(shift: ShiftIntervalLike): boolean {
  return shift.isNoShow !== true;
}

/** Обрезка интервала смены до границ локального дня. */
export function clipIntervalToLocalDay(
  startsAt: Date,
  endsAt: Date,
  dateIso: string,
): { start: Date; end: Date } | null {
  const dayStart = new Date(`${dateIso}T00:00:00+10:00`);
  const dayEnd = new Date(`${addDaysToIsoDate(dateIso, 1)}T00:00:00+10:00`);
  const start = startsAt > dayStart ? startsAt : dayStart;
  const end = endsAt < dayEnd ? endsAt : dayEnd;
  if (end <= start) return null;
  return { start, end };
}

function mergeIntervalMinutes(intervals: ReadonlyArray<{ startMs: number; endMs: number }>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a.startMs - b.startMs);
  let total = 0;
  let curStart = sorted[0]!.startMs;
  let curEnd = sorted[0]!.endMs;
  for (let i = 1; i < sorted.length; i++) {
    const iv = sorted[i]!;
    if (iv.startMs <= curEnd) {
      curEnd = Math.max(curEnd, iv.endMs);
    } else {
      total += curEnd - curStart;
      curStart = iv.startMs;
      curEnd = iv.endMs;
    }
  }
  total += curEnd - curStart;
  return Math.round(total / 60_000);
}

/** Сумма минут охранника по локальным дням (без одной смены при редактировании). */
export function guardDayMinutesByDate(
  guardId: string,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const shift of shifts) {
    if (shift.guardId !== guardId) continue;
    if (excludeShiftId && shift.id === excludeShiftId) continue;
    if (!isActiveShift(shift)) continue;
    const byDay = splitMinutesByLocalDay(shift.startsAt, shift.endsAt);
    for (const [dateIso, minutes] of Object.entries(byDay)) {
      totals[dateIso] = (totals[dateIso] ?? 0) + minutes;
    }
  }
  return totals;
}

/** Суточная нагрузка с объединением пересекающихся интервалов (без двойного счёта). */
export function guardMergedDayMinutesByDate(
  guardId: string,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
): Record<string, number> {
  const intervalsByDate: Record<string, Array<{ startMs: number; endMs: number }>> = {};

  for (const shift of shifts) {
    if (shift.guardId !== guardId) continue;
    if (excludeShiftId && shift.id === excludeShiftId) continue;
    if (!isActiveShift(shift)) continue;

    for (const dateIso of localDatesSpannedByShift(shift.startsAt, shift.endsAt)) {
      const clipped = clipIntervalToLocalDay(shift.startsAt, shift.endsAt, dateIso);
      if (!clipped) continue;
      if (!intervalsByDate[dateIso]) intervalsByDate[dateIso] = [];
      intervalsByDate[dateIso].push({
        startMs: clipped.start.getTime(),
        endMs: clipped.end.getTime(),
      });
    }
  }

  const totals: Record<string, number> = {};
  for (const [dateIso, intervals] of Object.entries(intervalsByDate)) {
    totals[dateIso] = mergeIntervalMinutes(intervals);
  }
  return totals;
}

export function segmentOverlapsInterval(
  segmentStart: Date,
  segmentEnd: Date,
  intervalStart: Date,
  intervalEnd: Date,
): boolean {
  return segmentStart < intervalEnd && segmentEnd > intervalStart;
}

export type GuardTimeOverlapOptions = {
  /** Дата ячейки графика: смены, начатые в предыдущие дни, не блокируют назначение. */
  assignmentDateIso?: string;
};

export function findGuardTimeOverlap(
  guardId: string,
  startsAt: Date,
  endsAt: Date,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
  options?: GuardTimeOverlapOptions,
): ShiftIntervalLike | null {
  return (
    shifts.find((shift) => {
      if (shift.guardId !== guardId) return false;
      if (excludeShiftId && shift.id === excludeShiftId) return false;
      if (!isActiveShift(shift)) return false;
      if (options?.assignmentDateIso) {
        const shiftStartDateIso = toDateIsoKhabarovsk(shift.startsAt);
        if (shiftStartDateIso < options.assignmentDateIso) return false;
      }
      return startsAt < shift.endsAt && endsAt > shift.startsAt;
    }) ?? null
  );
}

export function findSameObjectTimeOverlap(
  guardId: string,
  objectId: string,
  startsAt: Date,
  endsAt: Date,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
): ShiftIntervalLike | null {
  const overlap = findGuardTimeOverlap(guardId, startsAt, endsAt, shifts, excludeShiftId);
  return overlap?.objectId === objectId ? overlap : null;
}

export type DailyHoursExceeded = {
  dateIso: string;
  existingMinutes: number;
  candidateMinutes: number;
  limitMinutes: number;
};

export function findDailyHoursExceeded(
  guardId: string,
  startsAt: Date,
  endsAt: Date,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
): DailyHoursExceeded | null {
  const existingByDate = guardMergedDayMinutesByDate(guardId, shifts, excludeShiftId);
  const candidateByDate = splitMinutesByLocalDay(startsAt, endsAt);

  for (const [dateIso, candidateMinutes] of Object.entries(candidateByDate)) {
    const existingMinutes = existingByDate[dateIso] ?? 0;
    if (existingMinutes + candidateMinutes > MAX_GUARD_DAY_MINUTES) {
      return {
        dateIso,
        existingMinutes,
        candidateMinutes,
        limitMinutes: MAX_GUARD_DAY_MINUTES,
      };
    }
  }
  return null;
}

export type OtherObjectDayShift = {
  shiftId: string;
  objectId: string;
  startsAt: Date;
  endsAt: Date;
  /** Фрагмент смены в пределах дня назначения. */
  segmentStartsAt: Date;
  segmentEndsAt: Date;
  minutesOnDate: number;
};

/** Смены охранника на других объектах в указанный локальный день. */
export function listOtherObjectShiftsOnDate(
  guardId: string,
  dateIso: string,
  currentObjectId: string,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
): OtherObjectDayShift[] {
  const out: OtherObjectDayShift[] = [];
  for (const shift of shifts) {
    if (shift.guardId !== guardId) continue;
    if (shift.objectId === currentObjectId) continue;
    if (excludeShiftId && shift.id === excludeShiftId) continue;
    if (!isActiveShift(shift)) continue;
    const clipped = clipIntervalToLocalDay(shift.startsAt, shift.endsAt, dateIso);
    if (!clipped) continue;
    const minutesOnDate = Math.max(
      0,
      Math.round((clipped.end.getTime() - clipped.start.getTime()) / 60_000),
    );
    if (minutesOnDate <= 0) continue;
    out.push({
      shiftId: shift.id ?? "",
      objectId: shift.objectId,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      segmentStartsAt: clipped.start,
      segmentEndsAt: clipped.end,
      minutesOnDate,
    });
  }
  return out.sort((a, b) => a.segmentStartsAt.getTime() - b.segmentStartsAt.getTime());
}

export function remainingDayMinutes(
  guardId: string,
  dateIso: string,
  shifts: ReadonlyArray<ShiftIntervalLike>,
  excludeShiftId?: string,
): number {
  const used = guardMergedDayMinutesByDate(guardId, shifts, excludeShiftId)[dateIso] ?? 0;
  return Math.max(0, MAX_GUARD_DAY_MINUTES - used);
}

export function candidateDayMinutesOnDate(startsAt: Date, endsAt: Date, dateIso: string): number {
  return splitMinutesByLocalDay(startsAt, endsAt)[dateIso] ?? 0;
}

export function formatMinutesAsHours(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}
