/**
 * Утилиты для форматирования и работы с датами в часовом поясе Хабаровска (UTC+10).
 * Все функции, возвращающие строковое представление или компоненты даты,
 * учитывают смещение +10 часов относительно UTC.
 */

/** Разделитель `дд.мм.гггг` для всех пользовательских дат в UI. */
export const DISPLAY_DATE_PART_SEPARATOR = "." as const;

/**
 * `YYYY-MM-DD` (или ISO-таймстамп/`Date`) -> `дд.мм.гггг` для UI.
 * Устойчив к не-строковым значениям (pg отдаёт `date`/`timestamp` как `Date`),
 * чтобы не падать с `trim is not a function` при ревалидации кеша.
 */
export function formatDisplayDateFromIso(isoDate: string | Date | null | undefined): string {
  const raw =
    isoDate instanceof Date
      ? Number.isNaN(isoDate.getTime())
        ? ""
        : isoDate.toISOString().slice(0, 10)
      : isoDate == null
        ? ""
        : String(isoDate);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (!m) return raw;
  const [, y, mo, d] = m;
  return `${d}${DISPLAY_DATE_PART_SEPARATOR}${mo}${DISPLAY_DATE_PART_SEPARATOR}${y}`;
}

/** Локальная календарная дата в `дд.мм.гггг` (Хабаровск UTC+10). */
export function formatDisplayDateLocal(date: Date): string {
  const d10 = new Date(date.getTime() + 10 * 3600_000);
  const y = d10.getUTCFullYear();
  const mo = String(d10.getUTCMonth() + 1).padStart(2, "0");
  const d = String(d10.getUTCDate()).padStart(2, "0");
  return `${d}${DISPLAY_DATE_PART_SEPARATOR}${mo}${DISPLAY_DATE_PART_SEPARATOR}${String(y).padStart(4, "0")}`;
}

/** `Date` -> `YYYY-MM-DD` (локальное время). */
export function toDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `Date` / ISO-строка / timestamp → `Date` (для client props после RSC-сериализации). */
export function coerceToDate(value: Date | string | number | null | undefined): Date {
  if (value instanceof Date) return value;
  if (value == null) return new Date(Number.NaN);
  return new Date(value);
}

/** `Date` -> `YYYY-MM-DD` в часовом поясе Хабаровска (UTC+10). */
export function toDateIsoKhabarovsk(date: Date): string {
  const d10 = new Date(date.getTime() + 10 * 3600_000);
  const y = d10.getUTCFullYear();
  const m = String(d10.getUTCMonth() + 1).padStart(2, "0");
  const d = String(d10.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `YYYY-MM-DD` ± N дней (календарь Хабаровска UTC+10). */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00+10:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateIsoKhabarovsk(d);
}

/** Возвращает компоненты даты в часовом поясе Хабаровска (UTC+10). */
export function getKhabarovskComponents(date: Date) {
  const d10 = new Date(date.getTime() + 10 * 3600_000);
  return {
    year: d10.getUTCFullYear(),
    month0: d10.getUTCMonth(),
    date: d10.getUTCDate(),
    dayOfWeek: d10.getUTCDay(),
    hours: d10.getUTCHours(),
    minutes: d10.getUTCMinutes(),
  };
}

/** Возвращает день месяца (1-31) в часовом поясе Хабаровска. */
export function getDateKhabarovsk(date: Date): number {
  return getKhabarovskComponents(date).date;
}

/** Возвращает день недели (0-6, 0=Вс) в часовом поясе Хабаровска. */
export function getDayKhabarovsk(date: Date): number {
  return getKhabarovskComponents(date).dayOfWeek;
}

/** Возвращает час (0-23) в часовом поясе Хабаровска. */
export function getHoursKhabarovsk(date: Date): number {
  return getKhabarovskComponents(date).hours;
}

/** Возвращает количество дней в месяце (UTC-безопасно). */
export function getDaysInMonth(year: number, month0: number): number {
  return new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
}

/** `YYYY-MM-DD` + `HH:mm` -> `Date` (Хабаровск UTC+10). */
export function toDateTimeKhabarovsk(dateIso: string, time: string): Date {
  const [year, month, day] = dateIso.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  // Хабаровск UTC+10
  return new Date(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+10:00`);
}

/** Форматирует дату и время для UI (Хабаровск UTC+10). */
export function formatDisplayDateTimeLocal(date: Date): string {
  const d10 = new Date(date.getTime() + 10 * 3600_000);
  const datePart = formatDisplayDateLocal(date);
  const hh = String(d10.getUTCHours()).padStart(2, "0");
  const mm = String(d10.getUTCMinutes()).padStart(2, "0");
  return `${datePart} ${hh}:${mm}`;
}

/** Метка дня недели и числа: «Пн, 11» (Хабаровск UTC+10). */
export function formatWeekdayDayLabel(date: Date): string {
  const d10 = new Date(date.getTime() + 10 * 3600_000);
  const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const day = String(d10.getUTCDate()).padStart(2, "0");
  return `${weekdays[d10.getUTCDay()]}, ${day}`;
}

/** Компактное локальное время для ячеек графика (Хабаровск UTC+10). */
export function formatCompactClockLocal(d: Date): string {
  const d10 = new Date(d.getTime() + 10 * 3600_000);
  const h = d10.getUTCHours();
  const m = d10.getUTCMinutes();
  if (m === 0) return String(h);
  return `${h}:${String(m).padStart(2, "0")}`;
}

/** Интервал как «8 - 20» или «20 - 8» (ночь) (Хабаровск UTC+10). */
export function formatCompactTimeRangeLocal(start: Date, end: Date): string {
  return `${formatCompactClockLocal(start)} - ${formatCompactClockLocal(end)}`;
}

/** Подпись периода для графика: «Май 2026 г.» (Хабаровск UTC+10). */
export function formatMonthYearLongRu(year: number, monthIndex0: number): string {
  // 12:00 в Хабаровске для исключения проблем с границами дней
  const date = new Date(Date.UTC(year, monthIndex0, 15, 12 - 10)); 
  const label = date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Полночь понедельника текущей недели в Хабаровске (UTC+10). */
export function getMondayWeekStartKhabarovsk(now = new Date()): Date {
  const kh = getKhabarovskComponents(now);
  const mondayOffset = kh.dayOfWeek === 0 ? -6 : 1 - kh.dayOfWeek;
  const startDay = getKhabarovskComponents(new Date(now.getTime() + mondayOffset * 24 * 3600_000));
  return new Date(
    `${startDay.year}-${String(startDay.month0 + 1).padStart(2, "0")}-${String(startDay.date).padStart(2, "0")}T00:00:00+10:00`,
  );
}

export type KhabarovskInterval = { start: Date; endExclusive: Date };

/** Календарная неделя (пн–вс) в Хабаровске, содержащая anchor `YYYY-MM-DD`. */
export function khabarovskWeekRangeContaining(isoDate: string): KhabarovskInterval {
  const anchor = parseIsoDateKhabarovskOrNull(isoDate);
  if (!anchor) throw new Error(`Invalid anchor date: ${isoDate}`);
  const start = getMondayWeekStartKhabarovsk(anchor);
  return { start, endExclusive: new Date(start.getTime() + 7 * 24 * 3600_000) };
}

/** `YYYY-MM-DD` попадает в текущую календарную неделю пн–вс (Хабаровск). */
export function isIsoInCurrentKhabarovskWeek(dateIso: string, now = new Date()): boolean {
  const todayIso = toDateIsoKhabarovsk(now);
  const { start, endExclusive } = khabarovskWeekRangeContaining(todayIso);
  const startIso = toDateIsoKhabarovsk(start);
  const lastIso = toDateIsoKhabarovsk(new Date(endExclusive.getTime() - 1));
  return dateIso >= startIso && dateIso <= lastIso;
}

/** Календарный месяц в Хабаровске для anchor `YYYY-MM-DD`. */
export function khabarovskMonthRangeContaining(isoDate: string): KhabarovskInterval {
  const parsed = parseIsoDateKhabarovskOrNull(isoDate);
  if (!parsed) throw new Error(`Invalid anchor date: ${isoDate}`);
  const kh = getKhabarovskComponents(parsed);
  const start = new Date(
    `${kh.year}-${String(kh.month0 + 1).padStart(2, "0")}-01T00:00:00+10:00`,
  );
  const endExclusive =
    kh.month0 === 11
      ? new Date(`${kh.year + 1}-01-01T00:00:00+10:00`)
      : new Date(`${kh.year}-${String(kh.month0 + 2).padStart(2, "0")}-01T00:00:00+10:00`);
  return { start, endExclusive };
}

/** Смена пересекает полуинтервал [start, endExclusive) по времени. */
export function intervalOverlaps(
  item: { startsAt: Date; endsAt: Date },
  range: KhabarovskInterval,
): boolean {
  return item.endsAt.getTime() > range.start.getTime() && item.startsAt.getTime() < range.endExclusive.getTime();
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` -> `Date` (Хабаровск UTC+10) или `null`, если дата невалидна.
 * Устойчив к `Date` на входе: pg отдаёт колонки типа `date` как `Date`,
 * и без приведения к `::text` сюда прилетал объект → `trim is not a function`. */
export function parseIsoDateKhabarovskOrNull(isoDate: string | Date | null | undefined): Date | null {
  if (!isoDate) return null;
  let raw: string;
  if (isoDate instanceof Date) {
    if (Number.isNaN(isoDate.getTime())) return null;
    // pg парсит `date` в локальную полночь — берём календарную дату без сдвига часового пояса.
    const y = isoDate.getFullYear();
    const m = String(isoDate.getMonth() + 1).padStart(2, "0");
    const d = String(isoDate.getDate()).padStart(2, "0");
    raw = `${y}-${m}-${d}`;
  } else {
    raw = String(isoDate);
  }
  const trimmed = raw.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  const date = new Date(`${trimmed}T12:00:00+10:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `Date` -> `YYYY-MM-DD` (UTC) или `null`, если дата невалидна. */
export function isoDateFromDateOrNull(date: Date | null | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}
