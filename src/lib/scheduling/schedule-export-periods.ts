import { addDaysToIsoDate, getDaysInMonth } from "../format/display-date";

export type ScheduleExportPeriod = {
  id: string;
  startYear: number;
  startMonth0: number;
  startDay: number;
  endYear: number;
  endMonth0: number;
  endDay: number;
};

const MONTH_NAMES_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
] as const;

function monthShortRu(monthIndex0: number): string {
  return MONTH_NAMES_GENITIVE[monthIndex0]?.slice(0, 3) ?? "";
}

function toPeriodIso(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parsePeriodIso(iso: string): { year: number; month0: number; day: number } {
  const [yearStr, monthStr, dayStr] = iso.split("-");
  return {
    year: Number(yearStr),
    month0: Number(monthStr) - 1,
    day: Number(dayStr),
  };
}

function mondayOfWeekContainingIso(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00+10:00`);
  const d10 = new Date(date.getTime() + 10 * 3_600_000);
  const dayOfWeek = d10.getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  return addDaysToIsoDate(dateIso, mondayOffset);
}

const WEEKDAY_SHORT_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;

export function weekdayShortRuForDateIso(dateIso: string): string {
  const date = new Date(`${dateIso}T12:00:00+10:00`);
  const d10 = new Date(date.getTime() + 10 * 3_600_000);
  return WEEKDAY_SHORT_RU[d10.getUTCDay()] ?? "";
}

export function monthNameGenitiveRu(monthIndex0: number): string {
  return MONTH_NAMES_GENITIVE[monthIndex0] ?? "";
}

/** Календарные недели пн–вс, пересекающиеся с просматриваемым месяцем. */
export function buildDefaultMonthExportPeriods(year: number, monthIndex0: number): ScheduleExportPeriod[] {
  const monthStartIso = toPeriodIso(year, monthIndex0, 1);
  const daysInMonth = getDaysInMonth(year, monthIndex0);
  const monthEndIso = toPeriodIso(year, monthIndex0, daysInMonth);

  const periods: ScheduleExportPeriod[] = [];
  let weekStartIso = mondayOfWeekContainingIso(monthStartIso);

  while (weekStartIso <= monthEndIso) {
    const weekEndIso = addDaysToIsoDate(weekStartIso, 6);
    if (weekEndIso >= monthStartIso && weekStartIso <= monthEndIso) {
      const start = parsePeriodIso(weekStartIso);
      const end = parsePeriodIso(weekEndIso);
      periods.push({
        id: `${weekStartIso}_${weekEndIso}`,
        startYear: start.year,
        startMonth0: start.month0,
        startDay: start.day,
        endYear: end.year,
        endMonth0: end.month0,
        endDay: end.day,
      });
    }
    weekStartIso = addDaysToIsoDate(weekStartIso, 7);
  }

  return periods;
}

export function formatExportPeriodLabel(
  period: ScheduleExportPeriod,
  viewYear: number,
  viewMonthIndex0: number,
): string {
  const sameMonth =
    period.startYear === period.endYear &&
    period.startMonth0 === period.endMonth0;
  const inViewMonth =
    period.startYear === viewYear &&
    period.startMonth0 === viewMonthIndex0 &&
    period.endYear === viewYear &&
    period.endMonth0 === viewMonthIndex0;

  if (inViewMonth) {
    return `${period.startDay}–${period.endDay}`;
  }

  if (sameMonth) {
    return `${period.startDay}–${period.endDay} ${monthShortRu(period.startMonth0)}`;
  }

  const startInView =
    period.startYear === viewYear && period.startMonth0 === viewMonthIndex0;
  const endInView = period.endYear === viewYear && period.endMonth0 === viewMonthIndex0;

  if (startInView && !endInView) {
    return `${period.startDay} – ${period.endDay} ${monthShortRu(period.endMonth0)}`;
  }
  if (!startInView && endInView) {
    return `${period.startDay} ${monthShortRu(period.startMonth0)} – ${period.endDay}`;
  }

  return `${period.startDay} ${monthShortRu(period.startMonth0)} – ${period.endDay} ${monthShortRu(period.endMonth0)}`;
}

export type ScheduleExportDayColumn = {
  day: number;
  monthIndex0: number;
  year: number;
  dateIso: string;
  header: string;
};

export function expandExportPeriodToDayColumns(
  period: ScheduleExportPeriod,
  viewYear: number,
  viewMonthIndex0: number,
): ScheduleExportDayColumn[] {
  const columns: ScheduleExportDayColumn[] = [];
  let cursor = toPeriodIso(period.startYear, period.startMonth0, period.startDay);
  const endIso = toPeriodIso(period.endYear, period.endMonth0, period.endDay);

  while (cursor <= endIso) {
    const parts = parsePeriodIso(cursor);
    const outsideViewMonth = parts.year !== viewYear || parts.month0 !== viewMonthIndex0;
    const dayLabel = outsideViewMonth ? `${parts.day}*` : String(parts.day);
    const weekday = weekdayShortRuForDateIso(cursor);
    columns.push({
      day: parts.day,
      monthIndex0: parts.month0,
      year: parts.year,
      dateIso: cursor,
      header: `${dayLabel}\n${weekday}`,
    });
    cursor = addDaysToIsoDate(cursor, 1);
  }

  return columns;
}

export function expandSelectedExportPeriods(
  periods: ScheduleExportPeriod[],
  year: number,
  monthIndex0: number,
): ScheduleExportDayColumn[] {
  const seen = new Set<string>();
  const columns: ScheduleExportDayColumn[] = [];
  for (const period of periods) {
    for (const col of expandExportPeriodToDayColumns(period, year, monthIndex0)) {
      if (seen.has(col.dateIso)) continue;
      seen.add(col.dateIso);
      columns.push(col);
    }
  }
  columns.sort((a, b) => a.dateIso.localeCompare(b.dateIso));
  return columns;
}

export function buildExportTitle(
  objectName: string,
  year: number,
  monthIndex0: number,
  periods: ScheduleExportPeriod[],
): string {
  const monthName = monthNameGenitiveRu(monthIndex0);
  const periodLabels = periods.map((p) => formatExportPeriodLabel(p, year, monthIndex0)).join(", ");
  return `График смен «${objectName}»\nна период ${periodLabels} ${monthName} ${year} г.`;
}

export function createCustomExportPeriodFromIso(startIso: string, endIso: string): ScheduleExportPeriod {
  const start = parsePeriodIso(startIso);
  const end = parsePeriodIso(endIso);
  return {
    id: `custom-${startIso}_${endIso}`,
    startYear: start.year,
    startMonth0: start.month0,
    startDay: start.day,
    endYear: end.year,
    endMonth0: end.month0,
    endDay: end.day,
  };
}

export function createCustomExportPeriod(
  startDay: number,
  endDay: number,
  spansNextMonth: boolean,
  year: number,
  monthIndex0: number,
): ScheduleExportPeriod {
  if (!spansNextMonth) {
    const iso = toPeriodIso(year, monthIndex0, startDay);
    const endIso = toPeriodIso(year, monthIndex0, endDay);
    return {
      id: `custom-${iso}_${endIso}`,
      startYear: year,
      startMonth0: monthIndex0,
      startDay,
      endYear: year,
      endMonth0: monthIndex0,
      endDay,
    };
  }

  const nextMonth0 = monthIndex0 === 11 ? 0 : monthIndex0 + 1;
  const nextYear = monthIndex0 === 11 ? year + 1 : year;
  const startIso = toPeriodIso(year, monthIndex0, startDay);
  const endIso = toPeriodIso(nextYear, nextMonth0, endDay);
  return {
    id: `custom-${startIso}_${endIso}`,
    startYear: year,
    startMonth0: monthIndex0,
    startDay,
    endYear: nextYear,
    endMonth0: nextMonth0,
    endDay,
  };
}

export function periodTouchesOutsideMonth(
  period: ScheduleExportPeriod,
  year: number,
  monthIndex0: number,
): boolean {
  const monthStartIso = toPeriodIso(year, monthIndex0, 1);
  const monthEndIso = toPeriodIso(year, monthIndex0, getDaysInMonth(year, monthIndex0));
  const startIso = toPeriodIso(period.startYear, period.startMonth0, period.startDay);
  const endIso = toPeriodIso(period.endYear, period.endMonth0, period.endDay);
  return startIso < monthStartIso || endIso > monthEndIso;
}
