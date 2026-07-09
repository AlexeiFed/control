import { unstable_cache } from "next/cache";
import { isUndefinedColumnOrTableError, tableColumnExists } from "../db/column-compat";
import { query } from "../db/pool";
import { toDateIsoKhabarovsk } from "../format/display-date";
import {
  dayAfterIso,
  dayBeforeIso,
  GuardProfilePeriodKind,
  GuardProfilePeriodRecord,
  GuardProfileResolver,
  resolveGuardProfileFromPeriods,
} from "../guards/profile-periods";
import {
  buildEmploymentPeriodSegments,
  buildLicensePeriodSegments,
  resolveInitialProfileFromIso,
} from "../guards/profile-period-sync";
import { ensureCuratorJournalForGuard } from "./curators-guards-link";
import type { GuardEmploymentType, GuardLicenseType, GuardPosition } from "../scheduling/types";

type PeriodRow = {
  id: string;
  guard_id: string;
  period_kind: GuardProfilePeriodKind;
  effective_from: string;
  effective_to: string | null;
  position: GuardPosition | null;
  employment_type: GuardEmploymentType | null;
  is_trainee: boolean | null;
  trainee_until: string | null;
  license_type: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
};

function mapPeriodRow(row: PeriodRow): GuardProfilePeriodRecord {
  return {
    id: row.id,
    guardId: row.guard_id,
    periodKind: row.period_kind,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    position: row.position,
    employmentType: row.employment_type,
    isTrainee: row.is_trainee,
    traineeUntil: row.trainee_until,
    licenseType: (row.license_type as GuardLicenseType | null) ?? null,
    note: row.note ?? "",
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function seedInitialProfilePeriodsForGuard(input: {
  guardId: string;
  effectiveFrom: string;
  position: GuardPosition;
  employmentType: GuardEmploymentType;
  licenseType: GuardLicenseType;
  isTrainee: boolean;
  traineeUntil: string | null;
  createdBy: string | null;
}): Promise<void> {
  const kinds: Array<{
    kind: GuardProfilePeriodKind;
    position?: GuardPosition;
    employmentType?: GuardEmploymentType;
    licenseType?: GuardLicenseType;
    isTrainee?: boolean;
    traineeUntil?: string | null;
  }> = [
    { kind: "position", position: input.position },
    { kind: "employment", employmentType: input.employmentType },
    { kind: "trainee", isTrainee: input.isTrainee, traineeUntil: input.traineeUntil },
    { kind: "license", licenseType: input.licenseType },
  ];

  for (const item of kinds) {
    await query(
      `
        INSERT INTO guard_profile_periods (
          guard_id, period_kind, effective_from,
          position, employment_type, is_trainee, trainee_until, license_type, created_by
        )
        SELECT $1, $2, $3::date, $4, $5, $6, $7::date, $8, $9
        WHERE NOT EXISTS (
          SELECT 1 FROM guard_profile_periods
          WHERE guard_id = $1 AND period_kind = $2
        )
      `,
      [
        input.guardId,
        item.kind,
        input.effectiveFrom,
        item.position ?? null,
        item.employmentType ?? null,
        item.isTrainee ?? null,
        item.traineeUntil ?? null,
        item.licenseType ?? null,
        input.createdBy,
      ],
    );
  }
}

export async function listGuardProfilePeriods(guardId: string): Promise<GuardProfilePeriodRecord[]> {
  const rows = await query<PeriodRow>(
    `
      SELECT
        id, guard_id, period_kind,
        effective_from::text, effective_to::text,
        position, employment_type, is_trainee, trainee_until::text,
        license_type, note, created_by, created_at::text
      FROM guard_profile_periods
      WHERE guard_id = $1::uuid
      ORDER BY effective_from DESC, period_kind ASC, created_at DESC
    `,
    [guardId],
  );
  return rows.map(mapPeriodRow);
}

export async function listProfilePeriodsForGuards(guardIds: string[]): Promise<GuardProfilePeriodRecord[]> {
  if (guardIds.length === 0) return [];
  const rows = await query<PeriodRow>(
    `
      SELECT
        id, guard_id, period_kind,
        effective_from::text, effective_to::text,
        position, employment_type, is_trainee, trainee_until::text,
        license_type, note, created_by, created_at::text
      FROM guard_profile_periods
      WHERE guard_id = ANY($1::uuid[])
    `,
    [guardIds],
  );
  return rows.map(mapPeriodRow);
}

/** Все периоды профилей в кеше: таблица маленькая (≈4 строки на охранника),
 * поэтому грузим целиком и фильтруем в памяти — у timesheet/scheduler 0 запросов к БД на тёплом кеше.
 * Инвалидируется теми же тегами, что и снапшоты (revalidateTag при правках охранников/смен). */
const loadAllProfilePeriodsCached = unstable_cache(
  async (): Promise<GuardProfilePeriodRecord[]> => {
    const rows = await query<PeriodRow>(
      `
        SELECT
          id, guard_id, period_kind,
          effective_from::text, effective_to::text,
          position, employment_type, is_trainee, trainee_until::text,
          license_type, note, created_by, created_at::text
        FROM guard_profile_periods
      `,
    );
    return rows.map(mapPeriodRow);
  },
  ["guard-profile-periods:all:v1"],
  { tags: ["timesheet", "scheduler", "guards", "directory"], revalidate: 300 },
);

export async function buildGuardProfileResolver(guardIds: string[]): Promise<GuardProfileResolver> {
  if (guardIds.length === 0) return new GuardProfileResolver([]);
  try {
    const all = await loadAllProfilePeriodsCached();
    const idSet = new Set(guardIds);
    return new GuardProfileResolver(all.filter((period) => idSet.has(period.guardId)));
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return new GuardProfileResolver([]);
    throw error;
  }
}

async function getGuardBasics(guardId: string): Promise<{
  firstName: string;
  lastName: string;
  position: GuardPosition;
  employmentType: GuardEmploymentType;
  licenseType: GuardLicenseType | null;
  isTrainee: boolean;
  traineeUntil: string | null;
} | null> {
  const rows = await query<{
    first_name: string;
    last_name: string;
    position: GuardPosition;
    employment_type: GuardEmploymentType;
    license_type: string | null;
    is_trainee: boolean;
    trainee_until: string | null;
  }>(
    `
      SELECT first_name, last_name, position, employment_type, license_type, is_trainee, trainee_until::text
      FROM guards WHERE id = $1::uuid
    `,
    [guardId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    firstName: row.first_name,
    lastName: row.last_name,
    position: row.position ?? "Guard",
    employmentType: row.employment_type ?? "Unemployed",
    licenseType: row.license_type as GuardLicenseType | null,
    isTrainee: row.is_trainee ?? false,
    traineeUntil: row.trainee_until,
  };
}

export async function syncGuardProfileCacheFromPeriods(guardId: string, asOfDate?: string): Promise<void> {
  const basics = await getGuardBasics(guardId);
  if (!basics) return;
  const dateIso = asOfDate ?? toDateIsoKhabarovsk(new Date());
  const periods = await listGuardProfilePeriods(guardId);
  const resolved = resolveGuardProfileFromPeriods(
    {
      id: guardId,
      name: `${basics.lastName} ${basics.firstName}`.trim(),
      status: "Active",
      phone: "",
      position: basics.position,
      licenseType: basics.licenseType,
      employmentType: basics.employmentType,
      isTrainee: basics.isTrainee,
      traineeUntil: basics.traineeUntil ? new Date(`${basics.traineeUntil}T12:00:00+10:00`) : null,
      hasCar: false,
    },
    dateIso,
    periods,
  );

  await query(
    `
      UPDATE guards
      SET
        position = $2,
        license_type = $3,
        employment_type = $4,
        is_trainee = $5,
        trainee_until = $6::date
      WHERE id = $1::uuid
    `,
    [
      guardId,
      resolved.position,
      resolved.licenseType,
      resolved.employmentType,
      resolved.isTrainee,
      resolved.traineeUntil,
    ],
  );
}

export async function closeOpenProfilePeriodsOnDate(
  guardId: string,
  closeOnDate: string,
): Promise<void> {
  await query(
    `
      UPDATE guard_profile_periods
      SET effective_to = $2::date
      WHERE guard_id = $1::uuid
        AND (effective_to IS NULL OR effective_to > $2::date)
        AND effective_from <= $2::date
    `,
    [guardId, closeOnDate],
  );
  await query(
    `
      DELETE FROM guard_profile_periods
      WHERE guard_id = $1::uuid AND effective_from > $2::date
    `,
    [guardId, closeOnDate],
  );
}

export type AssignGuardProfilePeriodInput = {
  guardId: string;
  periodKind: GuardProfilePeriodKind;
  effectiveFrom: string;
  effectiveTo: string | null;
  position?: GuardPosition;
  employmentType?: GuardEmploymentType;
  isTrainee?: boolean;
  traineeUntil?: string | null;
  licenseType?: GuardLicenseType;
  note?: string;
  createdBy: string | null;
  confirmOverlap?: boolean;
};

export type AssignGuardProfilePeriodResult = {
  periodIds: string[];
  warnings: string[];
};

async function trimOverlappingPeriods(
  guardId: string,
  kind: GuardProfilePeriodKind,
  effectiveFrom: string,
): Promise<void> {
  const dayBefore = dayBeforeIso(effectiveFrom);
  await query(
    `
      UPDATE guard_profile_periods
      SET effective_to = $4::date
      WHERE guard_id = $1::uuid
        AND period_kind = $2
        AND effective_from < $3::date
        AND (effective_to IS NULL OR effective_to >= $3::date)
    `,
    [guardId, kind, effectiveFrom, dayBefore],
  );
  await query(
    `
      DELETE FROM guard_profile_periods
      WHERE guard_id = $1::uuid
        AND period_kind = $2
        AND effective_from >= $3::date
        AND ($4::date IS NULL OR effective_from <= $4::date)
    `,
    [guardId, kind, effectiveFrom, null],
  );
}

export async function assignGuardProfilePeriod(
  input: AssignGuardProfilePeriodInput,
): Promise<AssignGuardProfilePeriodResult> {
  const periods = await listGuardProfilePeriods(input.guardId);
  const resolver = new GuardProfileResolver(periods);
  const warnings = resolver.findOverlapWarnings(
    input.guardId,
    input.periodKind,
    input.effectiveFrom,
    input.effectiveTo,
  );
  if (warnings.length > 0 && !input.confirmOverlap) {
    return { periodIds: [], warnings };
  }

  const basics = await getGuardBasics(input.guardId);
  if (!basics) throw new Error("Охранник не найден");

  const previousPosition =
    input.periodKind === "position"
      ? await resolveGuardPositionAt(input.guardId, dayBeforeIso(input.effectiveFrom))
      : null;

  await trimOverlappingPeriods(input.guardId, input.periodKind, input.effectiveFrom);

  const inserted = await query<{ id: string }>(
    `
      INSERT INTO guard_profile_periods (
        guard_id, period_kind, effective_from, effective_to,
        position, employment_type, is_trainee, trainee_until, license_type,
        note, created_by
      )
      VALUES ($1, $2, $3::date, $4::date, $5, $6, $7, $8::date, $9, $10, $11)
      RETURNING id
    `,
    [
      input.guardId,
      input.periodKind,
      input.effectiveFrom,
      input.effectiveTo,
      input.periodKind === "position" ? (input.position ?? null) : null,
      input.periodKind === "employment" ? (input.employmentType ?? null) : null,
      input.periodKind === "trainee" ? (input.isTrainee ?? null) : null,
      input.periodKind === "trainee" ? (input.traineeUntil ?? null) : null,
      input.periodKind === "license" ? (input.licenseType ?? null) : null,
      input.note?.trim() ?? "",
      input.createdBy,
    ],
  );

  const periodIds = inserted.map((r) => r.id);

  if (input.periodKind === "position" && input.effectiveTo && input.position && previousPosition) {
    const prev = previousPosition;
    const revertFrom = dayAfterIso(input.effectiveTo);
    if (prev !== input.position) {
      const revert = await query<{ id: string }>(
        `
          INSERT INTO guard_profile_periods (
            guard_id, period_kind, effective_from, effective_to, position, note, created_by
          )
          VALUES ($1, 'position', $2::date, NULL, $3, $4, $5)
          RETURNING id
        `,
        [
          input.guardId,
          revertFrom,
          prev,
          `Автовозврат после «${input.position}»`,
          input.createdBy,
        ],
      );
      periodIds.push(...revert.map((r) => r.id));
    }
  }

  if (input.periodKind === "position" && input.position === "Curator") {
    await ensureCuratorJournalForGuard(input.guardId, basics.firstName, basics.lastName);
  }

  await syncGuardProfileCacheFromPeriods(input.guardId);
  return { periodIds, warnings };
}

async function replaceProfilePeriodSegments(
  guardId: string,
  periodKind: Extract<GuardProfilePeriodKind, "license" | "employment">,
  segments: Array<{
    effectiveFrom: string;
    effectiveTo: string | null;
    licenseType?: GuardLicenseType;
    employmentType?: GuardEmploymentType;
  }>,
  createdBy: string | null,
  note: string,
): Promise<void> {
  await query(
    `
      DELETE FROM guard_profile_periods
      WHERE guard_id = $1::uuid AND period_kind = $2
    `,
    [guardId, periodKind],
  );

  for (const segment of segments) {
    await query(
      `
        INSERT INTO guard_profile_periods (
          guard_id, period_kind, effective_from, effective_to,
          position, employment_type, is_trainee, trainee_until, license_type,
          note, created_by
        )
        VALUES ($1, $2, $3::date, $4::date, NULL, $5, NULL, NULL, $6, $7, $8)
      `,
      [
        guardId,
        periodKind,
        segment.effectiveFrom,
        segment.effectiveTo,
        periodKind === "employment" ? (segment.employmentType ?? null) : null,
        periodKind === "license" ? (segment.licenseType ?? null) : null,
        note,
        createdBy,
      ],
    );
  }
}

export type SyncGuardProfilePeriodsFromComplianceInput = {
  guardId: string;
  licenseType: GuardLicenseType;
  employmentType: GuardEmploymentType;
  personalCardAssignedOn: string | null;
  employedOn: string | null;
  createdBy?: string | null;
};

export async function syncGuardProfilePeriodsFromCompliance(
  input: SyncGuardProfilePeriodsFromComplianceInput,
): Promise<boolean> {
  const createdRows = await query<{ created_at: string }>(
    `SELECT created_at::text FROM guards WHERE id = $1::uuid`,
    [input.guardId],
  );
  const createdAtIso = createdRows[0]?.created_at;
  if (!createdAtIso) return false;

  const existingPeriods = await listGuardProfilePeriods(input.guardId);
  const initialFrom = resolveInitialProfileFromIso({
    createdAtIso,
    existingPeriodStarts: existingPeriods.map((p) => p.effectiveFrom),
    personalCardAssignedOn: input.personalCardAssignedOn,
    employedOn: input.employedOn,
  });

  const licenseSegments = buildLicensePeriodSegments({
    initialFrom,
    licenseType: input.licenseType,
    personalCardAssignedOn: input.personalCardAssignedOn,
  });
  const employmentSegments = buildEmploymentPeriodSegments({
    initialFrom,
    employmentType: input.employmentType,
    employedOn: input.employedOn,
  });

  const licenseChanged = !profileSegmentsMatch(
    existingPeriods.filter((p) => p.periodKind === "license"),
    licenseSegments.map((segment) => ({
      effectiveFrom: segment.effectiveFrom,
      effectiveTo: segment.effectiveTo,
      licenseType: segment.value,
    })),
  );
  const employmentChanged = !profileSegmentsMatch(
    existingPeriods.filter((p) => p.periodKind === "employment"),
    employmentSegments.map((segment) => ({
      effectiveFrom: segment.effectiveFrom,
      effectiveTo: segment.effectiveTo,
      employmentType: segment.value,
    })),
  );

  if (!licenseChanged && !employmentChanged) return false;

  const createdBy = input.createdBy ?? null;

  if (licenseChanged) {
    await replaceProfilePeriodSegments(
      input.guardId,
      "license",
      licenseSegments.map((segment) => ({
        effectiveFrom: segment.effectiveFrom,
        effectiveTo: segment.effectiveTo,
        licenseType: segment.value,
      })),
      createdBy,
      "Автосинхронизация по дате ЛК",
    );
  }

  if (employmentChanged) {
    await replaceProfilePeriodSegments(
      input.guardId,
      "employment",
      employmentSegments.map((segment) => ({
        effectiveFrom: segment.effectiveFrom,
        effectiveTo: segment.effectiveTo,
        employmentType: segment.value,
      })),
      createdBy,
      "Автосинхронизация по дате трудоустройства",
    );
  }

  await syncGuardProfileCacheFromPeriods(input.guardId);
  return true;
}

function profileSegmentsMatch(
  existing: GuardProfilePeriodRecord[],
  expected: Array<{
    effectiveFrom: string;
    effectiveTo: string | null;
    licenseType?: GuardLicenseType;
    employmentType?: GuardEmploymentType;
  }>,
): boolean {
  const normalizedExisting = [...existing]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .map((period) => ({
      effectiveFrom: period.effectiveFrom,
      effectiveTo: period.effectiveTo,
      licenseType: period.licenseType,
      employmentType: period.employmentType,
    }));
  const normalizedExpected = [...expected].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  if (normalizedExisting.length !== normalizedExpected.length) return false;
  return normalizedExpected.every((segment, index) => {
    const current = normalizedExisting[index];
    if (!current) return false;
    return (
      current.effectiveFrom === segment.effectiveFrom &&
      current.effectiveTo === segment.effectiveTo &&
      current.licenseType === (segment.licenseType ?? null) &&
      current.employmentType === (segment.employmentType ?? null)
    );
  });
}

export async function backfillAllGuardProfilePeriodsFromCompliance(): Promise<number> {
  if (!(await tableColumnExists("guards", "personal_card_assigned_on"))) return 0;

  const rows = await query<{
    id: string;
    license_type: string | null;
    employment_type: GuardEmploymentType;
    personal_card_assigned_on: string | null;
    employed_on: string | null;
  }>(
    `
      SELECT
        id,
        license_type,
        employment_type,
        personal_card_assigned_on::text,
        employed_on::text
      FROM guards
    `,
  );

  const { backfillTimesheetEntriesForGuardSafe } = await import("../accounting/sync-timesheet-entry");
  let count = 0;
  for (const row of rows) {
    const changed = await syncGuardProfilePeriodsFromCompliance({
      guardId: row.id,
      licenseType: (row.license_type === "Licensed" ? "Licensed" : "None") as GuardLicenseType,
      employmentType: row.employment_type ?? "Unemployed",
      personalCardAssignedOn: row.personal_card_assigned_on,
      employedOn: row.employed_on,
    });
    if (changed) {
      await backfillTimesheetEntriesForGuardSafe(row.id);
      count += 1;
    }
  }
  return count;
}

export async function resolveGuardProfileAt(
  guardId: string,
  dateIso: string,
): Promise<{
  position: GuardPosition;
  employmentType: GuardEmploymentType;
  licenseType: GuardLicenseType;
  isTrainee: boolean;
  traineeUntil: string | null;
}> {
  const basics = await getGuardBasics(guardId);
  if (!basics) {
    return {
      position: "Guard",
      employmentType: "Unemployed",
      licenseType: "None",
      isTrainee: false,
      traineeUntil: null,
    };
  }
  const periods = await listGuardProfilePeriods(guardId);
  const resolved = resolveGuardProfileFromPeriods(
    {
      id: guardId,
      name: "",
      status: "Active",
      phone: "",
      position: basics.position,
      licenseType: basics.licenseType,
      employmentType: basics.employmentType,
      isTrainee: basics.isTrainee,
      traineeUntil: basics.traineeUntil ? new Date(`${basics.traineeUntil}T12:00:00+10:00`) : null,
      hasCar: false,
    },
    dateIso,
    periods,
  );
  return {
    position: resolved.position,
    employmentType: resolved.employmentType,
    licenseType: resolved.licenseType,
    isTrainee: resolved.isTrainee,
    traineeUntil: resolved.traineeUntil,
  };
}

export async function resolveGuardPositionAt(guardId: string, dateIso: string): Promise<GuardPosition> {
  return (await resolveGuardProfileAt(guardId, dateIso)).position;
}
