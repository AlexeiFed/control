import {
  addDaysToIsoDate,
  coerceToDate,
  getKhabarovskComponents,
  toDateIsoKhabarovsk,
} from "../format/display-date";

/** Операционные сутки охраны по умолчанию: якорь 08:00 → 08:00 следующего календарного дня. */
export const DEFAULT_OPERATIONAL_DAY_START_TIME = "08:00";
export const OPERATIONAL_DAY_START_HOUR = 8;
export const OPERATIONAL_CYCLE_MINUTES = 24 * 60;
export const TIMELINE_SNAP_MINUTES = 15;

export function normalizeOperationalAnchorTime(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_OPERATIONAL_DAY_START_TIME;
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return DEFAULT_OPERATIONAL_DAY_START_TIME;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return DEFAULT_OPERATIONAL_DAY_START_TIME;
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseAnchorMinutes(anchorTime: string): number {
  const normalized = normalizeOperationalAnchorTime(anchorTime);
  const [h, m] = normalized.split(":").map(Number);
  return h * 60 + m;
}

export function formatMinutesHm(totalMinutes: number): string {
  const wrapped = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function addHoursToHm(hm: string, hours: number): string {
  return formatMinutesHm(parseAnchorMinutes(hm) + hours * 60);
}

export function defaultSutkiShiftInterval(anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME): {
  startTime: string;
  endTime: string;
} {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  return { startTime: anchor, endTime: anchor };
}

export function defaultDayShiftInterval(anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME): {
  startTime: string;
  endTime: string;
} {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  return { startTime: anchor, endTime: addHoursToHm(anchor, 12) };
}

export function tailPresetBeforeAnchor(anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME): {
  startTime: string;
  endTime: string;
} {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  return { startTime: addHoursToHm(anchor, -1), endTime: anchor };
}

export function buildOperationalTimelineTicks(anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME): ReadonlyArray<{
  offset: number;
  label: string;
}> {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  const anchorMin = parseAnchorMinutes(anchor);
  const offsets = [0, 6 * 60, 12 * 60, 18 * 60, OPERATIONAL_CYCLE_MINUTES] as const;
  return offsets.map((offset) => ({
    offset,
    label: formatMinutesHm(anchorMin + offset).slice(0, 2),
  }));
}

export function formatOperationalDayNightLabels(anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME): {
  dayLabel: string;
  nightLabel: string;
} {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  const dayEnd = addHoursToHm(anchor, 12);
  const short = (hm: string) => hm.slice(0, 2);
  return {
    dayLabel: `День ${short(anchor)}–${short(dayEnd)}`,
    nightLabel: `Ночь ${short(dayEnd)}–${short(anchor)}`,
  };
}

export function operationalDayStart(
  shiftDateIso: string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): Date {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  return new Date(`${shiftDateIso}T${anchor}:00+10:00`);
}

export function operationalDayEnd(shiftDateIso: string, anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME): Date {
  return new Date(
    operationalDayStart(shiftDateIso, anchorTime).getTime() + OPERATIONAL_CYCLE_MINUTES * 60_000,
  );
}

/** Календарная дата колонки графика (операционные сутки), к которой относится начало смены. */
export function operationalDayDateIsoFromStart(
  startsAt: Date | string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): string {
  const start = coerceToDate(startsAt);
  const calDateIso = toDateIsoKhabarovsk(start);
  const anchorMin = parseAnchorMinutes(anchorTime);
  const { hours, minutes } = getKhabarovskComponents(start);
  const timeMin = hours * 60 + minutes;
  if (timeMin < anchorMin) {
    return addDaysToIsoDate(calDateIso, -1);
  }
  return calDateIso;
}

/**
 * Колонка графика/экспорта для смены: хвост достаивания (окончание ровно на якоре)
 * относится к операционным суткам, заканчивающимся в этот момент.
 */
export function scheduleShiftColumnDateIso(
  shift: { startsAt: Date | string; endsAt: Date | string },
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): string {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  const startsAt = coerceToDate(shift.startsAt);
  const endsAt = coerceToDate(shift.endsAt);
  const anchorMin = parseAnchorMinutes(anchor);
  const endKh = getKhabarovskComponents(endsAt);
  const endMin = endKh.hours * 60 + endKh.minutes;

  if (endMin === anchorMin) {
    return addDaysToIsoDate(toDateIsoKhabarovsk(endsAt), -1);
  }

  return operationalDayDateIsoFromStart(startsAt, anchor);
}

export function shiftOperationalDayDateIso(
  shift: { objectId: string; startsAt: Date | string; endsAt: Date | string },
  anchorByObjectId: ReadonlyMap<string, string>,
  fallbackAnchor = DEFAULT_OPERATIONAL_DAY_START_TIME,
): string {
  return scheduleShiftColumnDateIso(
    shift,
    anchorByObjectId.get(shift.objectId) ?? fallbackAnchor,
  );
}

export function shiftBelongsToOperationalDayColumn(
  shift: { objectId: string; startsAt: Date | string; endsAt: Date | string },
  columnDateIso: string,
  anchorByObjectId: ReadonlyMap<string, string>,
  fallbackAnchor = DEFAULT_OPERATIONAL_DAY_START_TIME,
): boolean {
  return shiftOperationalDayDateIso(shift, anchorByObjectId, fallbackAnchor) === columnDateIso;
}

export function dateTimeToHmKhabarovsk(date: Date): string {
  const { hours, minutes } = getKhabarovskComponents(date);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function offsetToDateTime(
  shiftDateIso: string,
  offsetMin: number,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): Date {
  return new Date(operationalDayStart(shiftDateIso, anchorTime).getTime() + offsetMin * 60_000);
}

export function snapOffset(minutes: number): number {
  const snapped = Math.round(minutes / TIMELINE_SNAP_MINUTES) * TIMELINE_SNAP_MINUTES;
  return Math.max(0, Math.min(OPERATIONAL_CYCLE_MINUTES, snapped));
}

export function offsetsToHmPair(
  shiftDateIso: string,
  startOffset: number,
  endOffset: number,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startTime: string; endTime: string } {
  return {
    startTime: dateTimeToHmKhabarovsk(offsetToDateTime(shiftDateIso, startOffset, anchorTime)),
    endTime: dateTimeToHmKhabarovsk(offsetToDateTime(shiftDateIso, endOffset, anchorTime)),
  };
}

export function buildShiftIntervalFromOffsets(
  shiftDateIso: string,
  startOffset: number,
  endOffset: number,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startsAt: Date; endsAt: Date } {
  const startsAt = offsetToDateTime(shiftDateIso, startOffset, anchorTime);
  const endsAt = offsetToDateTime(shiftDateIso, endOffset, anchorTime);
  if (endsAt <= startsAt) {
    throw new Error("Окончание смены должно быть позже начала");
  }
  return { startsAt, endsAt };
}

/** Парсит HH:mm в операционные offset'ы относительно колонки графика (сутки anchor→anchor). */
export function hmPairToOffsets(
  shiftDateIso: string,
  startTime: string,
  endTime: string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startOffset: number; endOffset: number } {
  if (!startTime || !endTime) {
    return { startOffset: 0, endOffset: TIMELINE_SNAP_MINUTES };
  }

  const offsets = presetToOffsets(startTime, endTime, anchorTime);
  const interval = tryBuildShiftIntervalFromOffsets(shiftDateIso, offsets.startOffset, offsets.endOffset, anchorTime);
  if (interval) return offsets;

  return normalizePresetOffsets(offsets.startOffset, offsets.endOffset);
}

/** Безопасная версия buildShiftIntervalFromOffsets — не бросает в UI. */
export function tryBuildShiftIntervalFromOffsets(
  shiftDateIso: string,
  startOffset: number,
  endOffset: number,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startsAt: Date; endsAt: Date } | null {
  try {
    return buildShiftIntervalFromOffsets(shiftDateIso, startOffset, endOffset, anchorTime);
  } catch {
    return null;
  }
}

/** Безопасная версия buildShiftIntervalFromHm — не бросает в UI. */
export function tryBuildShiftIntervalFromHm(
  shiftDateIso: string,
  startTime: string,
  endTime: string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startsAt: Date; endsAt: Date } | null {
  if (!startTime || !endTime) return null;
  const { startOffset, endOffset } = presetToOffsets(startTime, endTime, anchorTime);
  return tryBuildShiftIntervalFromOffsets(shiftDateIso, startOffset, endOffset, anchorTime);
}

/** Единый парсер интервала смены для UI, server actions и проверок конфликтов. */
export function buildShiftIntervalFromHm(
  shiftDateIso: string,
  startTime: string,
  endTime: string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startsAt: Date; endsAt: Date } {
  const interval = tryBuildShiftIntervalFromHm(shiftDateIso, startTime, endTime, anchorTime);
  if (interval) return interval;
  throw new Error("Окончание смены должно быть позже начала");
}

export function presetToOffsets(
  startTime: string,
  endTime: string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): { startOffset: number; endOffset: number } {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  if (!Number.isFinite(sh) || !Number.isFinite(sm) || !Number.isFinite(eh) || !Number.isFinite(em)) {
    return { startOffset: 0, endOffset: TIMELINE_SNAP_MINUTES };
  }
  const startAbs = sh * 60 + sm;
  const endAbs = eh * 60 + em;
  const anchor = parseAnchorMinutes(anchorTime);

  if (endTime === startTime) {
    return { startOffset: 0, endOffset: OPERATIONAL_CYCLE_MINUTES };
  }

  const tail = tailPresetBeforeAnchor(anchorTime);
  if (startTime === tail.startTime && endTime === tail.endTime) {
    return { startOffset: 23 * 60, endOffset: OPERATIONAL_CYCLE_MINUTES };
  }

  let startOffset = startAbs - anchor;
  if (startOffset < 0) startOffset += 24 * 60;

  let endOffset = endAbs - anchor;
  if (endOffset <= 0) endOffset += 24 * 60;
  if (endAbs < startAbs) {
    endOffset = 24 * 60 + (endAbs - anchor);
  }

  return normalizePresetOffsets(
    snapOffset(startOffset),
    snapOffset(Math.min(OPERATIONAL_CYCLE_MINUTES, endOffset)),
  );
}

/** Гарантирует endOffset > startOffset в пределах операционного цикла. */
export function normalizePresetOffsets(
  startOffset: number,
  endOffset: number,
): { startOffset: number; endOffset: number } {
  let start = snapOffset(Math.max(0, Math.min(OPERATIONAL_CYCLE_MINUTES, startOffset)));
  let end = snapOffset(Math.max(0, Math.min(OPERATIONAL_CYCLE_MINUTES, endOffset)));
  if (end <= start) {
    end = Math.min(OPERATIONAL_CYCLE_MINUTES, start + TIMELINE_SNAP_MINUTES);
  }
  if (end <= start) {
    start = Math.max(0, end - TIMELINE_SNAP_MINUTES);
  }
  return { startOffset: start, endOffset: end };
}

export type OperationalTimelineSegment = {
  startOffset: number;
  endOffset: number;
};

export function clipIntervalToOperationalCycle(
  shiftDateIso: string,
  startsAt: Date,
  endsAt: Date,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): OperationalTimelineSegment | null {
  const opStart = operationalDayStart(shiftDateIso, anchorTime);
  const opEnd = operationalDayEnd(shiftDateIso, anchorTime);
  const segStart = startsAt < opStart ? opStart : startsAt;
  const segEnd = endsAt > opEnd ? opEnd : endsAt;
  if (segEnd <= segStart) return null;

  return {
    startOffset: Math.round((segStart.getTime() - opStart.getTime()) / 60_000),
    endOffset: Math.round((segEnd.getTime() - opStart.getTime()) / 60_000),
  };
}

export function formatOffsetHm(
  offsetMin: number,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): string {
  const date = offsetToDateTime("2000-01-01", offsetMin, anchorTime);
  return dateTimeToHmKhabarovsk(date);
}

export function formatOffsetLabel(
  offsetMin: number,
  _shiftDateIso: string,
  anchorTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
): string {
  const hm = formatOffsetHm(offsetMin, anchorTime);
  const anchorMin = parseAnchorMinutes(anchorTime);
  const midnightOffset = (24 * 60 - anchorMin) % (24 * 60);
  if (offsetMin >= midnightOffset && offsetMin < OPERATIONAL_CYCLE_MINUTES) {
    return `${hm} +1`;
  }
  return hm;
}

export function durationMinutesFromOffsets(startOffset: number, endOffset: number): number {
  return Math.max(0, endOffset - startOffset);
}

export function durationHoursLabel(minutes: number): string {
  const hours = Math.round((minutes / 60) * 10) / 10;
  if (!Number.isFinite(hours) || hours <= 0) return "0 ч";
  if (Number.isInteger(hours)) return `${hours} ч`;
  return `${String(hours).replace(".", ",")} ч`;
}
