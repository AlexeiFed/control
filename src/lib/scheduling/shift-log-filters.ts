import type { ShiftLog } from "./types";
import { toDateIsoKhabarovsk } from "../format/display-date";

export type ShiftLogFilterInput = {
  /** Пустой массив / undefined — все объекты. */
  objectNames?: ReadonlyArray<string>;
  guardQuery?: string;
  level?: ShiftLog["incidentLevel"] | "";
  textQuery?: string;
  /** `YYYY-MM` — пустой массив / undefined = все месяцы. */
  monthKeys?: ReadonlyArray<string>;
};

/** Месяц по дате смены; если смены нет — по дате записи. */
export function shiftLogMonthKey(log: ShiftLog): string | null {
  const at = log.shiftStartsAt ?? log.createdAt;
  if (!at) return null;
  const iso = toDateIsoKhabarovsk(at instanceof Date ? at : new Date(at));
  return iso.slice(0, 7);
}

export function filterShiftLogs(logs: ReadonlyArray<ShiftLog>, filters: ShiftLogFilterInput): ShiftLog[] {
  const objectNames = (filters.objectNames ?? [])
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean);
  const objectNameSet = objectNames.length > 0 ? new Set(objectNames) : null;
  const guardQuery = filters.guardQuery?.trim().toLowerCase() ?? "";
  const textQuery = filters.textQuery?.trim().toLowerCase() ?? "";
  const level = filters.level ?? "";
  const monthKeys = (filters.monthKeys ?? []).map((key) => key.trim()).filter(Boolean);
  const monthKeySet = monthKeys.length > 0 ? new Set(monthKeys) : null;

  return logs.filter((log) => {
    if (level && log.incidentLevel !== level) return false;
    if (monthKeySet) {
      const key = shiftLogMonthKey(log);
      if (!key || !monthKeySet.has(key)) return false;
    }
    // Поиск по ФИО — по всем объектам (фильтр объекта не режет).
    if (guardQuery) {
      if (!(log.guardName ?? "").toLowerCase().includes(guardQuery)) return false;
    } else if (objectNameSet && !objectNameSet.has((log.objectName ?? "").toLowerCase())) {
      return false;
    }
    if (textQuery && !log.note.toLowerCase().includes(textQuery)) return false;
    return true;
  });
}
