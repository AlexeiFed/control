import { shiftBelongsToOperationalDayColumn } from "./operational-day-timeline";
import type { ExpectedShifts } from "./object-shift-templates";
import { buildOperationalDayAnchorByObjectId, type ScheduleObjectRef } from "./schedule-shortage";
import {
  buildShortageDayFingerprint,
  isShortageDismissValid,
  shortageDismissKey,
  type ShortageDismissPlanSnapshot,
  type ShortageDismissShiftInput,
} from "./schedule-shortage-dismiss";
import type { Shift } from "./types";

/**
 * Суммирует планы нескольких постов объекта на день в один снимок для фингерпринта.
 * Часы смен берутся из первого непустого плана (посты одного объекта используют
 * одинаковую сетку часов на практике); counts суммируются по всем постам.
 */
export function aggregatePlanSnapshot(
  plans: ReadonlyArray<ExpectedShifts | undefined>,
): ShortageDismissPlanSnapshot {
  const acc: ShortageDismissPlanSnapshot = {
    regular: 0,
    shiftHours: 24,
    reinforcement: 0,
    reinforcementShiftHours: 24,
    rapidResponse: 0,
    rapidResponseShiftHours: 24,
    shiftLead: 0,
    shiftLeadShiftHours: 24,
  };
  let gotHours = false;
  for (const p of plans) {
    if (!p) continue;
    acc.regular += p.regular;
    acc.reinforcement += p.reinforcement;
    acc.rapidResponse += p.rapidResponse;
    acc.shiftLead += p.shiftLead;
    if (!gotHours) {
      acc.shiftHours = p.shiftHours;
      acc.reinforcementShiftHours = p.reinforcementShiftHours;
      acc.rapidResponseShiftHours = p.rapidResponseShiftHours;
      acc.shiftLeadShiftHours = p.shiftLeadShiftHours;
      gotHours = true;
    }
  }
  return acc;
}

export function shiftToDismissInput(s: Shift): ShortageDismissShiftInput {
  return {
    id: s.id,
    startsAtIso: s.startsAt.toISOString(),
    endsAtIso: s.endsAt.toISOString(),
    shiftKind: s.shiftKind,
    postId: s.postId ?? null,
    incidentRecordedAtIso: s.incidentRecordedAt?.toISOString() ?? null,
    replacedByShiftId: s.replacedByShiftId,
  };
}

export type BuildValidShortageDismissKeySetArgs = {
  objects: ReadonlyArray<ScheduleObjectRef>;
  shifts: ReadonlyArray<Shift>;
  /** Совпадает по форме с `computeScheduleShortages`: objectId -> dateIso -> план дня. */
  expectedByObjectDay: Record<string, Record<string, ExpectedShifts>>;
  weekDayIsos: ReadonlyArray<string>;
  /** key = shortageDismissKey(objectId, dateIso) -> сохранённый фингерпринт. */
  storedDismissals: ReadonlyMap<string, string>;
  /**
   * Необязательный override: key = shortageDismissKey(objectId, dateIso) -> есть незаменённый инцидент.
   * Если не передан, вычисляется из тех же shifts (incidentRecordedAt задан и replacedByShiftId пуст).
   */
  pendingIncidentKeys?: ReadonlySet<string>;
};

/**
 * Для каждого сохранённого dismiss пересчитывает текущий фингерпринт дня объекта
 * (смены операционных суток + план + флаг незаменённого инцидента) и возвращает
 * множество ключей `shortageDismissKey`, чьи dismiss всё ещё валидны (недобор не менялся).
 */
export function buildValidShortageDismissKeySet(
  args: BuildValidShortageDismissKeySetArgs,
): Set<string> {
  const anchorByObjectId = buildOperationalDayAnchorByObjectId(args.objects);
  const result = new Set<string>();

  for (const object of args.objects) {
    const objectNorms = args.expectedByObjectDay[object.id] ?? {};

    for (const dateIso of args.weekDayIsos) {
      const key = shortageDismissKey(object.id, dateIso);
      const storedFingerprint = args.storedDismissals.get(key);
      if (!storedFingerprint) continue;

      const dayShifts = args.shifts.filter(
        (s) =>
          s.objectId === object.id &&
          shiftBelongsToOperationalDayColumn(s, dateIso, anchorByObjectId),
      );

      const pendingIncident = args.pendingIncidentKeys
        ? args.pendingIncidentKeys.has(key)
        : dayShifts.some((s) => s.incidentRecordedAt != null && s.replacedByShiftId == null);

      const currentFingerprint = buildShortageDayFingerprint({
        shifts: dayShifts.map(shiftToDismissInput),
        plan: aggregatePlanSnapshot([objectNorms[dateIso]]),
        pendingIncident,
      });

      if (isShortageDismissValid(storedFingerprint, currentFingerprint)) {
        result.add(key);
      }
    }
  }

  return result;
}
