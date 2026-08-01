import { getKhabarovskComponents } from "../format/display-date";
import type { CreateObjectRateRuleInput, ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";
import { getPreviousCivilDate } from "../scheduling/shift-template-history";

export type RateRuleSavePlan =
  | {
      mode: "update";
      /** Пересчёт табеля с этой даты (включительно). */
      backfillFrom: string;
    }
  | {
      mode: "supersede";
      closeEffectiveTo: string;
      newEffectiveFrom: string;
      newEffectiveTo: string | null;
      backfillFrom: string;
    };

/** 1-е число текущего месяца (Хабаровск) — дефолт «применить изменения с». */
export function defaultRateRuleVersionFrom(at: Date = new Date()): string {
  const { year, month0 } = getKhabarovskComponents(at);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-01`;
}

/**
 * План сохранения правки ставки:
 * - `versionFrom === effectiveFrom` → правка текущей версии (может затронуть весь её период);
 * - `versionFrom > effectiveFrom` → закрыть старую версию и создать новую с даты.
 */
export function resolveRateRuleSavePlan(
  existing: ObjectRateRuleRecord,
  versionFrom: string,
  input: CreateObjectRateRuleInput,
): RateRuleSavePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(versionFrom)) {
    throw new Error("Укажите корректную дату «Применить с»");
  }
  if (versionFrom < existing.effectiveFrom) {
    throw new Error("Дата «Применить с» не может быть раньше начала текущей версии правила");
  }
  if (existing.effectiveTo && versionFrom > existing.effectiveTo) {
    throw new Error("Дата «Применить с» выходит за период действия правила");
  }

  if (versionFrom === existing.effectiveFrom) {
    const backfillFrom =
      input.effectiveFrom < existing.effectiveFrom ? input.effectiveFrom : existing.effectiveFrom;
    return { mode: "update", backfillFrom };
  }

  const closeEffectiveTo = getPreviousCivilDate(versionFrom);
  if (closeEffectiveTo < existing.effectiveFrom) {
    throw new Error("Недостаточно дней в текущей версии для создания новой");
  }

  return {
    mode: "supersede",
    closeEffectiveTo,
    newEffectiveFrom: versionFrom,
    newEffectiveTo: input.effectiveTo ?? existing.effectiveTo,
    backfillFrom: versionFrom,
  };
}
