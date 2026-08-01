import { dayBeforeIso } from "./profile-periods";
import type { GuardEmploymentType, GuardLicenseType } from "../scheduling/types";

export type DatedProfileSegment<T> = {
  effectiveFrom: string;
  effectiveTo: string | null;
  value: T;
};

export function resolveInitialProfileFromIso(input: {
  createdAtIso: string;
  existingPeriodStarts: readonly string[];
  personalCardAssignedOn: string | null;
  employedOn: string | null;
}): string {
  const candidates = [
    input.createdAtIso.slice(0, 10),
    ...input.existingPeriodStarts,
    ...(input.personalCardAssignedOn ? [input.personalCardAssignedOn] : []),
    ...(input.employedOn ? [input.employedOn] : []),
  ];
  return candidates.sort()[0] ?? input.createdAtIso.slice(0, 10);
}

/**
 * Периоды для матчинга правила ставки «У» (удостоверение + ЛК).
 * Дата начала — столбец personal_card_assigned_on; до этой даты = Б/У.
 * Флаг «У» на карточке сам по себе период не включает.
 */
export function buildLicensePeriodSegments(input: {
  initialFrom: string;
  personalCardAssignedOn: string | null;
}): DatedProfileSegment<GuardLicenseType>[] {
  const lkFrom = input.personalCardAssignedOn;

  if (lkFrom && lkFrom > input.initialFrom) {
    return [
      { effectiveFrom: input.initialFrom, effectiveTo: dayBeforeIso(lkFrom), value: "None" },
      { effectiveFrom: lkFrom, effectiveTo: null, value: "Licensed" },
    ];
  }

  if (lkFrom && lkFrom <= input.initialFrom) {
    return [{ effectiveFrom: input.initialFrom, effectiveTo: null, value: "Licensed" }];
  }

  return [{ effectiveFrom: input.initialFrom, effectiveTo: null, value: "None" }];
}

export function buildEmploymentPeriodSegments(input: {
  initialFrom: string;
  employmentType: GuardEmploymentType;
  employedOn: string | null;
}): DatedProfileSegment<GuardEmploymentType>[] {
  const employed = input.employmentType === "Employed";
  const employedFrom = input.employedOn;

  if (employed && employedFrom && employedFrom > input.initialFrom) {
    return [
      { effectiveFrom: input.initialFrom, effectiveTo: dayBeforeIso(employedFrom), value: "Unemployed" },
      { effectiveFrom: employedFrom, effectiveTo: null, value: "Employed" },
    ];
  }

  return [
    {
      effectiveFrom: input.initialFrom,
      effectiveTo: null,
      value: employed ? "Employed" : "Unemployed",
    },
  ];
}
