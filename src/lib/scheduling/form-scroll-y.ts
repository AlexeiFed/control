/**
 * Нормализация scrollY из FormData / window.scrollY.
 * На macOS scrollY часто дробный (412.5) — строгий `/^\d+$/` валит Zod → 500 в server action.
 */
export function normalizeFormScrollY(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Math.round(Number(String(value).trim()));
  if (!Number.isFinite(n) || n < 0) return undefined;
  return String(n);
}
