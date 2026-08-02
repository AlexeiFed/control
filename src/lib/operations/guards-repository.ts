import { isUndefinedColumnOrTableError, shiftsHaveIncidentColumns } from "../db/column-compat";
import { query } from "../db/pool";
import type {
  Guard,
  GuardEmploymentType,
  GuardLicenseType,
  GuardPosition,
  GuardStatus,
  IncidentCategory,
  ShiftKind,
} from "../scheduling/types";
import { normalizeShiftKindFromDb } from "../scheduling/types";
import { mapGuardLicenseFromDb } from "../scheduling/guard-profile";
import { isIncidentCompanionShiftLog } from "../scheduling/guard-service-history";
import { normalizeGuardFilters, type GuardFilterInput } from "./guard-filters";
import { toDateIsoKhabarovsk } from "../format/display-date";
import type { UniformCondition } from "../format/uniform";

/** Кэш наличия колонки `guards.phone` (старые локальные БД без миграций). */
let guardsHasPhoneColumnCache: boolean | undefined;

async function resolveGuardsHasPhoneColumn(): Promise<boolean> {
  if (guardsHasPhoneColumnCache !== undefined) return guardsHasPhoneColumnCache;
  try {
    const rows = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'guards'
            AND column_name = 'phone'
        ) AS exists
      `,
    );
    guardsHasPhoneColumnCache = rows[0]?.exists === true;
  } catch {
    guardsHasPhoneColumnCache = false;
  }
  return guardsHasPhoneColumnCache;
}

export type GuardsPhoneSelectMode = "aliased" | "direct";

/** Фрагмент для SELECT: `g.phone` / `phone` или литерал, если колонки ещё нет. */
export async function getGuardsPhoneSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<"g.phone" | "phone" | "''::text AS phone"> {
  const has = await resolveGuardsHasPhoneColumn();
  if (!has) return "''::text AS phone";
  return mode === "aliased" ? "g.phone" : "phone";
}

/** Кэш наличия колонки `guards.has_car`. */
let guardsHasCarColumnCache: boolean | undefined;

async function resolveGuardsHasCarColumn(): Promise<boolean> {
  if (guardsHasCarColumnCache !== undefined) return guardsHasCarColumnCache;
  try {
    const rows = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'guards'
            AND column_name = 'has_car'
        ) AS exists
      `,
    );
    guardsHasCarColumnCache = rows[0]?.exists === true;
  } catch {
    guardsHasCarColumnCache = false;
  }
  return guardsHasCarColumnCache;
}

export type GuardsHasCarSelectMode = "aliased" | "direct";

/** Фрагмент для SELECT: `g.has_car` / `has_car` или `false`, если колонки ещё нет. */
export async function getGuardsHasCarSelect(
  mode: GuardsHasCarSelectMode = "aliased",
): Promise<"g.has_car" | "has_car" | "false AS has_car"> {
  const has = await resolveGuardsHasCarColumn();
  if (!has) return "false AS has_car";
  return mode === "aliased" ? "g.has_car" : "has_car";
}

export async function guardsHasCarColumn(): Promise<boolean> {
  return resolveGuardsHasCarColumn();
}

const guardOptionalColumnCache = new Map<string, boolean>();

async function resolveGuardsOptionalColumn(columnName: string): Promise<boolean> {
  const cached = guardOptionalColumnCache.get(columnName);
  if (cached !== undefined) return cached;
  try {
    const rows = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'guards'
            AND column_name = $1
        ) AS exists
      `,
      [columnName],
    );
    const exists = rows[0]?.exists === true;
    guardOptionalColumnCache.set(columnName, exists);
    return exists;
  } catch {
    guardOptionalColumnCache.set(columnName, false);
    return false;
  }
}

export async function getGuardsContactPhoneSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<"g.contact_phone" | "contact_phone" | "''::text AS contact_phone"> {
  const has = await resolveGuardsOptionalColumn("contact_phone");
  if (!has) return "''::text AS contact_phone";
  return mode === "aliased" ? "g.contact_phone" : "contact_phone";
}

export async function getGuardsUniformSizeSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<"g.uniform_size" | "uniform_size" | "NULL::smallint AS uniform_size"> {
  const has = await resolveGuardsOptionalColumn("uniform_size");
  if (!has) return "NULL::smallint AS uniform_size";
  return mode === "aliased" ? "g.uniform_size" : "uniform_size";
}

export async function getGuardsUniformHeightSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<"g.uniform_height" | "uniform_height" | "NULL::smallint AS uniform_height"> {
  const has = await resolveGuardsOptionalColumn("uniform_height");
  if (!has) return "NULL::smallint AS uniform_height";
  return mode === "aliased" ? "g.uniform_height" : "uniform_height";
}

/** Фрагмент SELECT для выдачи формы (4 колонки); при отсутствии колонок — безопасные дефолты. */
export async function getGuardsUniformIssuedSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<string> {
  const has = await resolveGuardsOptionalColumn("uniform_issued");
  if (!has) {
    return [
      "false AS uniform_issued",
      "NULL::date AS uniform_issued_on",
      "NULL::text AS uniform_condition",
      "NULL::text AS uniform_note",
    ].join(",\n          ");
  }
  if (mode === "aliased") {
    return [
      "g.uniform_issued",
      "g.uniform_issued_on::text AS uniform_issued_on",
      "g.uniform_condition",
      "g.uniform_note",
    ].join(",\n          ");
  }
  return [
    "uniform_issued",
    "uniform_issued_on::text AS uniform_issued_on",
    "uniform_condition",
    "uniform_note",
  ].join(",\n          ");
}

export async function getGuardsBirthDateSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<"g.birth_date::text AS birth_date" | "birth_date::text AS birth_date" | "NULL::text AS birth_date"> {
  const has = await resolveGuardsOptionalColumn("birth_date");
  if (!has) return "NULL::text AS birth_date";
  return mode === "aliased" ? "g.birth_date::text AS birth_date" : "birth_date::text AS birth_date";
}

export async function getGuardsMiddleNameSelect(
  mode: GuardsPhoneSelectMode = "aliased",
): Promise<"g.middle_name" | "middle_name" | "''::text AS middle_name"> {
  const has = await resolveGuardsOptionalColumn("middle_name");
  if (!has) return "''::text AS middle_name";
  return mode === "aliased" ? "g.middle_name" : "middle_name";
}

export type GuardListRow = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  status: GuardStatus;
  dismissedOn: string | null;
  birthDate: string | null;
  phone: string;
  contactPhone: string;
  uniformSize: number | null;
  uniformHeight: number | null;
  uniformIssued: boolean;
  uniformIssuedOn: string | null;
  uniformCondition: UniformCondition | null;
  uniformNote: string | null;
  position: GuardPosition;
  licenseType: GuardLicenseType | null;
  licenseGrade: number | null;
  licenseValidUntil: string | null;
  employmentType: GuardEmploymentType;
  employedOn: string | null;
  medicalCommissionPassedOn: string | null;
  periodicCheckPassedOn: string | null;
  personalCardAssignedOn: string | null;
  isTrainee: boolean;
  traineeUntil: string | null;
  hasCar: boolean;
  /** `is_trainee` и дата окончания в прошлом — подсветка в UI. */
  traineeExpired: boolean;
  objectIds: string[];
  objectNames: string[];
  weekShiftCount: number;
  weekHours: number;
};

type GuardRow = {
  id: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  status: GuardStatus;
  dismissed_on: string | null;
  birth_date: string | null;
  phone: string;
  contact_phone: string;
  uniform_size: number | null;
  uniform_height: number | null;
  uniform_issued: boolean;
  uniform_issued_on: string | null;
  uniform_condition: string | null;
  uniform_note: string | null;
  position: GuardPosition;
  license_type: string | null;
  license_grade: number | null;
  license_valid_until: string | null;
  employment_type: GuardEmploymentType;
  employed_on: string | null;
  medical_commission_passed_on: string | null;
  periodic_check_passed_on: string | null;
  personal_card_assigned_on: string | null;
  is_trainee: boolean;
  trainee_until: string | null;
  has_car: boolean;
  object_ids: string[] | null;
  object_names: string[] | null;
  week_shift_count: string;
  week_minutes: string;
};

export type GuardComplianceInput = {
  medicalCommissionPassedOn: string | null;
  periodicCheckPassedOn: string | null;
  personalCardAssignedOn: string | null;
  employedOn: string | null;
  licenseGrade: number | null;
  licenseValidUntil: string | null;
};

export const emptyGuardCompliance: GuardComplianceInput = {
  medicalCommissionPassedOn: null,
  periodicCheckPassedOn: null,
  personalCardAssignedOn: null,
  employedOn: null,
  licenseGrade: null,
  licenseValidUntil: null,
};

export type CreateGuardInput = {
  firstName: string;
  middleName: string;
  lastName: string;
  status: GuardStatus;
  dismissedOn?: string | null;
  phone: string;
  contactPhone: string;
  uniformSize: number | null;
  uniformHeight: number | null;
  uniformIssued: boolean;
  uniformIssuedOn: string | null;
  uniformCondition: UniformCondition | null;
  uniformNote: string | null;
  position: GuardPosition;
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType;
  isTrainee: boolean;
  traineeUntil: string | null;
  hasCar: boolean;
  birthDate?: string | null;
  objectIds?: string[];
  compliance: GuardComplianceInput;
};

export type UpdateGuardProfileInput = {
  guardId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  phone: string;
  contactPhone: string;
  uniformSize: number | null;
  uniformHeight: number | null;
  uniformIssued: boolean;
  uniformIssuedOn: string | null;
  uniformCondition: UniformCondition | null;
  uniformNote: string | null;
  position: GuardPosition;
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType;
  isTrainee: boolean;
  traineeUntil: string | null;
  hasCar: boolean;
  birthDate?: string | null;
  compliance: GuardComplianceInput;
};

export type ComplianceReminderRow = {
  guardId: string;
  firstName: string;
  lastName: string;
  passedOn: string;
  expiryIso: string;
};

export type PeriodicCheckReminderKind = "expiry" | "personal_card";

export type PeriodicCheckReminderRow = {
  guardId: string;
  firstName: string;
  lastName: string;
  passedOn: string;
  expiryIso: string;
  periodicCheckPassedOn: string | null;
  personalCardAssignedOn: string | null;
  reminderKind: PeriodicCheckReminderKind;
};

async function saveGuardBirthDate(guardId: string, birthDate: string | null | undefined): Promise<void> {
  const has = await resolveGuardsOptionalColumn("birth_date");
  if (!has) return;
  await query(`UPDATE guards SET birth_date = $2::date WHERE id = $1`, [guardId, birthDate ?? null]);
}

async function saveGuardMiddleName(guardId: string, middleName: string | null | undefined): Promise<void> {
  const has = await resolveGuardsOptionalColumn("middle_name");
  if (!has) return;
  await query(`UPDATE guards SET middle_name = $2 WHERE id = $1`, [guardId, (middleName ?? "").trim()]);
}

async function saveGuardUniformIssuedFields(
  guardId: string,
  input: {
    uniformIssued: boolean;
    uniformIssuedOn: string | null;
    uniformCondition: UniformCondition | null;
    uniformNote: string | null;
  },
): Promise<void> {
  const has = await resolveGuardsOptionalColumn("uniform_issued");
  if (!has) return;
  await query(
    `
      UPDATE guards
      SET
        uniform_issued = $2,
        uniform_issued_on = $3::date,
        uniform_condition = $4,
        uniform_note = $5
      WHERE id = $1
    `,
    [
      guardId,
      input.uniformIssued,
      input.uniformIssuedOn,
      input.uniformCondition,
      input.uniformNote,
    ],
  );
}

async function saveGuardComplianceFields(
  guardId: string,
  employmentType: GuardEmploymentType,
  licenseType: GuardLicenseType | null,
  compliance: GuardComplianceInput,
): Promise<void> {
  const has = await resolveGuardsOptionalColumn("periodic_check_passed_on");
  if (!has) return;

  const newEmployedOn = employmentType === "Employed" ? compliance.employedOn : null;

  await query(
    `
      UPDATE guards
      SET
        medical_commission_passed_on = $2::date,
        periodic_check_passed_on = $3::date,
        personal_card_assigned_on = $4::date,
        employed_on = $5::date,
        license_grade = $6,
        license_valid_until = $7::date
      WHERE id = $1
    `,
    [
      guardId,
      compliance.medicalCommissionPassedOn,
      compliance.periodicCheckPassedOn,
      compliance.personalCardAssignedOn,
      newEmployedOn,
      licenseType === "Licensed" ? compliance.licenseGrade : null,
      licenseType === "Licensed" ? compliance.licenseValidUntil : null,
    ],
  );
}

export async function listGuardsForPeriodicCheckReminders(): Promise<PeriodicCheckReminderRow[]> {
  const hasPeriodic = await resolveGuardsOptionalColumn("periodic_check_passed_on");
  if (!hasPeriodic) return [];
  const hasPersonalCard = await resolveGuardsOptionalColumn("personal_card_assigned_on");

  const personalCardClause = hasPersonalCard
    ? `
        OR (
          g.personal_card_assigned_on IS NOT NULL
          AND g.periodic_check_passed_on IS NULL
          AND (g.personal_card_assigned_on + interval '30 days')::date <= CURRENT_DATE
        )`
    : "";

  const rows = await query<{
    id: string;
    first_name: string;
    last_name: string;
    periodic_check_passed_on: string | null;
    personal_card_assigned_on: string | null;
    reminder_kind: PeriodicCheckReminderKind;
    passed_on: string;
    expiry_iso: string;
  }>(
    `
      SELECT
        g.id,
        g.first_name,
        g.last_name,
        g.periodic_check_passed_on::text AS periodic_check_passed_on,
        g.personal_card_assigned_on::text AS personal_card_assigned_on,
        CASE
          WHEN g.periodic_check_passed_on IS NOT NULL THEN 'expiry'::text
          ELSE 'personal_card'::text
        END AS reminder_kind,
        COALESCE(
          g.periodic_check_passed_on::text,
          g.personal_card_assigned_on::text
        ) AS passed_on,
        CASE
          WHEN g.periodic_check_passed_on IS NOT NULL
            THEN (g.periodic_check_passed_on + interval '1 year')::date::text
          ELSE (g.personal_card_assigned_on + interval '30 days')::date::text
        END AS expiry_iso
      FROM guards g
      WHERE g.status = 'Active'
        AND (
          (
            g.periodic_check_passed_on IS NOT NULL
            AND (g.periodic_check_passed_on + interval '1 year')
              <= (CURRENT_DATE + interval '60 days')
          )
          ${personalCardClause}
        )
      ORDER BY expiry_iso ASC, g.last_name, g.first_name
    `,
  );

  return rows.map((row) => ({
    guardId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    passedOn: row.passed_on,
    periodicCheckPassedOn: row.periodic_check_passed_on,
    personalCardAssignedOn: row.personal_card_assigned_on,
    reminderKind: row.reminder_kind,
    expiryIso: row.expiry_iso,
  }));
}

export async function listGuardsForMedicalCommissionReminders(): Promise<ComplianceReminderRow[]> {
  const has = await resolveGuardsOptionalColumn("medical_commission_passed_on");
  if (!has) return [];

  const rows = await query<{
    id: string;
    first_name: string;
    last_name: string;
    medical_commission_passed_on: string;
    expiry_iso: string;
  }>(
    `
      SELECT
        g.id,
        g.first_name,
        g.last_name,
        g.medical_commission_passed_on::text AS medical_commission_passed_on,
        (g.medical_commission_passed_on + interval '1 year')::date::text AS expiry_iso
      FROM guards g
      WHERE g.medical_commission_passed_on IS NOT NULL
        AND g.status = 'Active'
        AND (g.medical_commission_passed_on + interval '1 year')
          <= (CURRENT_DATE + interval '60 days')
      ORDER BY (g.medical_commission_passed_on + interval '1 year') ASC, g.last_name, g.first_name
    `,
  );

  return rows.map((row) => ({
    guardId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    passedOn: row.medical_commission_passed_on,
    expiryIso: row.expiry_iso,
  }));
}

export type GuardBirthdayTodayRow = {
  guardId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  birthDate: string;
  ageYears: number;
};

/** Сегодня по календарю Хабаровска (UTC+10) — без IANA-имени (на macOS PG его часто нет). */
const KHABAROVSK_TODAY_DATE_SQL = `((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + interval '10 hours')::date`;

/** Охранники, у которых сегодня день рождения (календарь Хабаровск UTC+10). */
export async function listGuardsWithBirthdayToday(): Promise<GuardBirthdayTodayRow[]> {
  const hasBirthDate = await resolveGuardsOptionalColumn("birth_date");
  if (!hasBirthDate) return [];

  const hasMiddleName = await resolveGuardsOptionalColumn("middle_name");
  const middleNameSel = hasMiddleName ? "g.middle_name" : "''::text AS middle_name";

  const rows = await query<{
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    birth_date: string;
    age_years: number;
  }>(
    `
      SELECT
        g.id,
        g.first_name,
        g.last_name,
        ${middleNameSel},
        g.birth_date::text AS birth_date,
        (
          EXTRACT(YEAR FROM age(${KHABAROVSK_TODAY_DATE_SQL}, g.birth_date))
        )::int AS age_years
      FROM guards g
      WHERE g.birth_date IS NOT NULL
        AND g.status NOT IN ('Dismissed', 'Inactive')
        AND EXTRACT(MONTH FROM g.birth_date) =
          EXTRACT(MONTH FROM ${KHABAROVSK_TODAY_DATE_SQL})
        AND EXTRACT(DAY FROM g.birth_date) =
          EXTRACT(DAY FROM ${KHABAROVSK_TODAY_DATE_SQL})
      ORDER BY g.last_name, g.first_name, g.id
    `,
  );

  return rows.map((row) => ({
    guardId: row.id,
    firstName: row.first_name,
    middleName: row.middle_name ?? "",
    lastName: row.last_name,
    birthDate: row.birth_date,
    ageYears: row.age_years,
  }));
}

export type GuardShiftHistoryRow = {
  id: string;
  objectId: string;
  objectName: string;
  startsAt: Date;
  endsAt: Date;
  shiftKind: ShiftKind;
  isNoShow: boolean;
  incidentCategory: IncidentCategory | null;
  incidentRecordedAt: Date | null;
};

export type GuardServiceHistoryEntry =
  | {
      kind: "incident";
      id: string;
      at: Date;
      shiftId: string;
      objectName: string;
      shiftStartsAt: Date;
      shiftEndsAt: Date;
      category: IncidentCategory;
      comment: string;
      workedUntilAt: Date | null;
      replacementGuardName: string | null;
    }
  | {
      kind: "shift_log";
      id: string;
      at: Date;
      shiftId: string;
      objectName: string;
      shiftStartsAt: Date;
      shiftEndsAt: Date;
      incidentLevel: "Info" | "Warning" | "Critical";
      note: string;
    }
  | {
      kind: "replacement_duty";
      id: string;
      at: Date;
      shiftId: string;
      objectName: string;
      shiftStartsAt: Date;
      shiftEndsAt: Date;
      originalGuardName: string;
      category: IncidentCategory;
      comment: string;
    };

export async function listGuardServiceHistory(
  guardId: string,
  limit = 120,
): Promise<GuardServiceHistoryEntry[]> {
  const [incidents, logs, replacementDuties] = await Promise.all([
    query<{
      id: string;
      starts_at: string;
      ends_at: string;
      object_name: string;
      incident_recorded_at: string;
      incident_category: string | null;
      incident_comment: string | null;
      incident_worked_until_at: string | null;
      repl_first_name: string | null;
      repl_last_name: string | null;
    }>(
      `
        SELECT
          s.id,
          s.starts_at,
          s.ends_at,
          so.name AS object_name,
          s.incident_recorded_at,
          s.incident_category,
          s.incident_comment,
          s.incident_worked_until_at,
          rg.first_name AS repl_first_name,
          rg.last_name AS repl_last_name
        FROM shifts s
        INNER JOIN security_objects so ON so.id = s.object_id
        LEFT JOIN shifts rs ON rs.id = s.replaced_by_shift_id
        LEFT JOIN guards rg ON rg.id = rs.guard_id
        WHERE s.guard_id = $1
          AND s.incident_recorded_at IS NOT NULL
        ORDER BY s.incident_recorded_at DESC
        LIMIT 80
      `,
      [guardId],
    ),
    query<{
      id: string;
      created_at: string;
      note: string;
      incident_level: string;
      shift_id: string;
      starts_at: string;
      ends_at: string;
      object_name: string;
    }>(
      `
        SELECT
          l.id,
          l.created_at,
          l.note,
          l.incident_level,
          s.id AS shift_id,
          s.starts_at,
          s.ends_at,
          so.name AS object_name
        FROM shift_logs l
        INNER JOIN shifts s ON s.id = l.shift_id
        INNER JOIN security_objects so ON so.id = s.object_id
        WHERE s.guard_id = $1
          AND l.incident_level IN ('Info', 'Warning', 'Critical')
        ORDER BY l.created_at DESC
        LIMIT 80
      `,
      [guardId],
    ),
    query<{
      id: string;
      starts_at: string;
      ends_at: string;
      object_name: string;
      incident_recorded_at: string | null;
      incident_category: string | null;
      incident_comment: string | null;
      orig_first_name: string;
      orig_last_name: string;
    }>(
      `
        SELECT
          rs.id,
          rs.starts_at,
          rs.ends_at,
          so.name AS object_name,
          orig.incident_recorded_at,
          orig.incident_category,
          orig.incident_comment,
          og.first_name AS orig_first_name,
          og.last_name AS orig_last_name
        FROM shifts rs
        INNER JOIN shifts orig ON orig.replaced_by_shift_id = rs.id
        INNER JOIN security_objects so ON so.id = rs.object_id
        INNER JOIN guards og ON og.id = orig.guard_id
        WHERE rs.guard_id = $1
        ORDER BY COALESCE(orig.incident_recorded_at, rs.starts_at) DESC
        LIMIT 40
      `,
      [guardId],
    ),
  ]);

  const entries: GuardServiceHistoryEntry[] = [];
  const incidentsByShiftId = new Map<string, { category: IncidentCategory }>();

  for (const row of incidents) {
    const category = (row.incident_category as IncidentCategory | null) ?? "Other";
    incidentsByShiftId.set(row.id, { category });
    const replacementGuardName =
      row.repl_first_name || row.repl_last_name
        ? `${row.repl_last_name ?? ""} ${row.repl_first_name ?? ""}`.trim()
        : null;
    entries.push({
      kind: "incident",
      id: `incident:${row.id}`,
      at: new Date(row.incident_recorded_at),
      shiftId: row.id,
      objectName: row.object_name,
      shiftStartsAt: new Date(row.starts_at),
      shiftEndsAt: new Date(row.ends_at),
      category,
      comment: row.incident_comment?.trim() ?? "",
      workedUntilAt: row.incident_worked_until_at ? new Date(row.incident_worked_until_at) : null,
      replacementGuardName,
    });
  }

  for (const row of logs) {
    const level = row.incident_level;
    if (level !== "Info" && level !== "Warning" && level !== "Critical") continue;
    if (
      isIncidentCompanionShiftLog({
        shiftId: row.shift_id,
        note: row.note,
        incidentsByShiftId,
      })
    ) {
      continue;
    }
    entries.push({
      kind: "shift_log",
      id: `log:${row.id}`,
      at: new Date(row.created_at),
      shiftId: row.shift_id,
      objectName: row.object_name,
      shiftStartsAt: new Date(row.starts_at),
      shiftEndsAt: new Date(row.ends_at),
      incidentLevel: level,
      note: row.note.trim(),
    });
  }

  for (const row of replacementDuties) {
    const at = row.incident_recorded_at
      ? new Date(row.incident_recorded_at)
      : new Date(row.starts_at);
    entries.push({
      kind: "replacement_duty",
      id: `replacement:${row.id}`,
      at,
      shiftId: row.id,
      objectName: row.object_name,
      shiftStartsAt: new Date(row.starts_at),
      shiftEndsAt: new Date(row.ends_at),
      originalGuardName: `${row.orig_last_name} ${row.orig_first_name}`.trim(),
      category: (row.incident_category as IncidentCategory | null) ?? "Other",
      comment: row.incident_comment?.trim() ?? "",
    });
  }

  entries.sort((a, b) => b.at.getTime() - a.at.getTime());
  return entries.slice(0, limit);
}

export async function listGuards(filtersInput: GuardFilterInput = {}): Promise<GuardListRow[]> {
  const phoneSel = await getGuardsPhoneSelect("aliased");
  const contactPhoneSel = await getGuardsContactPhoneSelect("aliased");
  const uniformSizeSel = await getGuardsUniformSizeSelect("aliased");
  const uniformHeightSel = await getGuardsUniformHeightSelect("aliased");
  const uniformIssuedSel = await getGuardsUniformIssuedSelect("aliased");
  const birthDateSel = await getGuardsBirthDateSelect("aliased");
  const middleNameSel = await getGuardsMiddleNameSelect("aliased");
  const hasCarSel = await getGuardsHasCarSelect("aliased");
  const hasCompliance = await resolveGuardsOptionalColumn("periodic_check_passed_on");
  const licenseGradeSel = hasCompliance
    ? "g.license_grade AS license_grade"
    : "NULL::smallint AS license_grade";
  const licenseValidSel = hasCompliance
    ? "g.license_valid_until::text AS license_valid_until"
    : "NULL::text AS license_valid_until";
  const employedOnSel = hasCompliance
    ? "g.employed_on::text AS employed_on"
    : "NULL::text AS employed_on";
  const medicalCommissionSel = hasCompliance
    ? "g.medical_commission_passed_on::text AS medical_commission_passed_on"
    : "NULL::text AS medical_commission_passed_on";
  const periodicCheckSel = hasCompliance
    ? "g.periodic_check_passed_on::text AS periodic_check_passed_on"
    : "NULL::text AS periodic_check_passed_on";
  const personalCardSel = hasCompliance
    ? "g.personal_card_assigned_on::text AS personal_card_assigned_on"
    : "NULL::text AS personal_card_assigned_on";
  const hasDismissedOn = await resolveGuardsOptionalColumn("dismissed_on");
  const dismissedOnSel = hasDismissedOn
    ? "g.dismissed_on::text AS dismissed_on"
    : "NULL::text AS dismissed_on";
  const filters = normalizeGuardFilters(filtersInput);
  const conditions: string[] = [];
  const values: string[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`g.status = $${values.length}`);
  }

  if (filters.query) {
    values.push(`${filters.query}%`);
    const param = `$${values.length}`;
    conditions.push(`(g.first_name ILIKE ${param} OR g.last_name ILIKE ${param})`);
  }

  if (filters.objectId) {
    values.push(filters.objectId);
    conditions.push(`EXISTS (
      SELECT 1
      FROM guard_object_assignments goa_filter
      WHERE goa_filter.guard_id = g.id AND goa_filter.object_id = $${values.length}
    )`);
  }

  let rows: GuardRow[];
  try {
    rows = await query<GuardRow>(
      `
        SELECT
          g.id,
          g.first_name,
          ${middleNameSel},
          g.last_name,
          g.status,
          ${dismissedOnSel},
          ${birthDateSel},
          ${phoneSel},
          ${contactPhoneSel},
          ${uniformSizeSel},
          ${uniformHeightSel},
          ${uniformIssuedSel},
          g.position,
          g.license_type,
          ${licenseGradeSel},
          ${licenseValidSel},
          g.employment_type,
          ${employedOnSel},
          ${medicalCommissionSel},
          ${periodicCheckSel},
          ${personalCardSel},
          g.is_trainee,
          g.trainee_until::text AS trainee_until,
          ${hasCarSel},
          COALESCE(array_agg(so.id ORDER BY so.name) FILTER (WHERE so.id IS NOT NULL), '{}') AS object_ids,
          COALESCE(array_agg(so.name ORDER BY so.name) FILTER (WHERE so.id IS NOT NULL), '{}') AS object_names,
          COALESCE(ws.week_shift_count, 0)::text AS week_shift_count,
          COALESCE(ws.week_minutes, 0)::text AS week_minutes
        FROM guards g
        LEFT JOIN guard_object_assignments goa ON goa.guard_id = g.id
        LEFT JOIN security_objects so ON so.id = goa.object_id
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS week_shift_count,
            SUM(EXTRACT(EPOCH FROM (s.ends_at - s.starts_at)) / 60)::int AS week_minutes
          FROM shifts s
          WHERE s.guard_id = g.id
            AND s.ends_at > date_trunc('week', now())
            AND s.starts_at < date_trunc('week', now()) + interval '7 days'
        ) ws ON true
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
        GROUP BY g.id, ws.week_shift_count, ws.week_minutes
        ORDER BY g.last_name, g.first_name
      `,
      values,
    );
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;
    rows = await query<GuardRow>(
      `
        SELECT
          g.id,
          g.first_name,
          ${middleNameSel},
          g.last_name,
          g.status,
          ${dismissedOnSel},
          ${birthDateSel},
          ${phoneSel},
          ${contactPhoneSel},
          ${uniformSizeSel},
          ${uniformHeightSel},
          ${uniformIssuedSel},
          g.position,
          g.license_type,
          ${licenseGradeSel},
          ${licenseValidSel},
          g.employment_type,
          ${employedOnSel},
          ${medicalCommissionSel},
          ${periodicCheckSel},
          ${personalCardSel},
          g.is_trainee,
          g.trainee_until::text AS trainee_until,
          ${hasCarSel},
          COALESCE(array_agg(so.id ORDER BY so.name) FILTER (WHERE so.id IS NOT NULL), '{}') AS object_ids,
          COALESCE(array_agg(so.name ORDER BY so.name) FILTER (WHERE so.id IS NOT NULL), '{}') AS object_names,
          '0'::text AS week_shift_count,
          '0'::text AS week_minutes
        FROM guards g
        LEFT JOIN guard_object_assignments goa ON goa.guard_id = g.id
        LEFT JOIN security_objects so ON so.id = goa.object_id
        ${conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : ""}
        GROUP BY g.id
        ORDER BY g.last_name, g.first_name
      `,
      values,
    );
  }

  return rows.map(mapGuardRow);
}

/** Минимальный профиль охранника для назначения смен и чекбоксов объекта. */
export type GuardSchedulePickerRow = {
  id: string;
  firstName: string;
  lastName: string;
  status: GuardStatus;
  phone: string;
  position: GuardPosition;
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType;
  isTrainee: boolean;
  traineeUntil: string | null;
  hasCar: boolean;
};

type GuardSchedulePickerDbRow = {
  id: string;
  first_name: string;
  last_name: string;
  status: GuardStatus;
  phone: string;
  position: GuardPosition;
  license_type: GuardLicenseType | null;
  employment_type: GuardEmploymentType;
  is_trainee: boolean;
  trainee_until: string | null;
  has_car: boolean;
};

/** Быстрый список охранников без агрегаций смен и объектов (для пикеров графика). */
export async function listGuardsForSchedulePicker(): Promise<GuardSchedulePickerRow[]> {
  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const rows = await query<GuardSchedulePickerDbRow>(
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
        trainee_until::text AS trainee_until,
        ${hasCarSel}
      FROM guards
      WHERE status = 'Active'
      ORDER BY last_name, first_name
    `,
  );
  return rows.map(mapGuardSchedulePickerRow);
}

export async function listGuardsByIds(ids: readonly string[]): Promise<Guard[]> {
  if (ids.length === 0) return [];
  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const rows = await query<GuardSchedulePickerDbRow>(
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
        trainee_until::text AS trainee_until,
        ${hasCarSel}
      FROM guards
      WHERE id = ANY($1::uuid[])
    `,
    [[...ids]],
  );
  return rows.map((row) => ({
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
  }));
}

export async function listGuardDisplayNamesByIds(ids: ReadonlyArray<string>): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await query<{ id: string; first_name: string; last_name: string }>(
    `
      SELECT id, first_name, last_name
      FROM guards
      WHERE id = ANY($1::uuid[])
    `,
    [[...ids]],
  );
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.id] = `${row.last_name} ${row.first_name}`.trim();
  }
  return out;
}

export async function listGuardStatusesByIds(
  ids: ReadonlyArray<string>,
): Promise<Record<string, GuardStatus>> {
  if (ids.length === 0) return {};
  const rows = await query<{ id: string; status: GuardStatus }>(
    `
      SELECT id, status
      FROM guards
      WHERE id = ANY($1::uuid[])
    `,
    [[...ids]],
  );
  const out: Record<string, GuardStatus> = {};
  for (const row of rows) out[row.id] = row.status;
  return out;
}

export async function listGuardEmployedOnByIds(
  ids: ReadonlyArray<string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;

  const hasEmployedOn = await resolveGuardsOptionalColumn("employed_on");
  if (!hasEmployedOn) {
    for (const id of ids) out.set(id, null);
    return out;
  }

  const rows = await query<{ id: string; employed_on: string | null }>(
    `
      SELECT id, employed_on::text AS employed_on
      FROM guards
      WHERE id = ANY($1::uuid[])
    `,
    [[...ids]],
  );
  for (const id of ids) out.set(id, null);
  for (const row of rows) out.set(row.id, row.employed_on);
  return out;
}

export async function listGuardPersonalCardAssignedOnByIds(
  ids: ReadonlyArray<string>,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0) return out;

  const hasPersonalCard = await resolveGuardsOptionalColumn("personal_card_assigned_on");
  if (!hasPersonalCard) {
    for (const id of ids) out.set(id, null);
    return out;
  }

  const rows = await query<{ id: string; personal_card_assigned_on: string | null }>(
    `
      SELECT id, personal_card_assigned_on::text AS personal_card_assigned_on
      FROM guards
      WHERE id = ANY($1::uuid[])
    `,
    [[...ids]],
  );
  for (const id of ids) out.set(id, null);
  for (const row of rows) out.set(row.id, row.personal_card_assigned_on);
  return out;
}

function mapGuardSchedulePickerRow(row: GuardSchedulePickerDbRow): GuardSchedulePickerRow {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    status: row.status,
    phone: row.phone ?? "",
    position: row.position ?? "Guard",
    licenseType: row.license_type ?? null,
    employmentType: row.employment_type ?? "Unemployed",
    isTrainee: row.is_trainee ?? false,
    traineeUntil: row.trainee_until,
    hasCar: row.has_car ?? false,
  };
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

export async function createGuard(input: CreateGuardInput): Promise<string> {
  const hasCarCol = await guardsHasCarColumn();
  const hasContactPhone = await resolveGuardsOptionalColumn("contact_phone");
  const hasUniform = await resolveGuardsOptionalColumn("uniform_size");

  const rows = hasCarCol
    ? await query<{ id: string }>(
        hasContactPhone && hasUniform
          ? `
          INSERT INTO guards (
            first_name,
            last_name,
            status,
            phone,
            contact_phone,
            uniform_size,
            uniform_height,
            position,
            license_type,
            employment_type,
            is_trainee,
            trainee_until,
            has_car
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `
          : `
          INSERT INTO guards (
            first_name,
            last_name,
            status,
            phone,
            position,
            license_type,
            employment_type,
            is_trainee,
            trainee_until,
            has_car
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `,
        hasContactPhone && hasUniform
          ? [
              input.firstName.trim(),
              input.lastName.trim(),
              input.status,
              input.phone.trim(),
              input.contactPhone.trim(),
              input.uniformSize,
              input.uniformHeight,
              input.position,
              input.licenseType,
              input.employmentType,
              input.isTrainee,
              input.traineeUntil,
              input.hasCar,
            ]
          : [
              input.firstName.trim(),
              input.lastName.trim(),
              input.status,
              input.phone.trim(),
              input.position,
              input.licenseType,
              input.employmentType,
              input.isTrainee,
              input.traineeUntil,
              input.hasCar,
            ],
      )
    : await query<{ id: string }>(
        hasContactPhone && hasUniform
          ? `
          INSERT INTO guards (
            first_name,
            last_name,
            status,
            phone,
            contact_phone,
            uniform_size,
            uniform_height,
            position,
            license_type,
            employment_type,
            is_trainee,
            trainee_until
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING id
        `
          : `
          INSERT INTO guards (
            first_name,
            last_name,
            status,
            phone,
            position,
            license_type,
            employment_type,
            is_trainee,
            trainee_until
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
        `,
        hasContactPhone && hasUniform
          ? [
              input.firstName.trim(),
              input.lastName.trim(),
              input.status,
              input.phone.trim(),
              input.contactPhone.trim(),
              input.uniformSize,
              input.uniformHeight,
              input.position,
              input.licenseType,
              input.employmentType,
              input.isTrainee,
              input.traineeUntil,
            ]
          : [
              input.firstName.trim(),
              input.lastName.trim(),
              input.status,
              input.phone.trim(),
              input.position,
              input.licenseType,
              input.employmentType,
              input.isTrainee,
              input.traineeUntil,
            ],
      );
  const guardId = rows[0]?.id;

  if (!guardId) throw new Error("Не удалось создать охранника");

  if (input.objectIds?.length) {
    await setGuardObjects(guardId, input.objectIds);
  }

  await saveGuardComplianceFields(
    guardId,
    input.employmentType,
    input.licenseType,
    input.compliance,
  );
  await saveGuardBirthDate(guardId, input.birthDate);
  await saveGuardMiddleName(guardId, input.middleName);
  await saveGuardUniformIssuedFields(guardId, {
    uniformIssued: input.uniformIssued,
    uniformIssuedOn: input.uniformIssuedOn,
    uniformCondition: input.uniformCondition,
    uniformNote: input.uniformNote,
  });

  const dismissedOn = input.dismissedOn ?? null;
  if (input.status === "Dismissed" && dismissedOn) {
    await updateGuardStatus(guardId, "Dismissed", dismissedOn);
  }

  const { seedInitialProfilePeriodsForGuard } = await import("./guard-profile-periods-repository");
  await seedInitialProfilePeriodsForGuard({
    guardId,
    effectiveFrom: input.compliance.employedOn ?? toDateIsoKhabarovsk(new Date()),
    position: input.position,
    employmentType: input.employmentType,
    licenseType: input.licenseType ?? "None",
    isTrainee: input.isTrainee,
    traineeUntil: input.traineeUntil,
    createdBy: null,
  });

  const { syncGuardProfilePeriodsFromCompliance } = await import("./guard-profile-periods-repository");
  await syncGuardProfilePeriodsFromCompliance({
    guardId,
    licenseType: input.licenseType ?? "None",
    employmentType: input.employmentType,
    personalCardAssignedOn: input.compliance.personalCardAssignedOn,
    employedOn: input.compliance.employedOn,
  });

  return guardId;
}

export async function updateGuardStatus(
  guardId: string,
  status: GuardStatus,
  dismissedOn: string | null = null,
): Promise<void> {
  if (status === "Dismissed" && dismissedOn) {
    const { closeOpenProfilePeriodsOnDate, syncGuardProfileCacheFromPeriods } = await import(
      "./guard-profile-periods-repository"
    );
    await closeOpenProfilePeriodsOnDate(guardId, dismissedOn);
    await syncGuardProfileCacheFromPeriods(guardId, dismissedOn);
  }

  const hasDismissedOn = await resolveGuardsOptionalColumn("dismissed_on");
  if (hasDismissedOn) {
    await query(
      `
        UPDATE guards
        SET
          status = $2,
          dismissed_on = CASE WHEN $2 = 'Dismissed' THEN $3::date ELSE NULL END
        WHERE id = $1
      `,
      [guardId, status, status === "Dismissed" ? dismissedOn : null],
    );
    return;
  }
  await query(
    `
      UPDATE guards
      SET status = $2
      WHERE id = $1
    `,
    [guardId, status],
  );
}

export async function updateGuardProfile(input: UpdateGuardProfileInput): Promise<void> {
  const hasCarCol = await guardsHasCarColumn();
  const hasContactPhone = await resolveGuardsOptionalColumn("contact_phone");
  const hasUniform = await resolveGuardsOptionalColumn("uniform_size");

  if (hasCarCol && hasContactPhone && hasUniform) {
    await query(
      `
        UPDATE guards
        SET
          first_name = $2,
          last_name = $3,
          phone = $4,
          contact_phone = $5,
          uniform_size = $6,
          uniform_height = $7,
          position = $8,
          license_type = $9,
          employment_type = $10,
          is_trainee = $11,
          trainee_until = $12,
          has_car = $13
        WHERE id = $1
      `,
      [
        input.guardId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone.trim(),
        input.contactPhone.trim(),
        input.uniformSize,
        input.uniformHeight,
        input.position,
        input.licenseType,
        input.employmentType,
        input.isTrainee,
        input.traineeUntil,
        input.hasCar,
      ],
    );
  } else if (hasCarCol) {
    await query(
      `
        UPDATE guards
        SET
          first_name = $2,
          last_name = $3,
          phone = $4,
          position = $5,
          license_type = $6,
          employment_type = $7,
          is_trainee = $8,
          trainee_until = $9,
          has_car = $10
        WHERE id = $1
      `,
      [
        input.guardId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone.trim(),
        input.position,
        input.licenseType,
        input.employmentType,
        input.isTrainee,
        input.traineeUntil,
        input.hasCar,
      ],
    );
  } else if (hasContactPhone && hasUniform) {
    await query(
      `
        UPDATE guards
        SET
          first_name = $2,
          last_name = $3,
          phone = $4,
          contact_phone = $5,
          uniform_size = $6,
          uniform_height = $7,
          position = $8,
          license_type = $9,
          employment_type = $10,
          is_trainee = $11,
          trainee_until = $12
        WHERE id = $1
      `,
      [
        input.guardId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone.trim(),
        input.contactPhone.trim(),
        input.uniformSize,
        input.uniformHeight,
        input.position,
        input.licenseType,
        input.employmentType,
        input.isTrainee,
        input.traineeUntil,
      ],
    );
  } else {
    await query(
      `
        UPDATE guards
        SET
          first_name = $2,
          last_name = $3,
          phone = $4,
          position = $5,
          license_type = $6,
          employment_type = $7,
          is_trainee = $8,
          trainee_until = $9
        WHERE id = $1
      `,
      [
        input.guardId,
        input.firstName.trim(),
        input.lastName.trim(),
        input.phone.trim(),
        input.position,
        input.licenseType,
        input.employmentType,
        input.isTrainee,
        input.traineeUntil,
      ],
    );
  }

  await saveGuardComplianceFields(
    input.guardId,
    input.employmentType,
    input.licenseType,
    input.compliance,
  );
  const { syncGuardProfilePeriodsFromCompliance } = await import("./guard-profile-periods-repository");
  await syncGuardProfilePeriodsFromCompliance({
    guardId: input.guardId,
    licenseType: input.licenseType ?? "None",
    employmentType: input.employmentType,
    personalCardAssignedOn: input.compliance.personalCardAssignedOn,
    employedOn: input.compliance.employedOn,
  });
  await saveGuardBirthDate(input.guardId, input.birthDate);
  await saveGuardMiddleName(input.guardId, input.middleName);
  await saveGuardUniformIssuedFields(input.guardId, {
    uniformIssued: input.uniformIssued,
    uniformIssuedOn: input.uniformIssuedOn,
    uniformCondition: input.uniformCondition,
    uniformNote: input.uniformNote,
  });
}

export async function deleteGuard(guardId: string): Promise<void> {
  await query(
    `
      DELETE FROM guards
      WHERE id = $1
    `,
    [guardId],
  );
}

export async function assignGuardToObject(guardId: string, objectId: string): Promise<void> {
  await query(
    `
      INSERT INTO guard_object_assignments (guard_id, object_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `,
    [guardId, objectId],
  );
}

export async function unassignGuardFromObject(guardId: string, objectId: string): Promise<void> {
  await query(
    `
      DELETE FROM guard_object_assignments
      WHERE guard_id = $1 AND object_id = $2
    `,
    [guardId, objectId],
  );
}

export async function clearGuardObjects(guardId: string): Promise<void> {
  await query(
    `
      DELETE FROM guard_object_assignments
      WHERE guard_id = $1
    `,
    [guardId],
  );
}

export async function setGuardObjects(guardId: string, objectIds: string[]): Promise<void> {
  await clearGuardObjects(guardId);
  const unique = [...new Set(objectIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  await query(
    `
      INSERT INTO guard_object_assignments (guard_id, object_id)
      SELECT $1, unnest($2::uuid[])
      ON CONFLICT DO NOTHING
    `,
    [guardId, unique],
  );
}

/** @deprecated Используйте setGuardObjects — оставлено для совместимости. */
export async function setGuardObject(guardId: string, objectId: string | null): Promise<void> {
  await setGuardObjects(guardId, objectId ? [objectId] : []);
}

export async function listGuardObjectAssignments(
  guardId: string,
): Promise<{ objectIds: string[]; objectNames: string[] }> {
  const rows = await query<{ object_id: string; object_name: string }>(
    `
      SELECT goa.object_id, so.name AS object_name
      FROM guard_object_assignments goa
      JOIN security_objects so ON so.id = goa.object_id
      WHERE goa.guard_id = $1
      ORDER BY so.name
    `,
    [guardId],
  );
  return {
    objectIds: rows.map((row) => row.object_id),
    objectNames: rows.map((row) => row.object_name),
  };
}

/** Карта назначений охранник → объекты (для фильтров в пикере смен). */
export async function listGuardObjectIdsByGuardId(): Promise<Record<string, string[]>> {
  const rows = await query<{ guard_id: string; object_id: string }>(
    `
      SELECT guard_id, object_id
      FROM guard_object_assignments
    `,
  );
  const map: Record<string, string[]> = {};
  for (const row of rows) {
    (map[row.guard_id] ??= []).push(row.object_id);
  }
  return map;
}

export async function isGuardAssignedToObject(guardId: string, objectId: string): Promise<boolean> {
  const rows = await query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM guard_object_assignments
        WHERE guard_id = $1 AND object_id = $2
      ) AS exists
    `,
    [guardId, objectId],
  );
  return rows[0]?.exists === true;
}

export type GuardDetails = {
  id: string;
  firstName: string;
  middleName: string;
  lastName: string;
  status: GuardStatus;
  dismissedOn: string | null;
  birthDate: string | null;
  phone: string;
  contactPhone: string;
  uniformSize: number | null;
  uniformHeight: number | null;
  uniformIssued: boolean;
  uniformIssuedOn: string | null;
  uniformCondition: UniformCondition | null;
  uniformNote: string | null;
  position: GuardPosition;
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType;
  isTrainee: boolean;
  traineeUntil: string | null;
  hasCar: boolean;
  traineeExpired: boolean;
  medicalCommissionPassedOn: string | null;
  periodicCheckPassedOn: string | null;
  personalCardAssignedOn: string | null;
  employedOn: string | null;
  licenseGrade: number | null;
  licenseValidUntil: string | null;
  objects: Array<{ id: string; name: string }>;
};

export async function getGuardDetails(guardId: string): Promise<GuardDetails | null> {
  const [
    phoneSel,
    contactPhoneSel,
    uniformSizeSel,
    uniformHeightSel,
    uniformIssuedSel,
    birthDateSel,
    middleNameSel,
    hasCarSel,
    hasCompliance,
    hasDismissedOn,
  ] = await Promise.all([
    getGuardsPhoneSelect("aliased"),
    getGuardsContactPhoneSelect("aliased"),
    getGuardsUniformSizeSelect("aliased"),
    getGuardsUniformHeightSelect("aliased"),
    getGuardsUniformIssuedSelect("aliased"),
    getGuardsBirthDateSelect("aliased"),
    getGuardsMiddleNameSelect("aliased"),
    getGuardsHasCarSelect("aliased"),
    resolveGuardsOptionalColumn("periodic_check_passed_on"),
    resolveGuardsOptionalColumn("dismissed_on"),
  ]);
  const medicalCommissionSel = hasCompliance
    ? "g.medical_commission_passed_on::text AS medical_commission_passed_on"
    : "NULL::text AS medical_commission_passed_on";
  const periodicCheckSel = hasCompliance
    ? "g.periodic_check_passed_on::text AS periodic_check_passed_on"
    : "NULL::text AS periodic_check_passed_on";
  const personalCardSel = hasCompliance
    ? "g.personal_card_assigned_on::text AS personal_card_assigned_on"
    : "NULL::text AS personal_card_assigned_on";
  const employedOnSel = hasCompliance
    ? "g.employed_on::text AS employed_on"
    : "NULL::text AS employed_on";
  const licenseGradeSel = hasCompliance
    ? "g.license_grade AS license_grade"
    : "NULL::smallint AS license_grade";
  const licenseValidSel = hasCompliance
    ? "g.license_valid_until::text AS license_valid_until"
    : "NULL::text AS license_valid_until";
  const dismissedOnSel = hasDismissedOn
    ? "g.dismissed_on::text AS dismissed_on"
    : "NULL::text AS dismissed_on";
  const rows = await query<{
    id: string;
    first_name: string;
    middle_name: string;
    last_name: string;
    status: GuardStatus;
    dismissed_on: string | null;
    birth_date: string | null;
    phone: string;
    contact_phone: string;
    uniform_size: number | null;
    uniform_height: number | null;
    uniform_issued: boolean;
    uniform_issued_on: string | null;
    uniform_condition: string | null;
    uniform_note: string | null;
    position: GuardPosition;
    license_type: string | null;
    employment_type: GuardEmploymentType;
    is_trainee: boolean;
    trainee_until: string | null;
    has_car: boolean;
    medical_commission_passed_on: string | null;
    periodic_check_passed_on: string | null;
    personal_card_assigned_on: string | null;
    employed_on: string | null;
    license_grade: number | null;
    license_valid_until: string | null;
    object_id: string | null;
    object_name: string | null;
  }>(
    `
      SELECT
        g.id,
        g.first_name,
        ${middleNameSel},
        g.last_name,
        g.status,
        ${dismissedOnSel},
        ${birthDateSel},
        ${phoneSel},
        ${contactPhoneSel},
        ${uniformSizeSel},
        ${uniformHeightSel},
        ${uniformIssuedSel},
        g.position,
        g.license_type,
        g.employment_type,
        g.is_trainee,
        g.trainee_until::text AS trainee_until,
        ${hasCarSel},
        ${medicalCommissionSel},
        ${periodicCheckSel},
        ${personalCardSel},
        ${employedOnSel},
        ${licenseGradeSel},
        ${licenseValidSel},
        so.id AS object_id,
        so.name AS object_name
      FROM guards g
      LEFT JOIN guard_object_assignments goa ON goa.guard_id = g.id
      LEFT JOIN security_objects so ON so.id = goa.object_id
      WHERE g.id = $1
      ORDER BY so.name
    `,
    [guardId],
  );

  const first = rows[0];
  if (!first) return null;

  const traineeUntil = first.trainee_until;
  return {
    id: first.id,
    firstName: first.first_name,
    middleName: first.middle_name ?? "",
    lastName: first.last_name,
    status: first.status,
    dismissedOn: first.dismissed_on,
    birthDate: first.birth_date,
    phone: first.phone ?? "",
    contactPhone: first.contact_phone ?? "",
    uniformSize: first.uniform_size ?? null,
    uniformHeight: first.uniform_height ?? null,
    uniformIssued: first.uniform_issued ?? false,
    uniformIssuedOn: first.uniform_issued_on ?? null,
    uniformCondition:
      first.uniform_condition === "new" || first.uniform_condition === "used"
        ? first.uniform_condition
        : null,
    uniformNote: first.uniform_note ?? null,
    position: first.position ?? "Guard",
    licenseType: (first.license_type as GuardLicenseType | null) ?? null,
    employmentType: first.employment_type ?? "Unemployed",
    isTrainee: first.is_trainee ?? false,
    traineeUntil,
    hasCar: first.has_car ?? false,
    traineeExpired: isTraineeDateExpired(first.is_trainee, traineeUntil),
    medicalCommissionPassedOn: first.medical_commission_passed_on,
    periodicCheckPassedOn: first.periodic_check_passed_on,
    personalCardAssignedOn: first.personal_card_assigned_on,
    employedOn: first.employed_on,
    licenseGrade: first.license_grade,
    licenseValidUntil: first.license_valid_until,
    objects: rows
      .filter((row) => row.object_id && row.object_name)
      .map((row) => ({ id: row.object_id as string, name: row.object_name as string })),
  };
}

export async function listGuardShiftHistory(guardId: string, limit = 240): Promise<GuardShiftHistoryRow[]> {
  const hasIncidentCols = await shiftsHaveIncidentColumns();
  const rows = await query<{
    id: string;
    object_id: string;
    object_name: string;
    starts_at: string;
    ends_at: string;
    shift_kind: string | null;
    is_no_show: boolean | null;
    incident_category: string | null;
    incident_recorded_at: string | null;
  }>(
    `
      SELECT
        s.id,
        s.object_id,
        so.name AS object_name,
        s.starts_at,
        s.ends_at,
        s.shift_kind,
        s.is_no_show,
        ${
          hasIncidentCols
            ? "s.incident_category, s.incident_recorded_at"
            : "NULL::text AS incident_category, NULL::timestamptz AS incident_recorded_at"
        }
      FROM shifts s
      JOIN security_objects so ON so.id = s.object_id
      WHERE s.guard_id = $1
      ORDER BY s.starts_at DESC
      LIMIT $2
    `,
    [guardId, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    objectId: row.object_id,
    objectName: row.object_name,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    shiftKind: normalizeShiftKindFromDb(row.shift_kind),
    isNoShow: row.is_no_show === true,
    incidentCategory: (row.incident_category as IncidentCategory | null) ?? null,
    incidentRecordedAt: row.incident_recorded_at ? new Date(row.incident_recorded_at) : null,
  }));
}

function mapGuardRow(row: GuardRow): GuardListRow {
  const traineeUntil = row.trainee_until;
  return {
    id: row.id,
    firstName: row.first_name,
    middleName: row.middle_name ?? "",
    lastName: row.last_name,
    status: row.status,
    dismissedOn: row.dismissed_on,
    birthDate: row.birth_date,
    phone: row.phone ?? "",
    contactPhone: row.contact_phone ?? "",
    uniformSize: row.uniform_size ?? null,
    uniformHeight: row.uniform_height ?? null,
    uniformIssued: row.uniform_issued ?? false,
    uniformIssuedOn: row.uniform_issued_on ?? null,
    uniformCondition:
      row.uniform_condition === "new" || row.uniform_condition === "used"
        ? row.uniform_condition
        : null,
    uniformNote: row.uniform_note ?? null,
    position: row.position ?? "Guard",
    licenseType: (row.license_type as GuardLicenseType | null) ?? null,
    licenseGrade: row.license_grade ?? null,
    licenseValidUntil: row.license_valid_until,
    employmentType: row.employment_type ?? "Unemployed",
    employedOn: row.employed_on,
    medicalCommissionPassedOn: row.medical_commission_passed_on,
    periodicCheckPassedOn: row.periodic_check_passed_on,
    personalCardAssignedOn: row.personal_card_assigned_on,
    isTrainee: row.is_trainee ?? false,
    traineeUntil,
    hasCar: row.has_car ?? false,
    traineeExpired: isTraineeDateExpired(row.is_trainee, traineeUntil),
    objectIds: row.object_ids ?? [],
    objectNames: row.object_names ?? [],
    weekShiftCount: Number(row.week_shift_count),
    weekHours: Math.round((Number(row.week_minutes) / 60) * 10) / 10,
  };
}

function isTraineeDateExpired(isTrainee: boolean, traineeUntil: string | null): boolean {
  if (!isTrainee || !traineeUntil) return false;
  const today = toDateIsoKhabarovsk(new Date());
  return traineeUntil < today;
}
