import { createHash } from "node:crypto";
import type { ScheduleObjectShortage } from "./schedule-shortage";

export type ShortageDismissPlanSnapshot = {
  regular: number;
  shiftHours: number;
  reinforcement: number;
  reinforcementShiftHours: number;
  rapidResponse: number;
  rapidResponseShiftHours: number;
  shiftLead: number;
  shiftLeadShiftHours: number;
};

export type ShortageDismissShiftInput = {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  shiftKind: string;
  postId: string | null;
  incidentRecordedAtIso: string | null;
  replacedByShiftId: string | null;
};

export function shortageDismissKey(objectId: string, dateIso: string): string {
  return `${objectId}|${dateIso}`;
}

export function buildShortageDayFingerprint(input: {
  shifts: ReadonlyArray<ShortageDismissShiftInput>;
  plan: ShortageDismissPlanSnapshot;
  pendingIncident: boolean;
}): string {
  const shiftLines = [...input.shifts]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (s) =>
        [
          s.id,
          s.startsAtIso,
          s.endsAtIso,
          s.shiftKind,
          s.postId ?? "",
          s.incidentRecordedAtIso ?? "",
          s.replacedByShiftId ?? "",
        ].join("|"),
    )
    .join("\n");

  const { plan } = input;
  const planLine = [
    plan.regular,
    plan.shiftHours,
    plan.reinforcement,
    plan.reinforcementShiftHours,
    plan.rapidResponse,
    plan.rapidResponseShiftHours,
    plan.shiftLead,
    plan.shiftLeadShiftHours,
  ].join("|");

  const canonical = `${shiftLines}\nPLAN:${planLine}\npendingIncident=${input.pendingIncident ? "1" : "0"}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function isShortageDismissValid(
  storedFingerprint: string,
  currentFingerprint: string,
): boolean {
  return storedFingerprint === currentFingerprint;
}

export function filterShortagesByDismissals(
  shortages: ReadonlyArray<ScheduleObjectShortage>,
  validDismissKeys: ReadonlySet<string>,
): ScheduleObjectShortage[] {
  const out: ScheduleObjectShortage[] = [];
  for (const obj of shortages) {
    const days = obj.days.filter(
      (d) => !validDismissKeys.has(shortageDismissKey(obj.objectId, d.dateIso)),
    );
    if (days.length === 0) continue;
    out.push({
      ...obj,
      days,
      totalHoursShort: days.reduce((s, d) => s + d.hoursShort, 0),
      totalReinforcementShort: days.reduce((s, d) => s + d.reinforcementShort, 0),
      totalRapidResponseShort: days.reduce((s, d) => s + d.rapidResponseShort, 0),
      totalShiftLeadShort: days.reduce((s, d) => s + d.shiftLeadShort, 0),
    });
  }
  return out;
}

/** Хелпер для UI: Set dateIso с валидным dismiss для одного объекта. */
export function validDismissedDateIsosForObject(
  objectId: string,
  stored: ReadonlyMap<string, string>, // key = shortageDismissKey → fingerprint
  currentByDateIso: ReadonlyMap<string, string>, // dateIso → current fingerprint
): Set<string> {
  const result = new Set<string>();
  for (const [dateIso, currentFp] of currentByDateIso) {
    const key = shortageDismissKey(objectId, dateIso);
    const storedFp = stored.get(key);
    if (storedFp && isShortageDismissValid(storedFp, currentFp)) {
      result.add(dateIso);
    }
  }
  return result;
}
