/**
 * Проверка: объединение интервалов смен полностью покрывает [rangeStart, rangeEnd).
 * Используется для баннера «требуется замена»: если слот закрыт другими сменами на объекте — напоминание не показываем.
 */
export function mergedIntervalsCoverRange(
  rangeStartMs: number,
  rangeEndMs: number,
  intervalsMs: ReadonlyArray<{ start: number; end: number }>,
): boolean {
  if (!(rangeEndMs > rangeStartMs)) return true;
  const clipped = intervalsMs
    .map((iv) => ({
      start: Math.max(iv.start, rangeStartMs),
      end: Math.min(iv.end, rangeEndMs),
    }))
    .filter((iv) => iv.start < iv.end)
    .sort((a, b) => a.start - b.start);

  let cursor = rangeStartMs;
  for (const iv of clipped) {
    if (iv.start > cursor) return false;
    cursor = Math.max(cursor, iv.end);
    if (cursor >= rangeEndMs) return true;
  }
  return cursor >= rangeEndMs;
}
