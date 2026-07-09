import { isUndefinedColumnOrTableError, tableColumnExists } from "../db/column-compat";
import { getDbPool, query } from "../db/pool";
import { prioritiesForDisplayOrder } from "./object-rate-rules-priority";
import type { GuardEmploymentType, GuardLicenseType, GuardPosition, RateUnit, ShiftKind } from "../scheduling/types";
import { normalizeShiftKindFromDb } from "../scheduling/types";

export type ObjectRateRuleRecord = {
  id: string;
  objectId: string;
  name: string;
  priority: number;
  daysOfWeek: number[] | null;
  isHoliday: boolean | null;
  shiftKind: ShiftKind | null;
  startsAt: string | null;
  endsAt: string | null;
  position: GuardPosition | null;
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType | null;
  isTrainee: boolean | null;
  clientRateCents: number;
  guardRateCents: number;
  rateUnit: RateUnit;
  effectiveFrom: string;
  effectiveTo: string | null;
};

type DbRow = {
  id: string;
  object_id: string;
  name: string;
  priority: number;
  days_of_week: number[] | null;
  is_holiday: boolean | null;
  shift_kind: string | null;
  starts_at: string | null;
  ends_at: string | null;
  position: string | null;
  license_type: string | null;
  employment_type: string | null;
  is_trainee: boolean | null;
  client_rate_cents: number;
  guard_rate_cents: number;
  rate_unit: string;
  effective_from: string;
  effective_to: string | null;
};

async function getObjectRateRulesDaysSelect(): Promise<string> {
  if (await tableColumnExists("object_rate_rules", "days_of_week")) {
    return "days_of_week";
  }
  if (await tableColumnExists("object_rate_rules", "day_of_week")) {
    return "CASE WHEN day_of_week IS NOT NULL THEN ARRAY[day_of_week] ELSE NULL END AS days_of_week";
  }
  return "NULL::int[] AS days_of_week";
}

type ObjectRateRulesDaysWriteMode = "days_of_week" | "day_of_week" | "none";

async function getObjectRateRulesDaysWriteMode(): Promise<ObjectRateRulesDaysWriteMode> {
  if (await tableColumnExists("object_rate_rules", "days_of_week")) return "days_of_week";
  if (await tableColumnExists("object_rate_rules", "day_of_week")) return "day_of_week";
  return "none";
}

function daysOfWeekForLegacyColumn(daysOfWeek: number[] | null): number | null {
  if (!daysOfWeek?.length) return null;
  return daysOfWeek[0] ?? null;
}

/** Нормализует массив дней из БД: пустой массив = «любой день». */
export function normalizeDaysOfWeek(value: number[] | null | undefined): number[] | null {
  if (value == null || value.length === 0) return null;
  return [...new Set(value)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
}

function mapRow(row: DbRow): ObjectRateRuleRecord {
  return {
    id: row.id,
    objectId: row.object_id,
    name: row.name,
    priority: row.priority,
    daysOfWeek: normalizeDaysOfWeek(row.days_of_week),
    isHoliday: row.is_holiday,
    shiftKind: row.shift_kind == null ? null : normalizeShiftKindFromDb(row.shift_kind),
    startsAt: formatTimeForUi(row.starts_at),
    endsAt: formatTimeForUi(row.ends_at),
    position: (row.position as GuardPosition | null) ?? null,
    licenseType: (row.license_type as GuardLicenseType | null) ?? null,
    employmentType: (row.employment_type as GuardEmploymentType | null) ?? null,
    isTrainee: row.is_trainee,
    clientRateCents: row.client_rate_cents,
    guardRateCents: row.guard_rate_cents,
    rateUnit: row.rate_unit as RateUnit,
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
  };
}

/** HH:mm для `<input type="time">` и матчинга ставок. */
export function formatTimeForUi(value: string | null): string | null {
  if (!value) return null;
  const s = String(value);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]!.padStart(2, "0")}:${m[2]}`;
}

export async function listObjectRateRules(objectId: string): Promise<ObjectRateRuleRecord[]> {
  try {
    const daysSel = await getObjectRateRulesDaysSelect();
    const rows = await query<DbRow>(
      `
        SELECT
          id,
          object_id,
          name,
          priority,
          ${daysSel},
          is_holiday,
          shift_kind,
          starts_at::text,
          ends_at::text,
          position,
          license_type,
          employment_type,
          is_trainee,
          client_rate_cents,
          guard_rate_cents,
          rate_unit,
          effective_from::text,
          effective_to::text
        FROM object_rate_rules
        WHERE object_id = $1
        ORDER BY priority DESC, name ASC
      `,
      [objectId],
    );
    return rows.map(mapRow);
  } catch (error) {
    if (!isUndefinedColumnOrTableError(error)) throw error;
    return [];
  }
}

export async function listObjectRateRulesForObjects(objectIds: string[]): Promise<ObjectRateRuleRecord[]> {
  if (objectIds.length === 0) return [];
  try {
    const daysSel = await getObjectRateRulesDaysSelect();
    const rows = await query<DbRow>(
      `
        SELECT
          id,
          object_id,
          name,
          priority,
          ${daysSel},
          is_holiday,
          shift_kind,
          starts_at::text,
          ends_at::text,
          position,
          license_type,
          employment_type,
          is_trainee,
          client_rate_cents,
          guard_rate_cents,
          rate_unit,
          effective_from::text,
          effective_to::text
        FROM object_rate_rules
        WHERE object_id = ANY($1::uuid[])
        ORDER BY object_id, priority DESC, name ASC
      `,
      [objectIds],
    );
    return rows.map(mapRow);
  } catch (error) {
    if (!isUndefinedColumnOrTableError(error)) throw error;
    return [];
  }
}

export type CreateObjectRateRuleInput = {
  objectId: string;
  name: string;
  priority: number;
  daysOfWeek: number[] | null;
  isHoliday: boolean | null;
  shiftKind: ShiftKind | null;
  startsAt: string | null;
  endsAt: string | null;
  position: GuardPosition | null;
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType | null;
  isTrainee: boolean | null;
  clientRateCents: number;
  guardRateCents: number;
  rateUnit: RateUnit;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export async function createObjectRateRule(input: CreateObjectRateRuleInput): Promise<string> {
  const daysMode = await getObjectRateRulesDaysWriteMode();
  const daysColumn = daysMode === "none" ? null : daysMode;
  const daysValue =
    daysMode === "day_of_week" ? daysOfWeekForLegacyColumn(input.daysOfWeek) : input.daysOfWeek;

  const rows = await query<{ id: string }>(
    daysColumn
      ? `
      INSERT INTO object_rate_rules (
        object_id,
        name,
        priority,
        ${daysColumn},
        is_holiday,
        shift_kind,
        starts_at,
        ends_at,
        position,
        license_type,
        employment_type,
        is_trainee,
        client_rate_cents,
        guard_rate_cents,
        rate_unit,
        effective_from,
        effective_to
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::time, $8::time,
        $9, $10, $11, $12,
        $13, $14, $15, $16::date, $17::date
      )
      RETURNING id
    `
      : `
      INSERT INTO object_rate_rules (
        object_id,
        name,
        priority,
        is_holiday,
        shift_kind,
        starts_at,
        ends_at,
        position,
        license_type,
        employment_type,
        is_trainee,
        client_rate_cents,
        guard_rate_cents,
        rate_unit,
        effective_from,
        effective_to
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6::time, $7::time,
        $8, $9, $10, $11,
        $12, $13, $14, $15::date, $16::date
      )
      RETURNING id
    `,
    daysColumn
      ? [
          input.objectId,
          input.name.trim(),
          input.priority,
          daysValue,
          input.isHoliday,
          input.shiftKind,
          input.startsAt,
          input.endsAt,
          input.position,
          input.licenseType,
          input.employmentType,
          input.isTrainee,
          input.clientRateCents,
          input.guardRateCents,
          input.rateUnit,
          input.effectiveFrom,
          input.effectiveTo,
        ]
      : [
          input.objectId,
          input.name.trim(),
          input.priority,
          input.isHoliday,
          input.shiftKind,
          input.startsAt,
          input.endsAt,
          input.position,
          input.licenseType,
          input.employmentType,
          input.isTrainee,
          input.clientRateCents,
          input.guardRateCents,
          input.rateUnit,
          input.effectiveFrom,
          input.effectiveTo,
        ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Не удалось создать правило ставки");
  return id;
}

export async function updateObjectRateRule(
  ruleId: string,
  input: CreateObjectRateRuleInput,
): Promise<void> {
  const daysMode = await getObjectRateRulesDaysWriteMode();
  const daysValue =
    daysMode === "day_of_week" ? daysOfWeekForLegacyColumn(input.daysOfWeek) : input.daysOfWeek;

  if (daysMode === "days_of_week") {
    await query(
      `
        UPDATE object_rate_rules
        SET
          object_id = $2,
          name = $3,
          priority = $4,
          days_of_week = $5,
          is_holiday = $6,
          shift_kind = $7,
          starts_at = $8::time,
          ends_at = $9::time,
          position = $10,
          license_type = $11,
          employment_type = $12,
          is_trainee = $13,
          client_rate_cents = $14,
          guard_rate_cents = $15,
          rate_unit = $16,
          effective_from = $17::date,
          effective_to = $18::date
        WHERE id = $1
      `,
      [
        ruleId,
        input.objectId,
        input.name.trim(),
        input.priority,
        daysValue,
        input.isHoliday,
        input.shiftKind,
        input.startsAt,
        input.endsAt,
        input.position,
        input.licenseType,
        input.employmentType,
        input.isTrainee,
        input.clientRateCents,
        input.guardRateCents,
        input.rateUnit,
        input.effectiveFrom,
        input.effectiveTo,
      ],
    );
    return;
  }

  if (daysMode === "day_of_week") {
    await query(
      `
        UPDATE object_rate_rules
        SET
          object_id = $2,
          name = $3,
          priority = $4,
          day_of_week = $5,
          is_holiday = $6,
          shift_kind = $7,
          starts_at = $8::time,
          ends_at = $9::time,
          position = $10,
          license_type = $11,
          employment_type = $12,
          is_trainee = $13,
          client_rate_cents = $14,
          guard_rate_cents = $15,
          rate_unit = $16,
          effective_from = $17::date,
          effective_to = $18::date
        WHERE id = $1
      `,
      [
        ruleId,
        input.objectId,
        input.name.trim(),
        input.priority,
        daysValue,
        input.isHoliday,
        input.shiftKind,
        input.startsAt,
        input.endsAt,
        input.position,
        input.licenseType,
        input.employmentType,
        input.isTrainee,
        input.clientRateCents,
        input.guardRateCents,
        input.rateUnit,
        input.effectiveFrom,
        input.effectiveTo,
      ],
    );
    return;
  }

  await query(
    `
      UPDATE object_rate_rules
      SET
        object_id = $2,
        name = $3,
        priority = $4,
        is_holiday = $5,
        shift_kind = $6,
        starts_at = $7::time,
        ends_at = $8::time,
        position = $9,
        license_type = $10,
        employment_type = $11,
        is_trainee = $12,
        client_rate_cents = $13,
        guard_rate_cents = $14,
        rate_unit = $15,
        effective_from = $16::date,
        effective_to = $17::date
      WHERE id = $1
    `,
    [
      ruleId,
      input.objectId,
      input.name.trim(),
      input.priority,
      input.isHoliday,
      input.shiftKind,
      input.startsAt,
      input.endsAt,
      input.position,
      input.licenseType,
      input.employmentType,
      input.isTrainee,
      input.clientRateCents,
      input.guardRateCents,
      input.rateUnit,
      input.effectiveFrom,
      input.effectiveTo,
    ],
  );
}

export async function deleteObjectRateRule(ruleId: string): Promise<void> {
  await query(`DELETE FROM object_rate_rules WHERE id = $1`, [ruleId]);
}

export async function reorderObjectRateRules(objectId: string, orderedRuleIds: readonly string[]): Promise<void> {
  const existing = await listObjectRateRules(objectId);
  if (orderedRuleIds.length !== existing.length) {
    throw new Error("Нужно передать все правила объекта в новом порядке");
  }

  const existingIds = new Set(existing.map((rule) => rule.id));
  if (!orderedRuleIds.every((id) => existingIds.has(id))) {
    throw new Error("Некорректный список правил для сортировки");
  }

  const priorities = prioritiesForDisplayOrder(orderedRuleIds.length);
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let index = 0; index < orderedRuleIds.length; index++) {
      await client.query(
        `UPDATE object_rate_rules SET priority = $2 WHERE id = $1::uuid AND object_id = $3::uuid`,
        [orderedRuleIds[index], priorities[index], objectId],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
