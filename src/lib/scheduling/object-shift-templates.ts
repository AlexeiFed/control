import type { ObjectShiftTemplateRow } from "../operations/shift-templates-repository";
import { toDateIsoKhabarovsk, getDayKhabarovsk } from "../format/display-date";
import type { ShiftKind } from "./types";

export const SHIFT_KIND_ORDER: readonly ShiftKind[] = ["Regular", "Reinforcement", "RapidResponse", "ShiftLead"];

/** Как в `activeShiftsSequence` и UI «Сменность (Шаблон)» на карточке объекта. */
export const DEFAULT_SHIFTS_PER_DAY = 2;
export const DEFAULT_SHIFTS_REINFORCEMENT_PER_DAY = 0;
export const DEFAULT_SHIFT_HOURS = 24;
export const DEFAULT_SHIFTS_RAPID_RESPONSE_PER_DAY = 0;
export const DEFAULT_RAPID_RESPONSE_SHIFT_HOURS = 24;
export const DEFAULT_REINFORCEMENT_SHIFT_HOURS = 24;
export const DEFAULT_SHIFTS_SHIFT_LEAD_PER_DAY = 0;
export const DEFAULT_SHIFT_LEAD_SHIFT_HOURS = 24;

export type ExpectedShifts = {
  regular: number;
  reinforcement: number;
  shiftHours: number;
  reinforcementShiftHours: number;
  rapidResponse: number;
  rapidResponseShiftHours: number;
  shiftLead: number;
  shiftLeadShiftHours: number;
};

export function defaultExpectedShiftsForDay(): ExpectedShifts {
  return {
    regular: DEFAULT_SHIFTS_PER_DAY,
    reinforcement: DEFAULT_SHIFTS_REINFORCEMENT_PER_DAY,
    shiftHours: DEFAULT_SHIFT_HOURS,
    reinforcementShiftHours: DEFAULT_REINFORCEMENT_SHIFT_HOURS,
    rapidResponse: DEFAULT_SHIFTS_RAPID_RESPONSE_PER_DAY,
    rapidResponseShiftHours: DEFAULT_RAPID_RESPONSE_SHIFT_HOURS,
    shiftLead: DEFAULT_SHIFTS_SHIFT_LEAD_PER_DAY,
    shiftLeadShiftHours: DEFAULT_SHIFT_LEAD_SHIFT_HOURS,
  };
}

/** Суммарные часы плана на сутки: count × hoursPerShift. */
export function templatePartTotalHours(count: number, hoursPerShift: number): number {
  if (count <= 0) return 0;
  return count * Math.max(0, hoursPerShift);
}

/**
 * Раскладка «часов в сутки» в count + hours (ограничения БД: count 0…24, hours 1…24).
 * Нужно, чтобы UI хранил одно число, а схема — пару полей.
 */
export function encodeTemplateTotalHours(totalHours: number): { count: number; hours: number } {
  const total = Math.max(0, Math.min(24 * 24, Math.trunc(totalHours)));
  if (total <= 0) return { count: 0, hours: DEFAULT_SHIFT_HOURS };
  if (total <= 24) return { count: 1, hours: total };
  for (let hours = 24; hours >= 1; hours -= 1) {
    if (total % hours !== 0) continue;
    const count = total / hours;
    if (count >= 1 && count <= 24) return { count, hours };
  }
  const count = Math.min(24, Math.ceil(total / 24));
  const hours = Math.min(24, Math.max(1, Math.round(total / count)));
  return { count, hours };
}

/** Типы смен, которые реально заложены в шаблоне объекта на день. */
export function shiftKindsInTemplate(expected: ExpectedShifts): ShiftKind[] {
  const kinds: ShiftKind[] = [];
  if (expected.regular > 0) kinds.push("Regular");
  if (expected.reinforcement > 0) kinds.push("Reinforcement");
  if (expected.rapidResponse > 0) kinds.push("RapidResponse");
  if (expected.shiftLead > 0) kinds.push("ShiftLead");
  return kinds.length > 0 ? kinds : [...SHIFT_KIND_ORDER];
}

export function resolveShiftKindForTemplate(
  expected: ExpectedShifts,
  preferred?: ShiftKind | null,
): ShiftKind {
  const allowed = shiftKindsInTemplate(expected);
  if (preferred && allowed.includes(preferred)) return preferred;
  return allowed[0] ?? "Regular";
}

/** ISO weekday: Пн=1 … Вс=7 (как в `object_shift_templates.day_of_week`). */
export function jsWeekdayToIso(weekdayFromJsDate: number): number {
  return weekdayFromJsDate === 0 ? 7 : weekdayFromJsDate;
}

/** Локальная календарная дата `YYYY-MM-DD` из `Date` (Хабаровск UTC+10). */
export function civilDateKeyFromDate(d: Date): string {
  return toDateIsoKhabarovsk(d);
}

/** Календарный день локального месяца (Хабаровск) без зависимости от TZ сервера/браузера. */
export function localMonthDateIso(year: number, month0: number, day: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInLocalMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

function rowToExpectedShifts(row: ObjectShiftTemplateRow): ExpectedShifts {
  return {
    regular: row.shiftsPerDay,
    reinforcement: row.shiftsReinforcementPerDay,
    shiftHours: row.shiftHours ?? DEFAULT_SHIFT_HOURS,
    reinforcementShiftHours: row.reinforcementShiftHours ?? DEFAULT_REINFORCEMENT_SHIFT_HOURS,
    rapidResponse: row.shiftsRapidResponsePerDay ?? DEFAULT_SHIFTS_RAPID_RESPONSE_PER_DAY,
    rapidResponseShiftHours: row.rapidResponseShiftHours ?? DEFAULT_RAPID_RESPONSE_SHIFT_HOURS,
    shiftLead: row.shiftsShiftLeadPerDay ?? DEFAULT_SHIFTS_SHIFT_LEAD_PER_DAY,
    shiftLeadShiftHours: row.shiftLeadShiftHours ?? DEFAULT_SHIFT_LEAD_SHIFT_HOURS,
  };
}

/**
 * @deprecated Раньше 0 усиления/МП/СтМ читался как «наследовать».
 * UI «Сменность» пишет 0 = тип не нужен — не используй для save/read плана.
 * Оставлено для редких legacy-мерджей; новое поведение — брать current as-is.
 */
export function inheritZeroTemplateCounts(
  current: ExpectedShifts,
  _previous: ExpectedShifts | null,
): ExpectedShifts {
  return current;
}

function pickTemplateRowForDate(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  civilDateIso: string,
  postId?: string | null,
): ObjectShiftTemplateRow | null {
  const d = new Date(`${civilDateIso}T12:00:00+10:00`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = jsWeekdayToIso(getDayKhabarovsk(d));

  const pick = (filterPostId: string | null | undefined): ObjectShiftTemplateRow | null => {
    let best: ObjectShiftTemplateRow | null = null;
    for (const row of rows) {
      if (row.objectId !== objectId || row.dayOfWeek !== dow) continue;
      const rowPostId = row.postId ?? null;
      if (filterPostId === null) {
        if (rowPostId !== null) continue;
      } else if (filterPostId) {
        if (rowPostId !== filterPostId) continue;
      }
      if (row.effectiveFrom > civilDateIso) continue;
      if (row.effectiveTo && row.effectiveTo < civilDateIso) continue;
      if (!best || row.effectiveFrom > best.effectiveFrom) best = row;
    }
    return best;
  };

  if (postId) {
    return pick(postId) ?? pick(null);
  }
  return pick(null);
}

/**
 * Активная строка шаблона на календарную дату: `effective_from <= date <= effective_to || effective_to IS NULL`.
 * При нескольких версиях берётся с максимальным `effective_from`.
 */
export function expectedShiftsForDate(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  civilDateIso: string,
  postId?: string | null,
): ExpectedShifts | null {
  const best = pickTemplateRowForDate(rows, objectId, civilDateIso, postId);
  if (!best) return null;
  // 0 в активной версии = тип выключен (не подмешиваем прошлую версию).
  return rowToExpectedShifts(best);
}

/** План по каждому дню локального месяца (учитывает версии шаблона и effective_to). */
export function buildExpectedShiftsForLocalMonth(
  objectId: string,
  year: number,
  month0: number,
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  postId?: string | null,
): Record<string, ExpectedShifts> {
  const totalDays = daysInLocalMonth(year, month0);
  const out: Record<string, ExpectedShifts> = {};
  for (let day = 1; day <= totalDays; day++) {
    const dateIso = localMonthDateIso(year, month0, day);
    out[dateIso] = expectedShiftsForDate(rows, objectId, dateIso, postId) ?? defaultExpectedShiftsForDay();
  }
  return out;
}

/** Недельная сетка Пн–Вс из того же плана, что и строка «План» в графике. */
export function weeklyExpectedShiftsFromDateMap(
  expectedByDateIso: Record<string, ExpectedShifts>,
  year: number,
  month0: number,
): ActiveShiftsSequenceResult {
  const totalDays = daysInLocalMonth(year, month0);
  const pickForDow = (dow: number): ExpectedShifts => {
    for (let day = 1; day <= totalDays; day++) {
      const dateIso = localMonthDateIso(year, month0, day);
      const d = new Date(`${dateIso}T12:00:00+10:00`);
      if (jsWeekdayToIso(getDayKhabarovsk(d)) !== dow) continue;
      return expectedByDateIso[dateIso] ?? defaultExpectedShiftsForDay();
    }
    return defaultExpectedShiftsForDay();
  };
  const perDow = Array.from({ length: 7 }, (_, i) => pickForDow(i + 1));
  return {
    regular: perDow.map((v) => v.regular),
    reinforcement: perDow.map((v) => v.reinforcement),
    shiftHours: perDow.map((v) => v.shiftHours),
    reinforcementShiftHours: perDow.map((v) => v.reinforcementShiftHours),
    rapidResponse: perDow.map((v) => v.rapidResponse),
    rapidResponseShiftHours: perDow.map((v) => v.rapidResponseShiftHours),
    shiftLead: perDow.map((v) => v.shiftLead),
    shiftLeadShiftHours: perDow.map((v) => v.shiftLeadShiftHours),
  };
}

/** Последняя версия шаблона, действующая хотя бы один день в выбранном месяце. */
export function dominantTemplateEffectiveFromForMonth(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  year: number,
  month0: number,
  postId?: string | null,
): string {
  const monthStart = localMonthDateIso(year, month0, 1);
  const monthEnd = localMonthDateIso(year, month0, daysInLocalMonth(year, month0));
  let best: string | null = null;
  for (const row of rows) {
    if (row.objectId !== objectId) continue;
    const rowPostId = row.postId ?? null;
    if (postId) {
      if (rowPostId !== postId && rowPostId !== null) continue;
    } else if (rowPostId !== null) {
      continue;
    }
    if (row.effectiveFrom > monthEnd) continue;
    if (row.effectiveTo && row.effectiveTo < monthStart) continue;
    if (!best || row.effectiveFrom > best) best = row.effectiveFrom;
  }
  return best ?? monthStart;
}

export function expectedRegularShiftsForDate(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  civilDateIso: string,
): number | null {
  return expectedShiftsForDate(rows, objectId, civilDateIso)?.regular ?? null;
}

export type WeekDayIso = { iso: string };

export function buildExpectedShiftsByObjectAndDay(
  objectIds: ReadonlyArray<string>,
  weekDayIsos: ReadonlyArray<string>,
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
): Record<string, Record<string, ExpectedShifts>> {
  const out: Record<string, Record<string, ExpectedShifts>> = {};
  for (const oid of objectIds) {
    const byDay: Record<string, ExpectedShifts> = {};
    for (const iso of weekDayIsos) {
      byDay[iso] = expectedShiftsForObjectDay(rows, oid, iso);
    }
    out[oid] = byDay;
  }
  return out;
}

/**
 * План объекта на день для недельного графика:
 * если есть шаблоны постов — сумма по постам, иначе шаблон объекта (post_id IS NULL).
 */
export function expectedShiftsForObjectDay(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  civilDateIso: string,
): ExpectedShifts {
  const postIds = [
    ...new Set(
      rows
        .filter((row) => row.objectId === objectId && row.postId)
        .map((row) => row.postId as string),
    ),
  ];
  if (postIds.length === 0) {
    return expectedShiftsForDate(rows, objectId, civilDateIso, null) ?? defaultExpectedShiftsForDay();
  }
  const parts = postIds.map(
    (postId) => expectedShiftsForDate(rows, objectId, civilDateIso, postId) ?? defaultExpectedShiftsForDay(),
  );
  return aggregateExpectedShiftParts(parts);
}

/** Суммирует планы постов, сохраняя часы (regular×shiftHours). */
export function aggregateExpectedShiftParts(parts: ReadonlyArray<ExpectedShifts>): ExpectedShifts {
  if (parts.length === 0) return defaultExpectedShiftsForDay();
  if (parts.length === 1) return parts[0]!;

  const regularHours = parts.reduce((sum, part) => sum + part.regular * part.shiftHours, 0);
  const reinforcementHours = parts.reduce(
    (sum, part) => sum + part.reinforcement * part.reinforcementShiftHours,
    0,
  );
  const rapidResponseHours = parts.reduce(
    (sum, part) => sum + part.rapidResponse * part.rapidResponseShiftHours,
    0,
  );
  const shiftLeadHours = parts.reduce(
    (sum, part) => sum + part.shiftLead * part.shiftLeadShiftHours,
    0,
  );
  const regular = parts.reduce((sum, part) => sum + part.regular, 0);
  const reinforcement = parts.reduce((sum, part) => sum + part.reinforcement, 0);
  const rapidResponse = parts.reduce((sum, part) => sum + part.rapidResponse, 0);
  const shiftLead = parts.reduce((sum, part) => sum + part.shiftLead, 0);

  return {
    regular,
    shiftHours: regular > 0 ? Math.max(1, Math.round(regularHours / regular)) : DEFAULT_SHIFT_HOURS,
    reinforcement,
    reinforcementShiftHours:
      reinforcement > 0
        ? Math.max(1, Math.round(reinforcementHours / reinforcement))
        : DEFAULT_REINFORCEMENT_SHIFT_HOURS,
    rapidResponse,
    rapidResponseShiftHours:
      rapidResponse > 0
        ? Math.max(1, Math.round(rapidResponseHours / rapidResponse))
        : DEFAULT_RAPID_RESPONSE_SHIFT_HOURS,
    shiftLead,
    shiftLeadShiftHours:
      shiftLead > 0 ? Math.max(1, Math.round(shiftLeadHours / shiftLead)) : DEFAULT_SHIFT_LEAD_SHIFT_HOURS,
  };
}

/** Значения шаблона по дням Пн…Вс (индекс 0 = Пн) на дату-ориентир. */
export type ActiveShiftsSequenceResult = {
  regular: number[];
  reinforcement: number[];
  shiftHours: number[];
  reinforcementShiftHours: number[];
  rapidResponse: number[];
  rapidResponseShiftHours: number[];
  shiftLead: number[];
  shiftLeadShiftHours: number[];
};

function pickActiveTemplateRowForDow(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  dayOfWeek: number,
  referenceCivilDate: string,
  postId?: string | null,
): ObjectShiftTemplateRow | null {
  const pick = (filterPostId: string | null): ObjectShiftTemplateRow | null => {
    let best: ObjectShiftTemplateRow | null = null;
    for (const row of rows) {
      if (row.objectId !== objectId || row.dayOfWeek !== dayOfWeek) continue;
      if ((row.postId ?? null) !== filterPostId) continue;
      if (row.effectiveFrom > referenceCivilDate) continue;
      if (row.effectiveTo && row.effectiveTo < referenceCivilDate) continue;
      if (!best || row.effectiveFrom > best.effectiveFrom) best = row;
    }
    return best;
  };

  if (postId) return pick(postId) ?? pick(null);
  return pick(null);
}

export function activeShiftsSequence(
  rows: ReadonlyArray<ObjectShiftTemplateRow>,
  objectId: string,
  referenceCivilDate: string,
  postId?: string | null,
): ActiveShiftsSequenceResult {
  const regular: number[] = [];
  const reinforcement: number[] = [];
  const shiftHours: number[] = [];
  const reinforcementShiftHours: number[] = [];
  const rapidResponse: number[] = [];
  const rapidResponseShiftHours: number[] = [];
  const shiftLead: number[] = [];
  const shiftLeadShiftHours: number[] = [];

  for (let dow = 1; dow <= 7; dow++) {
    const best = pickActiveTemplateRowForDow(rows, objectId, dow, referenceCivilDate, postId);
    regular.push(best?.shiftsPerDay ?? DEFAULT_SHIFTS_PER_DAY);
    reinforcement.push(best?.shiftsReinforcementPerDay ?? DEFAULT_SHIFTS_REINFORCEMENT_PER_DAY);
    shiftHours.push(best?.shiftHours ?? DEFAULT_SHIFT_HOURS);
    reinforcementShiftHours.push(best?.reinforcementShiftHours ?? DEFAULT_REINFORCEMENT_SHIFT_HOURS);
    rapidResponse.push(best?.shiftsRapidResponsePerDay ?? DEFAULT_SHIFTS_RAPID_RESPONSE_PER_DAY);
    rapidResponseShiftHours.push(best?.rapidResponseShiftHours ?? DEFAULT_RAPID_RESPONSE_SHIFT_HOURS);
    shiftLead.push(best?.shiftsShiftLeadPerDay ?? DEFAULT_SHIFTS_SHIFT_LEAD_PER_DAY);
    shiftLeadShiftHours.push(best?.shiftLeadShiftHours ?? DEFAULT_SHIFT_LEAD_SHIFT_HOURS);
  }

  return { regular, reinforcement, shiftHours, reinforcementShiftHours, rapidResponse, rapidResponseShiftHours, shiftLead, shiftLeadShiftHours };
}

/** Для карточки шаблона: берём значения версии as-is (0 = тип не нужен). */
export function mergeShiftTemplateForDisplay(
  atMonthStart: ActiveShiftsSequenceResult,
  _dayBeforeMonth: ActiveShiftsSequenceResult,
): ActiveShiftsSequenceResult {
  return atMonthStart;
}

export function countRegularShiftsOnObjectDay(
  shifts: ReadonlyArray<{ objectId: string; startsAt: Date; shiftKind: string }>,
  objectId: string,
  civilDateIso: string,
): number {
  return shifts.filter((s) => {
    if (s.objectId !== objectId) return false;
    if (s.shiftKind === "Reinforcement") return false;
    return civilDateKeyFromDate(s.startsAt) === civilDateIso;
  }).length;
}
