export function getPreviousCivilDate(civilDateIso: string): string {
  const [year, month, day] = civilDateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  date.setUTCDate(date.getUTCDate() - 1);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getTemplateVersionEffectiveTo(
  effectiveFrom: string,
  nextEffectiveFrom: string | null | undefined,
): string | null {
  if (!nextEffectiveFrom || nextEffectiveFrom <= effectiveFrom) return null;
  return getPreviousCivilDate(nextEffectiveFrom);
}
