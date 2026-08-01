import type { ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";
import { listObjectRateRulesForObjects } from "../operations/object-rate-rules-repository";
import { getGuardsHasCarSelect, getGuardsPhoneSelect } from "../operations/guards-repository";
import { buildGuardProfileResolver } from "../operations/guard-profile-periods-repository";
import { getKhabarovskComponents, toDateIsoKhabarovsk } from "../format/display-date";
import { mapGuardLicenseFromDb } from "../scheduling/guard-profile";
import type { Guard, GuardStatus, ShiftKind, Shift } from "../scheduling/types";
import { computeShiftRateBreakdown } from "./rate-calculator";
import { loadHolidayDateSetForLocalRange } from "./holiday-calendar";
import {
  findRateRuleById,
  guardMatchesRateRuleProfile,
  listManualSelectableRateRules,
  shiftNeedsManualRateRuleSelection,
} from "./shift-rate-selection";
import { query } from "../db/pool";

function formatHmKhabarovsk(date: Date): string {
  const kh = getKhabarovskComponents(date);
  return `${String(kh.hours).padStart(2, "0")}:${String(kh.minutes).padStart(2, "0")}`;
}

async function loadGuardForRates(guardId: string): Promise<Guard | null> {
  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const rows = await query<{
    id: string;
    first_name: string;
    last_name: string;
    status: GuardStatus;
    phone: string | null;
    position: Guard["position"];
    license_type: string | null;
    employment_type: Guard["employmentType"];
    is_trainee: boolean;
    trainee_until: string | null;
    has_car: boolean | null;
  }>(
    `
      SELECT
        id,
        first_name,
        last_name,
        status,
        ${phoneSel},
        position,
        license_type,
        employment_type,
        is_trainee,
        trainee_until,
        ${hasCarSel}
      FROM guards
      WHERE id = $1
    `,
    [guardId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    name: `${row.last_name} ${row.first_name}`.trim(),
    status: row.status,
    phone: row.phone ?? "",
    position: row.position ?? "Guard",
    licenseType: mapGuardLicenseFromDb(row.license_type),
    employmentType: row.employment_type ?? "Unemployed",
    isTrainee: row.is_trainee ?? false,
    traineeUntil: row.trainee_until ? new Date(`${row.trainee_until}T12:00:00+10:00`) : null,
    hasCar: row.has_car ?? false,
  };
}

/** Текущая карточка + периоды профиля на дату смены (ЛК/ТУ). */
async function loadGuardResolvedAtShiftDate(guardId: string, shiftDateIso: string): Promise<Guard | null> {
  const base = await loadGuardForRates(guardId);
  if (!base) return null;
  const resolver = await buildGuardProfileResolver([guardId]);
  return resolver.resolveGuardAt(base, shiftDateIso);
}

export type ResolveShiftRateRuleInput = {
  objectId: string;
  guardId: string;
  /** Если передан — должен уже быть resolveGuardAt(date), иначе подтянем сами. */
  guard?: Guard;
  shiftKind: ShiftKind;
  startsAt: Date;
  endsAt: Date;
  rateRuleId?: string | null;
  manualClientRateCents?: number | null;
  manualGuardRateCents?: number | null;
};

export async function resolveShiftSelectedRateRuleId(
  input: ResolveShiftRateRuleInput,
): Promise<string | null> {
  if (input.manualClientRateCents != null || input.manualGuardRateCents != null) {
    return null;
  }

  const shiftDateIso = toDateIsoKhabarovsk(input.startsAt);
  // Нельзя брать «текущий» профиль: иначе ТУ+ЛК сегодня матчит ставку, а табель
  // на дату смены (ещё без ЛК) даёт unpriced 0 ₽.
  const guard =
    input.guard ?? (await loadGuardResolvedAtShiftDate(input.guardId, shiftDateIso));
  if (!guard) throw new Error("Охранник не найден");

  const rules = await listObjectRateRulesForObjects([input.objectId]);
  if (rules.length === 0) return null;

  const holidayDates = await loadHolidayDateSetForLocalRange(input.startsAt, input.endsAt);
  const startHm = formatHmKhabarovsk(input.startsAt);
  const endHm = formatHmKhabarovsk(input.endsAt);

  const needsManual = shiftNeedsManualRateRuleSelection({
    objectId: input.objectId,
    guard,
    shiftKind: input.shiftKind,
    shiftDateIso,
    startTime: startHm,
    endTime: endHm,
    rules,
    holidayDates,
  });

  if (!needsManual) return null;

  let ruleId = input.rateRuleId?.trim() || null;
  if (!ruleId) {
    const { dayMatched, otherWeekdays } = listManualSelectableRateRules(
      rules,
      input.objectId,
      guard,
      input.shiftKind,
      shiftDateIso,
      holidayDates,
    );
    const candidates = [...dayMatched, ...otherWeekdays];
    if (candidates.length === 1) {
      ruleId = candidates[0]!.id;
    } else if (candidates.length === 0) {
      throw new Error("Нет подходящих ставок для этого охранника и интервала времени");
    } else {
      throw new Error("Выберите ставку для этого интервала времени");
    }
  }

  const rule = findRateRuleById(rules, ruleId);
  if (!rule || rule.objectId !== input.objectId) {
    throw new Error("Выбранная ставка не найдена для этого объекта");
  }

  if (!guardMatchesRateRuleProfile(rule, guard, input.shiftKind, shiftDateIso, holidayDates)) {
    throw new Error("Выбранная ставка не подходит для этого охранника");
  }

  const probe: Shift = {
    id: "probe",
    guardId: input.guardId,
    objectId: input.objectId,
    postId: null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    shiftKind: input.shiftKind,
    manualClientRateCents: null,
    manualGuardRateCents: null,
    manualRateUnit: null,
    manualRateReason: "",
    isNoShow: false,
    incidentCategory: null,
    incidentComment: "",
    incidentWorkedUntilAt: null,
    incidentRecordedAt: null,
    replacedByShiftId: null,
    selectedRateRuleId: ruleId,
  };

  const breakdown = computeShiftRateBreakdown(probe, guard, rules, holidayDates);
  if (breakdown.unpricedMinutes > 0) {
    throw new Error("Не удалось применить выбранную ставку к интервалу смены");
  }

  return ruleId;
}

export function assertRateRuleAllowedForGuard(
  rule: ObjectRateRuleRecord,
  objectId: string,
  guard: Guard,
  shiftKind: ShiftKind,
  shiftDateIso: string,
  holidayDates: ReadonlySet<string>,
): void {
  if (rule.objectId !== objectId) {
    throw new Error("Ставка принадлежит другому объекту");
  }
  if (!guardMatchesRateRuleProfile(rule, guard, shiftKind, shiftDateIso, holidayDates)) {
    throw new Error("Ставка не подходит для выбранного охранника");
  }
}
