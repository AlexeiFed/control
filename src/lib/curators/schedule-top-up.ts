import type { RateUnit } from "../scheduling/types";

export type ScheduleTopUpCalc = {
  timesheetRub: number;
  timesheetHourlyRub: number;
  scheduleRegularHourlyRub: number;
  topUpHourlyRub: number;
  amountRub: number;
  paymentFormula: string;
  objectHourlyRateRub: number | null;
};

function fmtRub(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

/** Кураторы/объекты без автодоплаты 25 ₽/ч за дежурство на объекте. */
const CURATOR_SCHEDULE_TOP_UP_EXCLUSIONS: ReadonlyArray<{
  lastName: string;
  firstName: string;
  objectNameIncludes: string;
}> = [
  {
    lastName: "Коваленко",
    firstName: "Денис",
    objectNameIncludes: "КУЛЬТУРА КЛАССИКА",
  },
];

function normalizeNamePart(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function isCuratorScheduleTopUpExcluded(input: {
  lastName: string;
  firstName: string;
  objectName: string;
}): boolean {
  const lastName = normalizeNamePart(input.lastName);
  const firstName = normalizeNamePart(input.firstName);
  const objectName = normalizeNamePart(input.objectName);
  return CURATOR_SCHEDULE_TOP_UP_EXCLUSIONS.some(
    (rule) =>
      normalizeNamePart(rule.lastName) === lastName &&
      normalizeNamePart(rule.firstName) === firstName &&
      objectName.includes(normalizeNamePart(rule.objectNameIncludes)),
  );
}

export function buildCuratorScheduleTopUpExcludedFormula(input: {
  objectName: string;
  timesheetRub: number;
  hours: number;
}): string {
  const hours = Math.max(0, input.hours);
  const timesheetHourlyRub = hours > 0 ? input.timesheetRub / hours : 0;
  return (
    `Дежурство на «${input.objectName}»: автодоплата за смену не начисляется. ` +
    `Табель: ${fmtRub(timesheetHourlyRub)} ₽/ч × ${fmtRub(hours)} ч = ${fmtRub(input.timesheetRub)} ₽.`
  );
}

/** Доплата куратору за дежурство (смена, усиление, МП): фиксированная ₽/ч × часы (не зависит от ставки объекта). */
export function computeScheduleRegularTopUp(input: {
  timesheetGuardRub: number;
  hours: number;
  scheduleRegularHourlyRub: number;
  ruleName: string | null;
  rateUnit: RateUnit | null;
  ruleGuardRateCents: number | null;
}): ScheduleTopUpCalc {
  const hours = Math.max(0, input.hours);
  const timesheetRub = Math.max(0, input.timesheetGuardRub);
  const timesheetHourlyRub = hours > 0 ? timesheetRub / hours : 0;
  const scheduleRegularHourlyRub = Math.max(0, input.scheduleRegularHourlyRub);
  const topUpHourlyRub = scheduleRegularHourlyRub;
  const amountRub = Math.round(topUpHourlyRub * hours);

  const ruleLabel = input.ruleName ? `«${input.ruleName}»` : "правило объекта";
  let formula: string;

  if (hours <= 0) {
    formula = "Нет оплачиваемых часов.";
  } else if (input.rateUnit === "Shift" && input.ruleGuardRateCents != null) {
    const shiftRub = input.ruleGuardRateCents / 100;
    formula =
      `Табель: ${ruleLabel}, ${fmtRub(shiftRub)} ₽ за смену (${fmtRub(hours)} ч) = ${fmtRub(timesheetRub)} ₽. ` +
      `Доплата: ${fmtRub(topUpHourlyRub)} ₽/ч × ${fmtRub(hours)} ч = ${fmtRub(amountRub)} ₽.`;
  } else {
    formula =
      `Табель: ${fmtRub(timesheetHourlyRub)} ₽/ч × ${fmtRub(hours)} ч = ${fmtRub(timesheetRub)} ₽. ` +
      `Доплата: ${fmtRub(topUpHourlyRub)} ₽/ч × ${fmtRub(hours)} ч = ${fmtRub(amountRub)} ₽.`;
  }

  const objectHourlyRateRub =
    input.rateUnit === "Hour" && input.ruleGuardRateCents != null
      ? Math.round((input.ruleGuardRateCents / 100) * 100) / 100
      : hours > 0
        ? Math.round(timesheetHourlyRub * 100) / 100
        : null;

  return {
    timesheetRub,
    timesheetHourlyRub,
    scheduleRegularHourlyRub,
    topUpHourlyRub,
    amountRub,
    paymentFormula: formula,
    objectHourlyRateRub,
  };
}

export function buildScheduleZeroPaymentFormula(shiftKindLabel: string, objectName: string, timeRange: string): string {
  return `${shiftKindLabel} на объекте «${objectName}», ${timeRange}. К оплате куратору: 0 ₽ (учёт для администратора).`;
}
