import { query } from "../db/pool";
import { billableShiftMinutes, computeShiftRateBreakdown } from "../rates/rate-calculator";
import { DEFAULT_SHIFT_TIMEZONE, loadHolidayDateSetForLocalRange } from "../rates/holiday-calendar";
import { buildSegmentContext, findBestMatchingRule } from "../rates/rate-matching";
import { listObjectRateRules } from "../operations/object-rate-rules-repository";
import { ensureCuratorJournalForGuard } from "../operations/curators-guards-link";
import { getCuratorTariffs } from "../operations/curators-repository";
import { resolveGuardPositionAt, resolveGuardProfileAt } from "../operations/guard-profile-periods-repository";
import { mapGuardLicenseFromDb } from "../scheduling/guard-profile";
import type { Guard, Shift, ShiftKind } from "../scheduling/types";
import { normalizeShiftKindFromDb } from "../scheduling/types";
import { formatCompactTimeRangeLocal, toDateIsoKhabarovsk } from "../format/display-date";
import { shiftKindLabels } from "../operations/status-labels";
import type { CuratorWorkType } from "./work-entry-amount";
import { computeScheduleRegularTopUp, buildCuratorScheduleTopUpExcludedFormula, isCuratorScheduleTopUpExcluded } from "./schedule-top-up";

type ShiftSyncRow = {
  id: string;
  guard_id: string;
  object_id: string;
  post_id: string | null;
  starts_at: string;
  ends_at: string;
  shift_kind: string;
  manual_client_rate_cents: number | null;
  manual_guard_rate_cents: number | null;
  manual_rate_unit: string | null;
  manual_rate_reason: string;
  is_no_show: boolean;
  incident_worked_until_at: string | null;
  first_name: string;
  last_name: string;
  position: string;
  license_type: string | null;
  employment_type: string;
  is_trainee: boolean;
  trainee_until: string | null;
  status: string;
  object_name: string;
  selected_rate_rule_id: string | null;
};

function mapShiftRow(row: ShiftSyncRow): { shift: Shift; guard: Guard; objectName: string } {
  const shift: Shift = {
    id: row.id,
    guardId: row.guard_id,
    objectId: row.object_id,
    postId: row.post_id ?? null,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    shiftKind: normalizeShiftKindFromDb(row.shift_kind),
    manualClientRateCents: row.manual_client_rate_cents,
    manualGuardRateCents: row.manual_guard_rate_cents,
    manualRateUnit: row.manual_rate_unit as Shift["manualRateUnit"],
    manualRateReason: row.manual_rate_reason ?? "",
    isNoShow: row.is_no_show,
    incidentCategory: null,
    incidentComment: "",
    incidentWorkedUntilAt: row.incident_worked_until_at ? new Date(row.incident_worked_until_at) : null,
    incidentRecordedAt: null,
    replacedByShiftId: null,
    selectedRateRuleId: row.selected_rate_rule_id ?? null,
  };
  const guard: Guard = {
    id: row.guard_id,
    name: `${row.last_name} ${row.first_name}`.trim(),
    status: row.status as Guard["status"],
    phone: "",
    position: (row.position as Guard["position"]) ?? "Guard",
    licenseType: mapGuardLicenseFromDb(row.license_type),
    employmentType: row.employment_type as Guard["employmentType"],
    isTrainee: row.is_trainee ?? false,
    traineeUntil: row.trainee_until ? new Date(`${row.trainee_until}T12:00:00+10:00`) : null,
    hasCar: false,
  };
  return { shift, guard, objectName: row.object_name };
}

export async function resolveCuratorIdForGuard(
  guardId: string,
  firstName: string,
  lastName: string,
): Promise<string> {
  return ensureCuratorJournalForGuard(guardId, firstName, lastName);
}

async function loadShiftForSync(shiftId: string): Promise<ShiftSyncRow | null> {
  const rows = await query<ShiftSyncRow>(
    `
      SELECT
        s.id,
        s.guard_id,
        s.object_id,
        s.post_id,
        s.starts_at::text,
        s.ends_at::text,
        s.shift_kind,
        s.manual_client_rate_cents,
        s.manual_guard_rate_cents,
        s.manual_rate_unit,
        s.manual_rate_reason,
        s.is_no_show,
        s.incident_worked_until_at::text,
        s.selected_rate_rule_id,
        g.first_name,
        g.last_name,
        g.position,
        g.license_type,
        g.employment_type,
        g.is_trainee,
        g.trainee_until::text,
        g.status,
        o.name AS object_name
      FROM shifts s
      JOIN guards g ON g.id = s.guard_id
      JOIN security_objects o ON o.id = s.object_id
      WHERE s.id = $1::uuid
    `,
    [shiftId],
  );
  return rows[0] ?? null;
}

function workTypeForShiftKind(kind: ShiftKind): CuratorWorkType {
  if (kind === "Reinforcement") return "ScheduleReinforcement";
  if (kind === "RapidResponse") return "ScheduleRapidResponse";
  return "ScheduleRegular";
}

/** Синхронизирует одну смену с журналом кураторов. */
export async function syncCuratorEntryFromShift(shiftId: string, actorUserId: string): Promise<void> {
  const row = await loadShiftForSync(shiftId);
  if (!row) return;

  const { shift, guard: baseGuard, objectName } = mapShiftRow(row);
  const workDate = toDateIsoKhabarovsk(shift.startsAt);
  const positionAtShift = await resolveGuardPositionAt(row.guard_id, workDate);
  const profileAtShift = await resolveGuardProfileAt(row.guard_id, workDate);
  const guard = {
    ...baseGuard,
    position: profileAtShift.position,
    employmentType: profileAtShift.employmentType,
    licenseType: profileAtShift.licenseType,
    isTrainee: profileAtShift.isTrainee,
    traineeUntil: profileAtShift.traineeUntil
      ? new Date(`${profileAtShift.traineeUntil}T12:00:00+10:00`)
      : null,
  };

  if (positionAtShift !== "Curator") {
    await query(`DELETE FROM curator_work_entries WHERE shift_id = $1::uuid`, [shiftId]);
    return;
  }

  const minutes = billableShiftMinutes(shift);
  const hours = Math.round((minutes / 60) * 100) / 100;
  const timeRange = formatCompactTimeRangeLocal(shift.startsAt, shift.endsAt);
  const curatorId = await resolveCuratorIdForGuard(row.guard_id, row.first_name, row.last_name);

  const lockedRows = await query<{ is_admin_locked: boolean }>(
    `SELECT is_admin_locked FROM curator_work_entries WHERE shift_id = $1::uuid`,
    [shiftId],
  );
  const isLocked = lockedRows[0]?.is_admin_locked ?? false;

  const workType = workTypeForShiftKind(shift.shiftKind);
  let amountRub = 0;
  let paymentFormula = "";
  let description = "";
  let objectHourlyRateRub: number | null = null;
  let ruleName: string | null = null;
  let customHourlyRate: number | null = null;

  if (minutes <= 0) {
    await query(`DELETE FROM curator_work_entries WHERE shift_id = $1::uuid`, [shiftId]);
    return;
  }

  const rules = await listObjectRateRules(shift.objectId);
  const holidayDates = await loadHolidayDateSetForLocalRange(shift.startsAt, shift.endsAt);
  const breakdown = computeShiftRateBreakdown(shift, guard, rules, holidayDates, DEFAULT_SHIFT_TIMEZONE);
  const tariffs = await getCuratorTariffs();
  const ctx = buildSegmentContext(shift.startsAt, guard, shift, holidayDates, DEFAULT_SHIFT_TIMEZONE);
  const bestRule = findBestMatchingRule(rules, ctx);
  ruleName = bestRule?.name ?? null;

  const topUp = computeScheduleRegularTopUp({
    timesheetGuardRub: breakdown.guardAmountCents / 100,
    hours,
    scheduleRegularHourlyRub: tariffs.scheduleRegularHourlyRub,
    ruleName,
    rateUnit: bestRule?.rateUnit ?? null,
    ruleGuardRateCents: bestRule?.guardRateCents ?? null,
  });

  const topUpExcluded = isCuratorScheduleTopUpExcluded({
    lastName: row.last_name,
    firstName: row.first_name,
    objectName,
  });

  const kindLabel =
    shift.shiftKind === "Regular" ? "Обычная смена" : shiftKindLabels[shift.shiftKind];
  description = `${kindLabel} · «${objectName}» · ${timeRange}`;

  if (!isLocked) {
    if (topUpExcluded) {
      amountRub = 0;
      paymentFormula = buildCuratorScheduleTopUpExcludedFormula({
        objectName,
        timesheetRub: topUp.timesheetRub,
        hours,
      });
      objectHourlyRateRub = topUp.objectHourlyRateRub;
    } else {
      amountRub = topUp.amountRub;
      paymentFormula = topUp.paymentFormula;
      objectHourlyRateRub = topUp.objectHourlyRateRub;
    }
  } else {
    const locked = await query<{
      amount_rub: string;
      payment_formula: string;
      custom_hourly_rate: string | null;
      object_hourly_rate_rub: string | null;
    }>(
      `
        SELECT amount_rub::text, payment_formula, custom_hourly_rate::text, object_hourly_rate_rub::text
        FROM curator_work_entries WHERE shift_id = $1::uuid
      `,
      [shiftId],
    );
    amountRub = Number(locked[0]?.amount_rub ?? topUp.amountRub);
    paymentFormula = locked[0]?.payment_formula ?? topUp.paymentFormula;
    customHourlyRate =
      locked[0]?.custom_hourly_rate == null ? null : Number(locked[0].custom_hourly_rate);
    objectHourlyRateRub =
      locked[0]?.object_hourly_rate_rub == null
        ? topUp.objectHourlyRateRub
        : Number(locked[0].object_hourly_rate_rub);
  }

  await query(
    `
      INSERT INTO curator_work_entries (
        curator_id,
        work_date,
        work_type,
        hours,
        amount_rub,
        created_by_user_id,
        is_base_included,
        custom_hourly_rate,
        shift_id,
        object_id,
        description,
        payment_formula,
        rule_name,
        object_hourly_rate_rub,
        is_admin_locked
      )
      VALUES (
        $1, $2::date, $3, $4, $5, $6, true, $7,
        $8::uuid, $9::uuid, $10, $11, $12, $13, false
      )
      ON CONFLICT (shift_id) DO UPDATE SET
        curator_id = EXCLUDED.curator_id,
        work_date = EXCLUDED.work_date,
        work_type = EXCLUDED.work_type,
        hours = EXCLUDED.hours,
        amount_rub = CASE
          WHEN curator_work_entries.is_admin_locked THEN curator_work_entries.amount_rub
          ELSE EXCLUDED.amount_rub
        END,
        custom_hourly_rate = CASE
          WHEN curator_work_entries.is_admin_locked THEN curator_work_entries.custom_hourly_rate
          ELSE EXCLUDED.custom_hourly_rate
        END,
        description = EXCLUDED.description,
        payment_formula = CASE
          WHEN curator_work_entries.is_admin_locked THEN curator_work_entries.payment_formula
          ELSE EXCLUDED.payment_formula
        END,
        rule_name = EXCLUDED.rule_name,
        object_hourly_rate_rub = CASE
          WHEN curator_work_entries.is_admin_locked THEN curator_work_entries.object_hourly_rate_rub
          ELSE EXCLUDED.object_hourly_rate_rub
        END,
        object_id = EXCLUDED.object_id,
        updated_at = now()
    `,
    [
      curatorId,
      workDate,
      workType,
      hours,
      amountRub,
      actorUserId,
      customHourlyRate,
      shiftId,
      shift.objectId,
      description,
      paymentFormula,
      ruleName,
      objectHourlyRateRub,
    ],
  );
}

export async function syncCuratorEntryFromShiftSafe(shiftId: string, actorUserId: string): Promise<void> {
  try {
    await syncCuratorEntryFromShift(shiftId, actorUserId);
  } catch (error) {
    console.error("[curator-sync] shift", shiftId, error);
  }
}

/** Пересчёт журнала кураторов для смен с исключённой автодоплатой. */
export async function resyncCuratorTopUpExclusionShifts(actorUserId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `
      SELECT s.id
      FROM shifts s
      JOIN guards g ON g.id = s.guard_id
      JOIN security_objects o ON o.id = s.object_id
      WHERE g.position = 'Curator'
        AND lower(trim(g.last_name)) = lower(trim('Коваленко'))
        AND lower(trim(g.first_name)) = lower(trim('Денис'))
        AND lower(o.name) LIKE '%культура классика%'
      ORDER BY s.starts_at ASC
    `,
  );
  for (const row of rows) {
    await syncCuratorEntryFromShift(row.id, actorUserId);
  }
  return rows.length;
}

export async function resyncCuratorTopUpExclusionShiftsSafe(actorUserId = "deploy-sync"): Promise<number> {
  try {
    return await resyncCuratorTopUpExclusionShifts(actorUserId);
  } catch (error) {
    console.error("[curator-sync] top-up exclusions", error);
    return 0;
  }
}

/** Бэкфилл смен кураторов с даты (включительно). */
export async function backfillCuratorShiftEntries(fromDateIso: string, actorUserId: string): Promise<number> {
  const rows = await query<{ id: string }>(
    `
      SELECT s.id
      FROM shifts s
      JOIN guards g ON g.id = s.guard_id
      WHERE g.position = 'Curator'
        AND s.starts_at >= $1::date
      ORDER BY s.starts_at ASC
    `,
    [fromDateIso],
  );
  for (const row of rows) {
    await syncCuratorEntryFromShift(row.id, actorUserId);
  }
  return rows.length;
}
