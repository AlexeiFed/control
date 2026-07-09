import type { ShiftLog } from "./types";

export type ShiftLogFilterInput = {
  objectName?: string;
  guardQuery?: string;
  level?: ShiftLog["incidentLevel"] | "";
  textQuery?: string;
};

export function filterShiftLogs(logs: ReadonlyArray<ShiftLog>, filters: ShiftLogFilterInput): ShiftLog[] {
  const objectName = filters.objectName?.trim().toLowerCase() ?? "";
  const guardQuery = filters.guardQuery?.trim().toLowerCase() ?? "";
  const textQuery = filters.textQuery?.trim().toLowerCase() ?? "";
  const level = filters.level ?? "";

  return logs.filter((log) => {
    if (objectName && (log.objectName ?? "").toLowerCase() !== objectName) return false;
    if (level && log.incidentLevel !== level) return false;
    if (guardQuery && !(log.guardName ?? "").toLowerCase().includes(guardQuery)) return false;
    if (textQuery && !log.note.toLowerCase().includes(textQuery)) return false;
    return true;
  });
}
