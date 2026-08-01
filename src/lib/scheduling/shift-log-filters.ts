import type { ShiftLog } from "./types";
import { toDateIsoKhabarovsk } from "../format/display-date";

export type ShiftLogFilterInput = {
  objectName?: string;
  guardQuery?: string;
  level?: ShiftLog["incidentLevel"] | "";
  textQuery?: string;
  /** `YYYY-MM` — фильтр по календарному месяцу даты смены (Хабаровск). */
  monthKey?: string;
};

/** Месяц по дате смены; если смены нет — по дате записи. */
export function shiftLogMonthKey(log: ShiftLog): string | null {
  const at = log.shiftStartsAt ?? log.createdAt;
  if (!at) return null;
  const iso = toDateIsoKhabarovsk(at instanceof Date ? at : new Date(at));
  return iso.slice(0, 7);
}

export function filterShiftLogs(logs: ReadonlyArray<ShiftLog>, filters: ShiftLogFilterInput): ShiftLog[] {
  const objectName = filters.objectName?.trim().toLowerCase() ?? "";
  const guardQuery = filters.guardQuery?.trim().toLowerCase() ?? "";
  const textQuery = filters.textQuery?.trim().toLowerCase() ?? "";
  const level = filters.level ?? "";
  const monthKey = filters.monthKey?.trim() ?? "";

  return logs.filter((log) => {
    if (level && log.incidentLevel !== level) return false;
    if (monthKey) {
      const key = shiftLogMonthKey(log);
      if (key !== monthKey) return false;
    }
    // Поиск по ФИО — по всем объектам (фильтр объекта не режет).
    if (guardQuery) {
      if (!(log.guardName ?? "").toLowerCase().includes(guardQuery)) return false;
    } else if (objectName && (log.objectName ?? "").toLowerCase() !== objectName) {
      return false;
    }
    if (textQuery && !log.note.toLowerCase().includes(textQuery)) return false;
    return true;
  });
}
