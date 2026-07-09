import type { ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";
import { mapGuardLicenseForRates } from "../scheduling/guard-profile";
import type { Guard, Shift } from "../scheduling/types";
import { resolveIntlTimeZone } from "../scheduling/intl-timezone";
import { localDateKeyInTimeZone } from "../scheduling/local-date-key";

export type SegmentMatchContext = {
  guard: Guard;
  shift: Shift;
  /** YYYY-MM-DD в timeZone смены */
  localDateKey: string;
  /** 1 = пн … 7 = вс (как в `object_rate_rules.days_of_week`) */
  dayOfWeekMon1Sun7: number;
  /** минуты от полуночи 0..1439 в timeZone */
  localMinutesFromMidnight: number;
  isHoliday: boolean;
  timeZone: string;
};

/** Парсит "HH:mm" в минуты от полуночи. */
export function parseTimeToMinutes(value: string | null): number | null {
  if (!value) return null;
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min < 0 || min > 59 || h < 0 || h > 23) return null;
  return h * 60 + min;
}

/** Понедельник = 1 … воскресенье = 7 для мгновения `at` в зоне `timeZone`. */
export function monday1Sunday7InZone(at: Date, timeZone: string): number {
  if (timeZone === "Asia/Khabarovsk" || timeZone === "Etc/GMT-10") {
    // Оптимизированный расчет для +10
    const d = new Date(at.getTime() + 10 * 3600_000);
    const day = d.getUTCDay(); // 0 = Sun, 1 = Mon ...
    return day === 0 ? 7 : day;
  }
  const tz = resolveIntlTimeZone(timeZone);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[wd] ?? 1;
}

export function localMinutesFromMidnightInZone(at: Date, timeZone: string): number {
  if (timeZone === "Asia/Khabarovsk" || timeZone === "Etc/GMT-10") {
    // Оптимизированный расчет для +10
    const d = new Date(at.getTime() + 10 * 3600_000);
    return d.getUTCHours() * 60 + d.getUTCMinutes();
  }
  const tz = resolveIntlTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h * 60 + m;
}

export function buildSegmentContext(
  at: Date,
  guard: Guard,
  shift: Shift,
  holidayDates: ReadonlySet<string>,
  timeZone: string,
): SegmentMatchContext {
  const localDateKey = localDateKeyInTimeZone(at, timeZone);
  return {
    guard,
    shift,
    localDateKey,
    dayOfWeekMon1Sun7: monday1Sunday7InZone(at, timeZone),
    localMinutesFromMidnight: localMinutesFromMidnightInZone(at, timeZone),
    isHoliday: holidayDates.has(localDateKey),
    timeZone,
  };
}

function dateInRuleRange(localDateKey: string, rule: ObjectRateRuleRecord): boolean {
  if (localDateKey < rule.effectiveFrom) return false;
  if (rule.effectiveTo && localDateKey > rule.effectiveTo) return false;
  return true;
}

/** Локальное время попадает в [startsAt, endsAt); поддержка окна через полночь. */
export function minuteInTimeWindow(localMinutes: number, startsAt: string | null, endsAt: string | null): boolean {
  if (!startsAt && !endsAt) return true;
  const a = parseTimeToMinutes(startsAt);
  const b = parseTimeToMinutes(endsAt);
  if (a == null && b == null) return true;
  if (a != null && b == null) return localMinutes >= a;
  if (a == null && b != null) return localMinutes < b;
  if (a != null && b != null) {
    if (a === b) return true; // Окно 08:00-08:00 означает "любое время" или "24 часа"
    if (a < b) return localMinutes >= a && localMinutes < b;
    return localMinutes >= a || localMinutes < b;
  }
  return true;
}

export function ruleMatchesSegment(rule: ObjectRateRuleRecord, ctx: SegmentMatchContext): boolean {
  if (rule.objectId !== ctx.shift.objectId) return false;
  if (!dateInRuleRange(ctx.localDateKey, rule)) return false;

  if (rule.daysOfWeek != null && rule.daysOfWeek.length > 0 && !rule.daysOfWeek.includes(ctx.dayOfWeekMon1Sun7)) {
    return false;
  }

  if (rule.isHoliday === true && !ctx.isHoliday) return false;
  if (rule.isHoliday === false && ctx.isHoliday) return false;

  if (rule.shiftKind != null && rule.shiftKind !== ctx.shift.shiftKind) return false;

  if (!minuteInTimeWindow(ctx.localMinutesFromMidnight, rule.startsAt, rule.endsAt)) return false;

  if (rule.position != null && rule.position !== ctx.guard.position) return false;

  // Для ShiftLead условие license_type в правиле не учитывается (см. план ставок).
  if (rule.licenseType != null && ctx.guard.position !== "ShiftLead") {
    if (mapGuardLicenseForRates(ctx.guard) !== rule.licenseType) return false;
  }

  if (rule.employmentType != null && rule.employmentType !== ctx.guard.employmentType) return false;

  if (rule.isTrainee === true && !ctx.guard.isTrainee) return false;
  if (rule.isTrainee === false && ctx.guard.isTrainee) return false;

  return true;
}

/** Среди подходящих правил — максимальный `priority`, при равенстве лексикографически меньшее `name` (стабильность). */
export function findBestMatchingRule(
  rules: readonly ObjectRateRuleRecord[],
  ctx: SegmentMatchContext,
): ObjectRateRuleRecord | null {
  const matching = rules.filter((r) => ruleMatchesSegment(r, ctx));
  if (matching.length === 0) return null;
  matching.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.name.localeCompare(b.name, "ru-RU");
  });
  return matching[0] ?? null;
}
