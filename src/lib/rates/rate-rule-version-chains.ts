import type { ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";

export type RateRuleVersionChain = {
  /** Актуальная (самая поздняя) версия линии. */
  current: ObjectRateRuleRecord;
  /** Архивные версии: сначала более новые. */
  history: ObjectRateRuleRecord[];
};

/**
 * Ключ «линии» ставки: всё, кроме id / priority / дат / ставки сотрудника.
 * Версии после «Изменить с даты» отличаются только guardRateCents и периодом.
 */
export function rateRuleVersionProfileKey(rule: ObjectRateRuleRecord): string {
  return [
    rule.objectId,
    rule.name,
    (rule.daysOfWeek ?? []).join(","),
    rule.isHoliday === null ? "" : String(rule.isHoliday),
    rule.shiftKind ?? "",
    rule.startsAt ?? "",
    rule.endsAt ?? "",
    rule.position ?? "",
    rule.licenseType ?? "",
    rule.employmentType ?? "",
    rule.isTrainee === null ? "" : String(rule.isTrainee),
    String(rule.clientRateCents),
    rule.rateUnit,
  ].join("\0");
}

/** Группирует правила в линии версий; порядок — первое появление линии в `rules`. */
export function buildRateRuleVersionChains(
  rules: readonly ObjectRateRuleRecord[],
): RateRuleVersionChain[] {
  const byProfile = new Map<string, ObjectRateRuleRecord[]>();
  for (const rule of rules) {
    const key = rateRuleVersionProfileKey(rule);
    const bucket = byProfile.get(key);
    if (bucket) bucket.push(rule);
    else byProfile.set(key, [rule]);
  }

  const chainByCurrentId = new Map<string, RateRuleVersionChain>();
  for (const bucket of byProfile.values()) {
    const sorted = [...bucket].sort(
      (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id),
    );
    const current = sorted[sorted.length - 1]!;
    chainByCurrentId.set(current.id, {
      current,
      history: sorted.slice(0, -1).reverse(),
    });
  }

  const seen = new Set<string>();
  const ordered: RateRuleVersionChain[] = [];
  for (const rule of rules) {
    const key = rateRuleVersionProfileKey(rule);
    const bucket = byProfile.get(key);
    if (!bucket) continue;
    const sorted = [...bucket].sort(
      (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id),
    );
    const currentId = sorted[sorted.length - 1]!.id;
    if (seen.has(currentId)) continue;
    seen.add(currentId);
    const chain = chainByCurrentId.get(currentId);
    if (chain) ordered.push(chain);
  }
  return ordered;
}

/** Ids для reorder: по каждой линии архив (от старых к новым) + current. */
export function flattenVersionChainsForReorder(chains: readonly RateRuleVersionChain[]): string[] {
  return chains.flatMap((chain) => {
    const historyOldestFirst = [...chain.history].sort(
      (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id.localeCompare(b.id),
    );
    return [...historyOldestFirst, chain.current].map((rule) => rule.id);
  });
}
