import type { ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";
import type { Guard, RateUnit, Shift } from "../scheduling/types";
import { DEFAULT_SHIFT_TIMEZONE } from "../scheduling/local-date-key";
import { buildSegmentContext, dateInRuleRange, findBestMatchingRule } from "./rate-matching";

export type GuardRateContribution = {
  guardRateCents: number;
  minutes: number;
  amountCents: number;
};

export type ShiftRateBreakdown = {
  clientAmountCents: number;
  guardAmountCents: number;
  marginCents: number;
  regularHours: number;
  reinforcementHours: number;
  unpricedMinutes: number;
  guardRateContributions: GuardRateContribution[];
};

function roundCents(n: number): number {
  return Math.round(n);
}

function shiftDurationMinutes(shift: Shift): number {
  return Math.max(0, Math.floor((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000));
}

/** Окно, за которое начисляем оплату: при полном невыходе — null; при частичном — [start, workedUntil). */
export function billableShiftWindow(shift: Shift): { start: Date; end: Date } | null {
  if (!shift.isNoShow) return { start: shift.startsAt, end: shift.endsAt };
  if (shift.incidentWorkedUntilAt) {
    const w = shift.incidentWorkedUntilAt;
    if (w.getTime() <= shift.startsAt.getTime() || w.getTime() > shift.endsAt.getTime()) return null;
    return { start: shift.startsAt, end: w };
  }
  // «Ушёл с работы» без времени ухода (старые/битые записи): считаем отработанной всю смену,
  // иначе 8–20 с меткой LeftWork давали 0 ч при живых заменах на хвосте.
  if (shift.incidentCategory === "LeftWork") {
    return { start: shift.startsAt, end: shift.endsAt };
  }
  return null;
}

export function billableShiftMinutes(shift: Shift): number {
  const w = billableShiftWindow(shift);
  if (!w) return 0;
  return Math.max(0, Math.floor((w.end.getTime() - w.start.getTime()) / 60_000));
}

function perMinuteContribution(
  rule: ObjectRateRuleRecord,
  side: "client" | "guard",
  shiftTotalMinutes: number,
): number {
  const cents = side === "client" ? rule.clientRateCents : rule.guardRateCents;
  if (rule.rateUnit === "Hour") return cents / 60;
  if (shiftTotalMinutes <= 0) return 0;
  return cents / shiftTotalMinutes;
}

type SideRateAccumulator = Map<number, { minutes: number; cents: number }>;

function accumulateRateMinutes(
  acc: SideRateAccumulator,
  rateCents: number,
  minutes: number,
  cents: number,
): void {
  const prev = acc.get(rateCents) ?? { minutes: 0, cents: 0 };
  acc.set(rateCents, { minutes: prev.minutes + minutes, cents: prev.cents + cents });
}

function contributionsFromAccumulator(acc: SideRateAccumulator): GuardRateContribution[] {
  return [...acc.entries()]
    .map(([guardRateCents, value]) => ({
      guardRateCents,
      minutes: value.minutes,
      amountCents: roundCents(value.cents),
    }))
    .filter((entry) => entry.minutes > 0 || entry.amountCents > 0)
    .sort((a, b) => a.guardRateCents - b.guardRateCents);
}

function sideBreakdown(params: {
  shift: Shift;
  shiftTotalMinutes: number;
  guard: Guard;
  rules: readonly ObjectRateRuleRecord[];
  holidayDates: ReadonlySet<string>;
  timeZone: string;
  manualCents: number | null;
  manualUnit: RateUnit | null;
  side: "client" | "guard";
}): { amountCents: number; unpricedMinutes: number; rateContributions: GuardRateContribution[] } {
  const { shift, shiftTotalMinutes, guard, rules, holidayDates, timeZone, manualCents, manualUnit, side } = params;
  const rateAcc: SideRateAccumulator = new Map();

  if (shift.isNoShow) {
    return { amountCents: 0, unpricedMinutes: 0, rateContributions: [] };
  }

  const resolvedUnit = manualCents != null ? (manualUnit ?? "Hour") : null;
  if (manualCents != null && resolvedUnit != null) {
    const amount =
      resolvedUnit === "Hour"
        ? roundCents((manualCents * shiftTotalMinutes) / 60)
        : roundCents(manualCents);
    accumulateRateMinutes(rateAcc, manualCents, shiftTotalMinutes, amount);
    return { amountCents: amount, unpricedMinutes: 0, rateContributions: contributionsFromAccumulator(rateAcc) };
  }

  if (shiftTotalMinutes === 0) return { amountCents: 0, unpricedMinutes: 0, rateContributions: [] };

  const startCtx = buildSegmentContext(shift.startsAt, guard, shift, holidayDates, timeZone);
  const shiftDateKey = startCtx.localDateKey;

  const pinnedRule =
    shift.selectedRateRuleId != null
      ? rules.find((rule) => rule.id === shift.selectedRateRuleId) ?? null
      : null;

  // Закрытая/просроченная pinned-ставка не фиксирует архивные cents на новых датах.
  if (pinnedRule && dateInRuleRange(shiftDateKey, pinnedRule)) {
    const rateCents = side === "client" ? pinnedRule.clientRateCents : pinnedRule.guardRateCents;
    const amount = roundCents(perMinuteContribution(pinnedRule, side, shiftTotalMinutes) * shiftTotalMinutes);
    accumulateRateMinutes(rateAcc, rateCents, shiftTotalMinutes, amount);
    return { amountCents: amount, unpricedMinutes: 0, rateContributions: contributionsFromAccumulator(rateAcc) };
  }

  // Ставка по дню ячейки графика: правило подбирается один раз в момент начала смены,
  // все минуты смены идут по этой ставке (без переноса часов через полночь).
  const rule = findBestMatchingRule(rules, startCtx);
  if (!rule) {
    return {
      amountCents: 0,
      unpricedMinutes: shiftTotalMinutes,
      rateContributions: [],
    };
  }

  const rateCents = side === "client" ? rule.clientRateCents : rule.guardRateCents;
  const amount = roundCents(perMinuteContribution(rule, side, shiftTotalMinutes) * shiftTotalMinutes);
  accumulateRateMinutes(rateAcc, rateCents, shiftTotalMinutes, amount);
  return {
    amountCents: amount,
    unpricedMinutes: 0,
    rateContributions: contributionsFromAccumulator(rateAcc),
  };
}

/**
 * Расчёт сумм по смене: override вручную — только для стороны с заполненными manual*;
 * иначе одно правило по моменту начала смены; ставка Hour (доля за минуту) или Shift (доля от полной смены).
 */
export function computeShiftRateBreakdown(
  shift: Shift,
  guard: Guard,
  objectRules: readonly ObjectRateRuleRecord[],
  holidayDates: ReadonlySet<string>,
  timeZone: string = DEFAULT_SHIFT_TIMEZONE,
): ShiftRateBreakdown {
  const window = billableShiftWindow(shift);
  if (shift.isNoShow && !window) {
    return {
      clientAmountCents: 0,
      guardAmountCents: 0,
      marginCents: 0,
      regularHours: 0,
      reinforcementHours: 0,
      unpricedMinutes: 0,
      guardRateContributions: [],
    };
  }
  const effectiveShift: Shift =
    shift.isNoShow && window
      ? { ...shift, startsAt: window.start, endsAt: window.end, isNoShow: false }
      : shift;
  const totalMin = shiftDurationMinutes(effectiveShift);
  const totalHours = Math.round((totalMin / 60) * 100) / 100;
  const regularHours = shift.shiftKind === "Regular" ? totalHours : 0;
  const reinforcementHours = shift.shiftKind !== "Regular" ? totalHours : 0;

  const client = sideBreakdown({
    shift: effectiveShift,
    shiftTotalMinutes: totalMin,
    guard,
    rules: objectRules,
    holidayDates,
    timeZone,
    manualCents: shift.manualClientRateCents,
    manualUnit: shift.manualClientRateCents != null ? shift.manualRateUnit : null,
    side: "client",
  });

  const guardSide = sideBreakdown({
    shift: effectiveShift,
    shiftTotalMinutes: totalMin,
    guard,
    rules: objectRules,
    holidayDates,
    timeZone,
    manualCents: shift.manualGuardRateCents,
    manualUnit: shift.manualGuardRateCents != null ? shift.manualRateUnit : null,
    side: "guard",
  });

  return {
    clientAmountCents: client.amountCents,
    guardAmountCents: guardSide.amountCents,
    marginCents: client.amountCents - guardSide.amountCents,
    regularHours,
    reinforcementHours,
    unpricedMinutes: Math.max(client.unpricedMinutes, guardSide.unpricedMinutes),
    guardRateContributions: guardSide.rateContributions,
  };
}
