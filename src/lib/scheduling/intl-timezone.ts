/** Некоторые среды (урезанный ICU в Node, отдельные билды) не знают все IANA-зоны. */
const intlTimeZoneResolved = new Map<string, string>();

/**
 * Возвращает зону, пригодную для Intl; при ошибке — ближайший надёжный аналог (+10, как Хабаровск).
 */
export function resolveIntlTimeZone(timeZone: string): string {
  const cached = intlTimeZoneResolved.get(timeZone);
  if (cached !== undefined) return cached;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone }).format(0);
    intlTimeZoneResolved.set(timeZone, timeZone);
    return timeZone;
  } catch {
    const fallback = "Asia/Vladivostok";
    intlTimeZoneResolved.set(timeZone, fallback);
    return fallback;
  }
}
