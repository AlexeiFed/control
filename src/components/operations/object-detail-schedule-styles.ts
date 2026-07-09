import type { CSSProperties } from "react";
import { designTokens } from "../../lib/design-tokens";

export type DayColumnMeta = {
  dateIso: string;
  isWeekend: boolean;
  isHoliday: boolean;
  isToday: boolean;
};

export type ScheduleGridHover = { guardId: string; day: number };

export function normalizeHolidayDateKey(value: string): string {
  return value.trim().slice(0, 10);
}

/** Подсветка выходных, праздников и «сегодня» — как на /scheduler. */
export function buildScheduleDayColumnStyle(
  meta: Pick<DayColumnMeta, "isWeekend" | "isHoliday" | "isToday">,
  options?: { isDragTarget?: boolean },
): CSSProperties {
  const style: CSSProperties = {};
  if (meta.isHoliday) {
    style.backgroundImage = `linear-gradient(135deg, ${designTokens.color.shift.holidayFrom}10, ${designTokens.color.shift.holidayTo}08)`;
  } else if (meta.isWeekend) {
    style.backgroundColor = `${designTokens.color.accent.warning}08`;
  }
  if (meta.isToday) {
    style.boxShadow = `inset 2px 0 0 0 ${designTokens.color.accent.primary}33, inset -2px 0 0 0 ${designTokens.color.accent.primary}33`;
  }
  if (options?.isDragTarget) {
    style.boxShadow = `inset 0 0 0 2px ${designTokens.color.accent.primary}`;
    style.backgroundColor = `${designTokens.color.accent.primary}10`;
  }
  return style;
}

export function scheduleGridCellHoverStyle(
  hover: ScheduleGridHover | null,
  guardId: string,
  day: number,
): CSSProperties | undefined {
  if (!hover) return undefined;
  const row = hover.guardId === guardId;
  const col = hover.day === day;
  if (row && col) {
    return { backgroundColor: `${designTokens.color.accent.primary}18` };
  }
  if (row) {
    return { backgroundColor: `${designTokens.color.accent.primary}12` };
  }
  if (col) {
    return { backgroundColor: designTokens.color.shift.regularCellBg };
  }
  return undefined;
}

export function scheduleGridColumnHoverStyle(
  hover: ScheduleGridHover | null,
  day: number,
): CSSProperties | undefined {
  if (!hover || hover.day !== day) return undefined;
  return { backgroundColor: designTokens.color.shift.regularCellBg };
}

export function scheduleGridRowHoverStyle(
  hover: ScheduleGridHover | null,
  guardId: string,
): CSSProperties | undefined {
  if (!hover || hover.guardId !== guardId) return undefined;
  return { backgroundColor: `${designTokens.color.accent.primary}12` };
}

export function mergeScheduleCellStyles(...styles: Array<CSSProperties | undefined>): CSSProperties {
  return Object.assign({}, ...styles.filter(Boolean));
}
