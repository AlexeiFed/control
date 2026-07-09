import { resolveIntlTimeZone } from "./intl-timezone";

export type HourBreakdown = {
  totalMinutes: number;
  nightMinutes: number;
  holidayMinutes: number;
  totalHours: number;
  nightHours: number;
  holidayHours: number;
};

type CalculateHoursInput = {
  startsAt: Date;
  endsAt: Date;
  holidayDates?: ReadonlySet<string>;
  timeZone?: string;
};

export function calculateShiftHours({
  startsAt,
  endsAt,
  holidayDates = new Set<string>(),
  timeZone = "Asia/Khabarovsk",
}: CalculateHoursInput): HourBreakdown {
  if (endsAt <= startsAt) {
    throw new Error("Shift end must be after shift start");
  }

  let totalMinutes = 0;
  let nightMinutes = 0;
  let holidayMinutes = 0;

  for (let cursor = new Date(startsAt); cursor < endsAt; cursor = addMinutes(cursor, 1)) {
    totalMinutes += 1;

    if (isNightMinute(cursor, timeZone)) {
      nightMinutes += 1;
    }

    if (holidayDates.has(toLocalDateKey(cursor, timeZone))) {
      holidayMinutes += 1;
    }
  }

  return {
    totalMinutes,
    nightMinutes,
    holidayMinutes,
    totalHours: roundHours(totalMinutes),
    nightHours: roundHours(nightMinutes),
    holidayHours: roundHours(holidayMinutes),
  };
}

function isNightMinute(date: Date, timeZone: string): boolean {
  const hour = getDateParts(date, timeZone).hour;
  return hour < 8 || hour >= 20;
}

function toLocalDateKey(date: Date, timeZone: string): string {
  const { year, month, day } = getDateParts(date, timeZone);
  return `${year}-${month}-${day}`;
}

function getDateParts(date: Date, timeZone: string): {
  year: string;
  month: string;
  day: string;
  hour: number;
} {
  const tz = resolveIntlTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  return {
    year: getPart(parts, "year"),
    month: getPart(parts, "month"),
    day: getPart(parts, "day"),
    hour: Number(getPart(parts, "hour")),
  };
}

function getPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const part = parts.find((item) => item.type === type)?.value;
  if (!part) throw new Error(`Missing ${type} date part`);
  return part;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

function roundHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
