import type { ExpectedShifts } from "./object-shift-templates";
import { computeDayPlanMetrics, dayPlanHasHoursShortage } from "./schedule-shortage";
import type { Shift } from "./types";

/**
 * План операционных суток закрыт (нет недобора осн/ус/мп/СтМ) —
 * покрытие есть, даже если у инцидента не проставлен `replaced_by_shift_id`.
 * Без настроенного плана — false (баннер не гасим «вслепую»).
 */
export function isOperationalDayPlanSatisfied(
  dayShifts: ReadonlyArray<Shift>,
  norms: ExpectedShifts | undefined,
): boolean {
  const metrics = computeDayPlanMetrics(dayShifts, norms);
  if (!metrics) return false;
  return !dayPlanHasHoursShortage(metrics);
}
