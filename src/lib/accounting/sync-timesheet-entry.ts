import { query } from "../db/pool";
import {
  getShiftIncidentSelectColumns,
  getShiftSelectedRateRuleSelect,
  isUndefinedColumnOrTableError,
} from "../db/column-compat";
import { toDateIsoKhabarovsk } from "../format/display-date";
import { listProfilePeriodsForGuards } from "../operations/guard-profile-periods-repository";
import { GuardProfileResolver } from "../guards/profile-periods";
import { listObjectRateRules } from "../operations/object-rate-rules-repository";
import { DEFAULT_SHIFT_TIMEZONE, loadHolidayDateSetForLocalRange } from "../rates/holiday-calendar";
import { mapGuardLicenseFromDb } from "../scheduling/guard-profile";
import {
  buildTimesheetRows,
  type AttendanceIncidentLine,
  type TimesheetRow,
} from "../scheduling/timesheet";
import type { Guard, IncidentCategory, SecurityObject, Shift } from "../scheduling/types";
import { normalizeShiftKindFromDb } from "../scheduling/types";

const TIMESHEET_ENTRY_COMPUTATION_VERSION = 3;

type ShiftSyncRow = {
  id: string;
  guard_id: string;
  object_id: string;
  starts_at: string;
  ends_at: string;
  shift_kind: string;
  manual_client_rate_cents: number | null;
  manual_guard_rate_cents: number | null;
  manual_rate_unit: string | null;
  manual_rate_reason: string;
  is_no_show: boolean;
  incident_category: string | null;
  incident_comment: string | null;
  incident_worked_until_at: string | null;
  incident_recorded_at: string | null;
  replaced_by_shift_id: string | null;
  selected_rate_rule_id: string | null;
  post_id: string | null;
  post_name: string | null;
  first_name: string;
  last_name: string;
  status: string;
  position: string;
  license_type: string | null;
  employment_type: string;
  is_trainee: boolean;
  trainee_until: string | null;
  object_name: string;
};

type LogLineRow = {
  note: string;
  created_at: string;
};

function mapShiftSyncRow(row: ShiftSyncRow): { shift: Shift; guard: Guard; object: SecurityObject } {
  const shift: Shift = {
    id: row.id,
    guardId: row.guard_id,
    objectId: row.object_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    shiftKind: normalizeShiftKindFromDb(row.shift_kind),
    manualClientRateCents: row.manual_client_rate_cents,
    manualGuardRateCents: row.manual_guard_rate_cents,
    manualRateUnit: row.manual_rate_unit as Shift["manualRateUnit"],
    manualRateReason: row.manual_rate_reason ?? "",
    isNoShow: row.is_no_show,
    incidentCategory: (row.incident_category as IncidentCategory | null) ?? null,
    incidentComment: row.incident_comment?.trim() ?? "",
    incidentWorkedUntilAt: row.incident_worked_until_at ? new Date(row.incident_worked_until_at) : null,
    incidentRecordedAt: row.incident_recorded_at ? new Date(row.incident_recorded_at) : null,
    replacedByShiftId: row.replaced_by_shift_id,
    selectedRateRuleId: row.selected_rate_rule_id,
    postId: row.post_id,
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
  const object: SecurityObject = {
    id: row.object_id,
    name: row.object_name,
    address: "",
    status: "Active",
    operationalDayStartTime: "08:00",
  };
  return { shift, guard, object };
}

async function loadShiftForTimesheetSync(shiftId: string): Promise<ShiftSyncRow | null> {
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns("s"),
    getShiftSelectedRateRuleSelect("s"),
  ]);
  const rows = await query<ShiftSyncRow>(
    `
      SELECT
        s.id,
        s.guard_id,
        s.object_id,
        s.starts_at::text,
        s.ends_at::text,
        s.shift_kind,
        s.manual_client_rate_cents,
        s.manual_guard_rate_cents,
        s.manual_rate_unit,
        s.manual_rate_reason,
        s.is_no_show,
        s.post_id,
        p.name AS post_name,
        ${incidentSel},
        ${rateRuleSel},
        g.first_name,
        g.last_name,
        g.status,
        g.position,
        g.license_type,
        g.employment_type,
        g.is_trainee,
        g.trainee_until::text,
        o.name AS object_name
      FROM shifts s
      JOIN guards g ON g.id = s.guard_id
      JOIN security_objects o ON o.id = s.object_id
      LEFT JOIN object_posts p ON p.id = s.post_id
      WHERE s.id = $1::uuid
    `,
    [shiftId],
  );
  return rows[0] ?? null;
}

async function loadIncidentLogLines(shiftId: string): Promise<Array<{ createdAt: string; note: string }>> {
  const rows = await query<LogLineRow>(
    `
      SELECT note, created_at::text AS created_at
      FROM shift_logs
      WHERE shift_id = $1::uuid
      ORDER BY created_at DESC
      LIMIT 15
    `,
    [shiftId],
  );
  return rows.map((row) => ({ createdAt: row.created_at, note: row.note }));
}

async function upsertTimesheetEntry(shift: Shift, row: TimesheetRow): Promise<void> {
  const workDate = toDateIsoKhabarovsk(shift.startsAt);
  const attendanceIncident: AttendanceIncidentLine | null = row.attendanceIncident;
  await query(
    `
      INSERT INTO timesheet_shift_entries (
        shift_id,
        guard_id,
        object_id,
        post_id,
        work_date,
        starts_at,
        ends_at,
        guard_name,
        object_name,
        post_name,
        shift_kind,
        total_hours,
        night_hours,
        holiday_hours,
        regular_hours,
        reinforcement_hours,
        rapid_response_hours,
        unworked_hours,
        client_amount_cents,
        guard_amount_cents,
        margin_cents,
        unpriced,
        is_no_show,
        incidents_count,
        attendance_incident,
        incident_log_lines,
        guard_rate_contributions,
        computation_version
      )
      VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::date, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24,
        $25::jsonb, $26::jsonb, $27::jsonb, $28
      )
      ON CONFLICT (shift_id) DO UPDATE SET
        guard_id = EXCLUDED.guard_id,
        object_id = EXCLUDED.object_id,
        post_id = EXCLUDED.post_id,
        work_date = EXCLUDED.work_date,
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        guard_name = EXCLUDED.guard_name,
        object_name = EXCLUDED.object_name,
        post_name = EXCLUDED.post_name,
        shift_kind = EXCLUDED.shift_kind,
        total_hours = EXCLUDED.total_hours,
        night_hours = EXCLUDED.night_hours,
        holiday_hours = EXCLUDED.holiday_hours,
        regular_hours = EXCLUDED.regular_hours,
        reinforcement_hours = EXCLUDED.reinforcement_hours,
        rapid_response_hours = EXCLUDED.rapid_response_hours,
        unworked_hours = EXCLUDED.unworked_hours,
        client_amount_cents = EXCLUDED.client_amount_cents,
        guard_amount_cents = EXCLUDED.guard_amount_cents,
        margin_cents = EXCLUDED.margin_cents,
        unpriced = EXCLUDED.unpriced,
        is_no_show = EXCLUDED.is_no_show,
        incidents_count = EXCLUDED.incidents_count,
        attendance_incident = EXCLUDED.attendance_incident,
        incident_log_lines = EXCLUDED.incident_log_lines,
        guard_rate_contributions = EXCLUDED.guard_rate_contributions,
        computation_version = EXCLUDED.computation_version,
        computed_at = now()
    `,
    [
      shift.id,
      shift.guardId,
      shift.objectId,
      shift.postId ?? null,
      workDate,
      shift.startsAt.toISOString(),
      shift.endsAt.toISOString(),
      row.guardName,
      row.objectName,
      row.postName ?? null,
      shift.shiftKind,
      row.totalHours,
      row.nightHours,
      row.holidayHours,
      row.regularHours,
      row.reinforcementHours,
      row.rapidResponseHours,
      row.unworkedHours,
      row.clientAmountCents,
      row.guardAmountCents,
      row.marginCents,
      row.unpriced,
      row.isNoShow,
      row.incidentsCount,
      attendanceIncident ? JSON.stringify(attendanceIncident) : null,
      JSON.stringify(row.incidentLogLines),
      JSON.stringify(row.guardRateContributions ?? []),
      TIMESHEET_ENTRY_COMPUTATION_VERSION,
    ],
  );
}

/** Пересчитывает одну строку материализованного табеля по смене. */
export async function syncTimesheetEntryFromShift(shiftId: string): Promise<void> {
  const loaded = await loadShiftForTimesheetSync(shiftId);
  if (!loaded) {
    await query(`DELETE FROM timesheet_shift_entries WHERE shift_id = $1::uuid`, [shiftId]);
    return;
  }

  const { shift, guard, object } = mapShiftSyncRow(loaded);
  const periods = await listProfilePeriodsForGuards([guard.id]);
  const profileResolver = new GuardProfileResolver(periods);
  const [holidayDates, rateRules, incidentLogLines] = await Promise.all([
    loadHolidayDateSetForLocalRange(shift.startsAt, shift.endsAt),
    listObjectRateRules(shift.objectId),
    loadIncidentLogLines(shiftId),
  ]);

  const incidentLogLinesByShiftId = new Map<string, Array<{ createdAt: string; note: string }>>([
    [shiftId, incidentLogLines],
  ]);
  const rateRulesByObjectId = { [shift.objectId]: rateRules };
  const postsByPostId = loaded.post_id && loaded.post_name ? new Map([[loaded.post_id, { id: loaded.post_id, name: loaded.post_name }]]) : undefined;

  const rows = buildTimesheetRows({
    guards: [guard],
    objects: [object],
    shifts: [shift],
    holidayDates,
    incidentLogLinesByShiftId,
    rateRulesByObjectId,
    postsByPostId,
    timeZone: DEFAULT_SHIFT_TIMEZONE,
    profileResolver,
  });

  const row = rows[0];
  if (!row) {
    await query(`DELETE FROM timesheet_shift_entries WHERE shift_id = $1::uuid`, [shiftId]);
    return;
  }

  await upsertTimesheetEntry(shift, row);
}

export async function syncTimesheetEntryFromShiftSafe(shiftId: string): Promise<void> {
  try {
    await syncTimesheetEntryFromShift(shiftId);
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return;
    console.error("[timesheet-sync] shift", shiftId, error);
  }
}

async function listShiftIdsForQuery(sql: string, params: unknown[]): Promise<string[]> {
  const rows = await query<{ id: string }>(sql, params);
  return rows.map((row) => row.id);
}

/** Дозаполняет записи для смен без строки в материализованном табеле. */
export async function backfillMissingTimesheetEntries(): Promise<number> {
  const shiftIds = await listShiftIdsForQuery(
    `
      SELECT s.id
      FROM shifts s
      LEFT JOIN timesheet_shift_entries t ON t.shift_id = s.id
      WHERE t.shift_id IS NULL
      ORDER BY s.starts_at ASC
    `,
    [],
  );
  for (const shiftId of shiftIds) {
    await syncTimesheetEntryFromShift(shiftId);
  }
  return shiftIds.length;
}

export async function backfillMissingTimesheetEntriesSafe(): Promise<number> {
  try {
    return await backfillMissingTimesheetEntries();
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return 0;
    console.error("[timesheet-backfill] missing", error);
    return 0;
  }
}

/** Пересчитывает строки табеля со старой версией расчёта (без guard_rate_contributions). */
export async function resyncOutdatedTimesheetEntries(): Promise<number> {
  const shiftIds = await listShiftIdsForQuery(
    `
      SELECT shift_id AS id
      FROM timesheet_shift_entries
      WHERE computation_version < $1
      ORDER BY starts_at ASC
    `,
    [TIMESHEET_ENTRY_COMPUTATION_VERSION],
  );
  for (const shiftId of shiftIds) {
    await syncTimesheetEntryFromShift(shiftId);
  }
  return shiftIds.length;
}

export async function resyncOutdatedTimesheetEntriesSafe(): Promise<number> {
  try {
    return await resyncOutdatedTimesheetEntries();
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return 0;
    console.error("[timesheet-resync] outdated", error);
    return 0;
  }
}

export async function backfillTimesheetEntriesForGuard(guardId: string): Promise<number> {
  const shiftIds = await listShiftIdsForQuery(
    `SELECT id FROM shifts WHERE guard_id = $1::uuid ORDER BY starts_at ASC`,
    [guardId],
  );
  for (const shiftId of shiftIds) {
    await syncTimesheetEntryFromShift(shiftId);
  }
  return shiftIds.length;
}

export async function backfillTimesheetEntriesForGuardSafe(guardId: string): Promise<void> {
  try {
    await backfillTimesheetEntriesForGuard(guardId);
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return;
    console.error("[timesheet-backfill] guard", guardId, error);
  }
}

export async function backfillTimesheetEntriesForObject(objectId: string): Promise<number> {
  const shiftIds = await listShiftIdsForQuery(
    `SELECT id FROM shifts WHERE object_id = $1::uuid ORDER BY starts_at ASC`,
    [objectId],
  );
  for (const shiftId of shiftIds) {
    await syncTimesheetEntryFromShift(shiftId);
  }
  return shiftIds.length;
}

export async function backfillTimesheetEntriesForObjectSafe(objectId: string): Promise<void> {
  try {
    await backfillTimesheetEntriesForObject(objectId);
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return;
    console.error("[timesheet-backfill] object", objectId, error);
  }
}

export async function backfillTimesheetEntriesForLocalDate(holidayDateIso: string): Promise<number> {
  const dayStart = new Date(`${holidayDateIso}T00:00:00+10:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const shiftIds = await listShiftIdsForQuery(
    `
      SELECT id
      FROM shifts
      WHERE ends_at > $1 AND starts_at < $2
      ORDER BY starts_at ASC
    `,
    [dayStart.toISOString(), dayEnd.toISOString()],
  );
  for (const shiftId of shiftIds) {
    await syncTimesheetEntryFromShift(shiftId);
  }
  return shiftIds.length;
}

export async function backfillTimesheetEntriesForObjectOnLocalDate(
  objectId: string,
  localDateIso: string,
): Promise<number> {
  const dayStart = new Date(`${localDateIso}T00:00:00+10:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const shiftIds = await listShiftIdsForQuery(
    `
      SELECT id
      FROM shifts
      WHERE object_id = $1::uuid
        AND ends_at > $2
        AND starts_at < $3
      ORDER BY starts_at ASC
    `,
    [objectId, dayStart.toISOString(), dayEnd.toISOString()],
  );
  for (const shiftId of shiftIds) {
    await syncTimesheetEntryFromShift(shiftId);
  }
  return shiftIds.length;
}

export async function backfillTimesheetEntriesForLocalDateSafe(holidayDateIso: string): Promise<void> {
  try {
    await backfillTimesheetEntriesForLocalDate(holidayDateIso);
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return;
    console.error("[timesheet-backfill] date", holidayDateIso, error);
  }
}

export async function backfillTimesheetEntriesForObjectOnLocalDateSafe(
  objectId: string,
  localDateIso: string,
): Promise<void> {
  try {
    await backfillTimesheetEntriesForObjectOnLocalDate(objectId, localDateIso);
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return;
    console.error("[timesheet-backfill] object-date", objectId, localDateIso, error);
  }
}
