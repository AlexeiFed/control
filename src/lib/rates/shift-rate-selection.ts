import type { GuardSchedulePickerRow } from "../operations/guards-repository";
import type { ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";
import { mapGuardLicenseForRates } from "../scheduling/guard-profile";
import type { Guard, RateUnit, Shift, ShiftKind } from "../scheduling/types";
import { computeShiftRateBreakdown } from "./rate-calculator";
import { DEFAULT_SHIFT_TIMEZONE } from "../scheduling/local-date-key";
import { buildShiftIntervalFromHm, tryBuildShiftIntervalFromHm } from "../scheduling/operational-day-timeline";
import { buildSegmentContext, findBestMatchingRule, monday1Sunday7InZone } from "./rate-matching";

export type RateRuleTimePreset = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  ruleIds: string[];
};

function dateInRuleRange(localDateKey: string, rule: ObjectRateRuleRecord): boolean {
  if (localDateKey < rule.effectiveFrom) return false;
  if (rule.effectiveTo && localDateKey > rule.effectiveTo) return false;
  return true;
}

function dayOfWeekMon1FromCivilIso(civilDateIso: string, timeZone = DEFAULT_SHIFT_TIMEZONE): number {
  return monday1Sunday7InZone(new Date(`${civilDateIso}T12:00:00+10:00`), timeZone);
}

function normalizeHm(value: string): string {
  const m = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return value;
  return `${String(Number(m[1])).padStart(2, "0")}:${m[2]}`;
}

function formatHmShort(hm: string): string {
  const [h, m] = normalizeHm(hm).split(":");
  if (m === "00") return String(Number(h));
  return `${Number(h)}:${m}`;
}

export function formatRateRuleIntervalLabel(startsAt: string, endsAt: string): string {
  if (normalizeHm(startsAt) === normalizeHm(endsAt)) {
    return `Сутки ${formatHmShort(startsAt)}–${formatHmShort(endsAt)}`;
  }
  return `${formatHmShort(startsAt)}–${formatHmShort(endsAt)}`;
}

/** Интервал для плашки времени: 08:00 без конца → сутки 08–08. */
export function ruleTimeIntervalForPreset(rule: ObjectRateRuleRecord): {
  startTime: string;
  endTime: string;
} | null {
  const start = rule.startsAt ? normalizeHm(rule.startsAt) : null;
  const end = rule.endsAt ? normalizeHm(rule.endsAt) : null;
  if (start && end) return { startTime: start, endTime: end };
  if (start) return { startTime: start, endTime: start };
  if (end) return { startTime: end, endTime: end };
  return null;
}

/** Профиль охранника + день + тип смены (без проверки интервала времени). */
export function guardMatchesRateRuleProfile(
  rule: ObjectRateRuleRecord,
  guard: Guard,
  shiftKind: ShiftKind,
  shiftDateIso: string,
  holidayDates: ReadonlySet<string>,
  timeZone = DEFAULT_SHIFT_TIMEZONE,
  options?: { ignoreDaysOfWeek?: boolean },
): boolean {
  if (!dateInRuleRange(shiftDateIso, rule)) return false;

  if (!options?.ignoreDaysOfWeek) {
    const dayOfWeek = dayOfWeekMon1FromCivilIso(shiftDateIso, timeZone);
    if (rule.daysOfWeek != null && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(dayOfWeek)) {
      return false;
    }
  }

  const isHoliday = holidayDates.has(shiftDateIso);
  if (rule.isHoliday === true && !isHoliday) return false;
  if (rule.isHoliday === false && isHoliday) return false;

  if (rule.shiftKind != null && rule.shiftKind !== shiftKind) return false;

  if (rule.position != null && rule.position !== guard.position) return false;

  if (rule.licenseType != null && guard.position !== "ShiftLead") {
    if (mapGuardLicenseForRates(guard) !== rule.licenseType) return false;
  }

  if (rule.employmentType != null && rule.employmentType !== guard.employmentType) return false;

  if (rule.isTrainee === true && !guard.isTrainee) return false;
  if (rule.isTrainee === false && guard.isTrainee) return false;

  return true;
}

export function listRateRulesForGuardProfile(
  rules: readonly ObjectRateRuleRecord[],
  objectId: string,
  guard: Guard,
  shiftKind: ShiftKind,
  shiftDateIso: string,
  holidayDates: ReadonlySet<string>,
  options?: { ignoreDaysOfWeek?: boolean },
): ObjectRateRuleRecord[] {
  return rules
    .filter((rule) => rule.objectId === objectId)
    .filter((rule) =>
      guardMatchesRateRuleProfile(rule, guard, shiftKind, shiftDateIso, holidayDates, DEFAULT_SHIFT_TIMEZONE, options),
    )
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name, "ru-RU"));
}

/** Есть ли на объекте хотя бы одно правило под профиль охранника (любой день недели). */
export function guardHasMatchingRateRulesForProfile(
  rules: readonly ObjectRateRuleRecord[],
  objectId: string,
  guard: Guard,
  shiftKind: ShiftKind,
  shiftDateIso: string,
  holidayDates: ReadonlySet<string>,
): boolean {
  return (
    listRateRulesForGuardProfile(rules, objectId, guard, shiftKind, shiftDateIso, holidayDates, {
      ignoreDaysOfWeek: true,
    }).length > 0
  );
}

const WEEKDAY_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

export function formatRateRuleDaysOfWeekLabel(rule: ObjectRateRuleRecord): string | null {
  if (!rule.daysOfWeek?.length) return null;
  return rule.daysOfWeek.map((d) => WEEKDAY_SHORT[d - 1] ?? `День ${d}`).join(", ");
}

/** Ставки для ручного выбора: сначала под день смены, затем остальные дни недели. */
export function listManualSelectableRateRules(
  rules: readonly ObjectRateRuleRecord[],
  objectId: string,
  guard: Guard,
  shiftKind: ShiftKind,
  shiftDateIso: string,
  holidayDates: ReadonlySet<string>,
): { dayMatched: ObjectRateRuleRecord[]; otherWeekdays: ObjectRateRuleRecord[] } {
  const dayMatched = listRateRulesForGuardProfile(
    rules,
    objectId,
    guard,
    shiftKind,
    shiftDateIso,
    holidayDates,
  );
  const dayMatchedIds = new Set(dayMatched.map((rule) => rule.id));
  const allWeekdays = listRateRulesForGuardProfile(
    rules,
    objectId,
    guard,
    shiftKind,
    shiftDateIso,
    holidayDates,
    { ignoreDaysOfWeek: true },
  );
  const otherWeekdays = allWeekdays.filter((rule) => !dayMatchedIds.has(rule.id));
  return { dayMatched, otherWeekdays };
}

/** Плашки времени из правил ставок объекта для выбранного охранника. */
export function buildRateRuleTimePresets(
  rules: readonly ObjectRateRuleRecord[],
  objectId: string,
  guard: Guard,
  shiftKind: ShiftKind,
  shiftDateIso: string,
  holidayDates: ReadonlySet<string>,
): RateRuleTimePreset[] {
  const profileRules = listRateRulesForGuardProfile(
    rules,
    objectId,
    guard,
    shiftKind,
    shiftDateIso,
    holidayDates,
  );

  const grouped = new Map<string, { startTime: string; endTime: string; ruleIds: string[]; names: string[] }>();
  for (const rule of profileRules) {
    const interval = ruleTimeIntervalForPreset(rule);
    if (!interval) continue;
    const { startTime, endTime } = interval;
    const key = `${startTime}|${endTime}`;
    const bucket = grouped.get(key) ?? { startTime, endTime, ruleIds: [], names: [] };
    bucket.ruleIds.push(rule.id);
    bucket.names.push(rule.name);
    grouped.set(key, bucket);
  }

  return [...grouped.values()]
    .map((item) => {
      const uniqueNames = [...new Set(item.names)];
      const label =
        uniqueNames.length === 1
          ? `${formatRateRuleIntervalLabel(item.startTime, item.endTime)} · ${uniqueNames[0]}`
          : formatRateRuleIntervalLabel(item.startTime, item.endTime);
      return {
        id: `rate-${item.startTime}-${item.endTime}`,
        label,
        startTime: item.startTime,
        endTime: item.endTime,
        ruleIds: item.ruleIds,
      };
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
}

export function shiftDurationMinutesFromTimes(
  shiftDateIso: string,
  startTime: string,
  endTime: string,
  anchorTime?: string,
): number {
  try {
    const { startsAt, endsAt } = buildShiftIntervalFromHm(shiftDateIso, startTime, endTime, anchorTime);
    return Math.max(0, Math.floor((endsAt.getTime() - startsAt.getTime()) / 60_000));
  } catch {
    return 0;
  }
}

function buildProbeShift(params: {
  objectId: string;
  guardId: string;
  shiftKind: ShiftKind;
  startsAt: Date;
  endsAt: Date;
  selectedRateRuleId?: string | null;
}): Shift {
  return {
    id: "probe",
    guardId: params.guardId,
    objectId: params.objectId,
    postId: null,
    startsAt: params.startsAt,
    endsAt: params.endsAt,
    shiftKind: params.shiftKind,
    manualClientRateCents: null,
    manualGuardRateCents: null,
    manualRateUnit: null,
    manualRateReason: "",
    isNoShow: false,
    incidentCategory: null,
    incidentComment: "",
    incidentWorkedUntilAt: null,
    incidentRecordedAt: null,
    replacedByShiftId: null,
    selectedRateRuleId: params.selectedRateRuleId ?? null,
  };
}

function addMinutes(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 60_000);
}

function countUnpricedShiftMinutes(
  shift: Shift,
  guard: Guard,
  rules: readonly ObjectRateRuleRecord[],
  holidayDates: ReadonlySet<string>,
  timeZone = DEFAULT_SHIFT_TIMEZONE,
): number {
  let unpriced = 0;
  let cursor = new Date(shift.startsAt);
  while (cursor < shift.endsAt) {
    const ctx = buildSegmentContext(cursor, guard, shift, holidayDates, timeZone);
    if (!findBestMatchingRule(rules, ctx)) unpriced += 1;
    cursor = addMinutes(cursor, 1);
  }
  return unpriced;
}

/** Нужен ли явный выбор ставки (есть неоплаченные минуты без override). */
export function shiftNeedsManualRateRuleSelection(params: {
  objectId: string;
  guard: Guard;
  shiftKind: ShiftKind;
  shiftDateIso: string;
  startTime: string;
  endTime: string;
  rules: readonly ObjectRateRuleRecord[];
  holidayDates: ReadonlySet<string>;
  manualClientRateCents?: number | null;
  manualGuardRateCents?: number | null;
  operationalDayStartTime?: string;
}): boolean {
  if (params.manualClientRateCents != null || params.manualGuardRateCents != null) return false;
  if (params.rules.length === 0) return false;

  const interval = tryBuildShiftIntervalFromHm(
    params.shiftDateIso,
    params.startTime,
    params.endTime,
    params.operationalDayStartTime,
  );
  if (!interval) return false;

  const { startsAt, endsAt } = interval;

  return (
    countUnpricedShiftMinutes(
      buildProbeShift({
        objectId: params.objectId,
        guardId: params.guard.id,
        shiftKind: params.shiftKind,
        startsAt,
        endsAt,
        selectedRateRuleId: null,
      }),
      params.guard,
      params.rules,
      params.holidayDates,
    ) > 0
  );
}

export function estimateGuardAmountCentsForRule(
  rule: ObjectRateRuleRecord,
  durationMinutes: number,
): number {
  if (durationMinutes <= 0) return 0;
  if (rule.rateUnit === "Hour") return Math.round((rule.guardRateCents * durationMinutes) / 60);
  return rule.guardRateCents;
}

export function formatRublesFromCents(cents: number): string {
  return (cents / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatCentsAsRublesInput(cents: number | null | undefined): string {
  if (cents == null) return "";
  const rubles = cents / 100;
  if (Number.isInteger(rubles)) return String(rubles);
  return rubles.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function estimateCustomGuardAmountCents(
  rublesRaw: string,
  rateUnit: "Hour" | "Shift",
  durationMinutes: number,
): number | null {
  const normalized = rublesRaw.trim().replace(/\s/g, "").replace(",", ".");
  if (!normalized) return null;
  const rubles = Number(normalized);
  if (!Number.isFinite(rubles) || rubles < 0) return null;
  const cents = Math.round(rubles * 100);
  if (rateUnit === "Hour") return Math.round((cents * durationMinutes) / 60);
  return cents;
}

export function findRateRuleById(
  rules: readonly ObjectRateRuleRecord[],
  ruleId: string | null | undefined,
): ObjectRateRuleRecord | null {
  if (!ruleId) return null;
  return rules.find((rule) => rule.id === ruleId) ?? null;
}

export type ShiftRateAssignmentKind = "custom" | "rule" | "auto";

export type ShiftRateAssignmentSummary = {
  kind: ShiftRateAssignmentKind;
  rule: ObjectRateRuleRecord | null;
  manualGuardRateCents: number | null;
  manualClientRateCents: number | null;
  manualRateUnit: RateUnit | null;
  manualRateReason: string;
  guardAmountCents: number;
  clientAmountCents: number;
};

export function describeShiftRateAssignment(
  shift: Shift,
  guard: Guard,
  rules: readonly ObjectRateRuleRecord[],
  holidayDates: ReadonlySet<string>,
): ShiftRateAssignmentSummary {
  const breakdown = computeShiftRateBreakdown(shift, guard, rules, holidayDates);
  const base = {
    manualGuardRateCents: shift.manualGuardRateCents,
    manualClientRateCents: shift.manualClientRateCents,
    manualRateUnit: shift.manualRateUnit,
    manualRateReason: shift.manualRateReason,
    guardAmountCents: breakdown.guardAmountCents,
    clientAmountCents: breakdown.clientAmountCents,
  };

  if (shift.manualGuardRateCents != null || shift.manualClientRateCents != null) {
    return { kind: "custom", rule: null, ...base };
  }

  const rule = findRateRuleById(rules, shift.selectedRateRuleId);
  if (rule) {
    return { kind: "rule", rule, ...base };
  }

  return { kind: "auto", rule: null, ...base };
}

export function formatShiftRateAssignmentSummary(summary: ShiftRateAssignmentSummary): string {
  if (summary.kind === "custom") {
    const parts: string[] = ["Произвольная ставка"];
    if (summary.manualGuardRateCents != null) {
      const unit = summary.manualRateUnit === "Shift" ? "за смену" : "за час";
      parts.push(`${formatRublesFromCents(summary.manualGuardRateCents)} ₽/${unit} (охранник)`);
    }
    if (summary.manualClientRateCents != null) {
      parts.push(`${formatRublesFromCents(summary.manualClientRateCents)} ₽ (клиент)`);
    }
    if (summary.manualRateReason.trim()) {
      parts.push(`причина: ${summary.manualRateReason.trim()}`);
    }
    parts.push(`≈ ${formatRublesFromCents(summary.guardAmountCents)} ₽ за смену`);
    return parts.join(" · ");
  }

  if (summary.kind === "rule" && summary.rule) {
    const unit = summary.rule.rateUnit === "Shift" ? "за смену" : "за час";
    return `Правило «${summary.rule.name}» · ${formatRublesFromCents(summary.rule.guardRateCents)} ₽/${unit} · ≈ ${formatRublesFromCents(summary.guardAmountCents)} ₽ за смену`;
  }

  return `Авто по правилам объекта · ≈ ${formatRublesFromCents(summary.guardAmountCents)} ₽ охраннику`;
}

export function initializeShiftRateFormFromShift(shift: Shift | null | undefined): {
  useCustomRate: boolean;
  selectedRateRuleId: string;
  manualGuardRubles: string;
  manualClientRubles: string;
  manualRateUnit: "Hour" | "Shift";
  manualRateReason: string;
} {
  if (!shift) {
    return {
      useCustomRate: false,
      selectedRateRuleId: "",
      manualGuardRubles: "",
      manualClientRubles: "",
      manualRateUnit: "Hour",
      manualRateReason: "",
    };
  }

  const hasManualRate = shift.manualGuardRateCents != null || shift.manualClientRateCents != null;
  return {
    useCustomRate: hasManualRate,
    selectedRateRuleId: hasManualRate ? "" : (shift.selectedRateRuleId ?? ""),
    manualGuardRubles: formatCentsAsRublesInput(shift.manualGuardRateCents),
    manualClientRubles: formatCentsAsRublesInput(shift.manualClientRateCents),
    manualRateUnit: shift.manualRateUnit === "Shift" ? "Shift" : "Hour",
    manualRateReason: shift.manualRateReason ?? "",
  };
}

export function shiftHasStoredRateAssignment(shift: Shift | null | undefined): boolean {
  if (!shift) return false;
  return (
    shift.manualGuardRateCents != null ||
    shift.manualClientRateCents != null ||
    Boolean(shift.selectedRateRuleId)
  );
}

export function guardListRowToSchedulerGuard(row: GuardSchedulePickerRow): Guard {
  return {
    id: row.id,
    name: `${row.lastName} ${row.firstName}`.trim(),
    status: row.status,
    phone: row.phone,
    position: row.position,
    licenseType: row.licenseType,
    employmentType: row.employmentType,
    isTrainee: row.isTrainee,
    traineeUntil: row.traineeUntil ? new Date(`${row.traineeUntil}T12:00:00+10:00`) : null,
    hasCar: row.hasCar,
  };
}
