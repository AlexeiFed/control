import { getKhabarovskComponents } from "../format/display-date";
import { getPreviousCivilDate } from "../scheduling/shift-template-history";

export type CuratorTariffSavePlan =
  | { mode: "update" }
  | {
      mode: "supersede";
      closeEffectiveTo: string;
      newEffectiveFrom: string;
    };

/** 1-е число следующего месяца (Хабаровск) — дефолт «применить ставки с». */
export function defaultCuratorTariffVersionFrom(at: Date = new Date()): string {
  const { year, month0 } = getKhabarovskComponents(at);
  const next = month0 === 11 ? { y: year + 1, m1: 1 } : { y: year, m1: month0 + 2 };
  return `${next.y}-${String(next.m1).padStart(2, "0")}-01`;
}

/**
 * План сохранения ставок кураторов:
 * - `versionFrom === openEffectiveFrom` → правка текущей открытой версии;
 * - `versionFrom > openEffectiveFrom` → закрыть текущую и открыть новую с даты.
 */
export function resolveCuratorTariffSavePlan(
  openEffectiveFrom: string,
  versionFrom: string,
): CuratorTariffSavePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(versionFrom)) {
    throw new Error("Укажите корректную дату «Применить с»");
  }
  if (versionFrom < openEffectiveFrom) {
    throw new Error("Дата «Применить с» не может быть раньше начала текущей версии ставок");
  }
  if (versionFrom === openEffectiveFrom) {
    return { mode: "update" };
  }
  const closeEffectiveTo = getPreviousCivilDate(versionFrom);
  if (closeEffectiveTo < openEffectiveFrom) {
    throw new Error("Недостаточно дней в текущей версии для создания новой");
  }
  return {
    mode: "supersede",
    closeEffectiveTo,
    newEffectiveFrom: versionFrom,
  };
}
