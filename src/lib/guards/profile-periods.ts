import { addDaysToIsoDate, isoDateFromDateOrNull, parseIsoDateKhabarovskOrNull } from "../format/display-date";
import type {
  Guard,
  GuardEmploymentType,
  GuardLicenseType,
  GuardPosition,
} from "../scheduling/types";
import { mapGuardLicenseFromDb } from "../scheduling/guard-profile";

export type GuardProfilePeriodKind = "position" | "employment" | "trainee" | "license";

export type GuardProfilePeriodRecord = {
  id: string;
  guardId: string;
  periodKind: GuardProfilePeriodKind;
  effectiveFrom: string;
  effectiveTo: string | null;
  position: GuardPosition | null;
  employmentType: GuardEmploymentType | null;
  isTrainee: boolean | null;
  traineeUntil: string | null;
  licenseType: GuardLicenseType | null;
  note: string;
  createdBy: string | null;
  createdAt: string;
};

export type ResolvedGuardProfile = {
  position: GuardPosition;
  employmentType: GuardEmploymentType;
  licenseType: GuardLicenseType;
  isTrainee: boolean;
  traineeUntil: string | null;
};

function normalizeTraineeUntilIso(
  periodValue: string | null | undefined,
  guardValue: Date | null,
): string | null {
  if (periodValue && parseIsoDateKhabarovskOrNull(periodValue)) {
    return periodValue.trim();
  }
  return isoDateFromDateOrNull(guardValue);
}

export function dateInProfilePeriod(dateIso: string, from: string, to: string | null): boolean {
  if (dateIso < from) return false;
  if (to && dateIso > to) return false;
  return true;
}

export function periodsOverlap(
  a: { effectiveFrom: string; effectiveTo: string | null },
  b: { effectiveFrom: string; effectiveTo: string | null },
): boolean {
  const aEnd = a.effectiveTo ?? "9999-12-31";
  const bEnd = b.effectiveTo ?? "9999-12-31";
  return a.effectiveFrom <= bEnd && b.effectiveFrom <= aEnd;
}

function pickActivePeriod(
  periods: readonly GuardProfilePeriodRecord[],
  dateIso: string,
): GuardProfilePeriodRecord | null {
  const matching = periods.filter((p) => dateInProfilePeriod(dateIso, p.effectiveFrom, p.effectiveTo));
  if (matching.length === 0) return null;
  matching.sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || a.id.localeCompare(b.id));
  return matching[0] ?? null;
}

export function resolveGuardProfileFromPeriods(
  guard: Guard,
  dateIso: string,
  periods: readonly GuardProfilePeriodRecord[],
): ResolvedGuardProfile & { guard: Guard } {
  const byKind = new Map<GuardProfilePeriodKind, GuardProfilePeriodRecord[]>();
  for (const p of periods) {
    if (p.guardId !== guard.id) continue;
    const list = byKind.get(p.periodKind) ?? [];
    list.push(p);
    byKind.set(p.periodKind, list);
  }

  const positionPeriod = pickActivePeriod(byKind.get("position") ?? [], dateIso);
  const employmentPeriod = pickActivePeriod(byKind.get("employment") ?? [], dateIso);
  const traineePeriod = pickActivePeriod(byKind.get("trainee") ?? [], dateIso);
  const licensePeriod = pickActivePeriod(byKind.get("license") ?? [], dateIso);

  const position = positionPeriod?.position ?? guard.position;
  const employmentType = employmentPeriod?.employmentType ?? guard.employmentType;
  const licenseType = mapGuardLicenseFromDb(licensePeriod?.licenseType ?? guard.licenseType);
  const isTrainee = traineePeriod?.isTrainee ?? guard.isTrainee;
  let traineeUntil = normalizeTraineeUntilIso(traineePeriod?.traineeUntil, guard.traineeUntil);

  const traineeActive =
    isTrainee && (!traineeUntil || dateIso <= traineeUntil);

  const resolved: Guard = {
    ...guard,
    position,
    employmentType,
    licenseType,
    isTrainee: traineeActive,
    traineeUntil: parseIsoDateKhabarovskOrNull(traineeUntil),
  };

  return {
    guard: resolved,
    position,
    employmentType,
    licenseType,
    isTrainee: traineeActive,
    traineeUntil,
  };
}

export class GuardProfileResolver {
  private readonly byGuardId = new Map<string, GuardProfilePeriodRecord[]>();

  constructor(periods: readonly GuardProfilePeriodRecord[]) {
    for (const period of periods) {
      const list = this.byGuardId.get(period.guardId) ?? [];
      list.push(period);
      this.byGuardId.set(period.guardId, list);
    }
  }

  resolveGuardAt(guard: Guard, dateIso: string): Guard {
    const periods = this.byGuardId.get(guard.id) ?? [];
    return resolveGuardProfileFromPeriods(guard, dateIso, periods).guard;
  }

  findOverlapWarnings(
    guardId: string,
    kind: GuardProfilePeriodKind,
    effectiveFrom: string,
    effectiveTo: string | null,
    excludeId?: string,
  ): string[] {
    const periods = (this.byGuardId.get(guardId) ?? []).filter(
      (p) => p.periodKind === kind && p.id !== excludeId,
    );
    const candidate = { effectiveFrom, effectiveTo };
    const warnings: string[] = [];
    for (const p of periods) {
      // Игнорируем стандартный последовательный переход (когда предыдущий период начался раньше и является бессрочным)
      if (p.effectiveFrom < effectiveFrom && p.effectiveTo === null) {
        continue;
      }
      if (periodsOverlap(candidate, p)) {
        warnings.push(
          `Пересечение с периодом ${p.effectiveFrom}${p.effectiveTo ? ` — ${p.effectiveTo}` : " — …"}`,
        );
      }
    }
    return warnings;
  }
}

export function dayBeforeIso(dateIso: string): string {
  return addDaysToIsoDate(dateIso, -1);
}

export function dayAfterIso(dateIso: string): string {
  return addDaysToIsoDate(dateIso, 1);
}
