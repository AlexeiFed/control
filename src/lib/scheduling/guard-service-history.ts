import { incidentCategoryLabels } from "../operations/status-labels";
import type { IncidentCategory } from "./types";

/**
 * Авто-запись журнала, создаваемая вместе с фиксацией инцидента
 * (`recordShiftIncident` → shift_logs Warning с текстом «Категория: комментарий»).
 * В карточке «История» её не показываем рядом с карточкой происшествия.
 */
export function isIncidentCompanionShiftLog(input: {
  shiftId: string;
  note: string;
  incidentsByShiftId: ReadonlyMap<string, { category: IncidentCategory }>;
}): boolean {
  const incident = input.incidentsByShiftId.get(input.shiftId);
  if (!incident) return false;
  const prefix = incidentCategoryLabels[incident.category];
  const note = input.note.trim();
  return note === prefix || note.startsWith(`${prefix}:`);
}
