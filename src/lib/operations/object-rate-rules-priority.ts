import { getKhabarovskComponents } from "../format/display-date";

/** Приоритеты для списка: верх списка — большее число (проверяется раньше). */
export function prioritiesForDisplayOrder(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (count - index) * 10);
}

/** Дата «С даты» по умолчанию для новых правил: 1 января текущего года (Хабаровск). */
export function defaultRateRuleEffectiveFrom(at: Date = new Date()): string {
  const { year } = getKhabarovskComponents(at);
  return `${year}-01-01`;
}
