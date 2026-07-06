import { query } from "../db/pool";
import { isUndefinedColumnOrTableError } from "../db/column-compat";
import type { GuardRateContribution } from "../rates/rate-calculator";
import type { TimesheetRow, AttendanceIncidentLine } from "../scheduling/timesheet";

function parseGuardRateContributions(value: unknown): GuardRateContribution[] {
  if (!Array.isArray(value)) return [];
  const parsed: GuardRateContribution[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const guardRateCents = Number(record.guardRateCents);
    const minutes = Number(record.minutes);
    const amountCents = Number(record.amountCents);
    if (!Number.isFinite(guardRateCents) || !Number.isFinite(minutes) || !Number.isFinite(amountCents)) continue;
    parsed.push({ guardRateCents, minutes, amountCents });
  }
  return parsed;
}

type TimesheetEntryDbRow = {
  guard_name: string;
  object_name: string;
  post_id: string | null;
  post_name: string | null;
  starts_at: string | Date;
  ends_at: string | Date;
  total_hours: string;
  night_hours: string;
  holiday_hours: string;
  regular_hours: string;
  reinforcement_hours: string;
  rapid_response_hours: string;
  unworked_hours: string;
  client_amount_cents: number;
  guard_amount_cents: number;
  margin_cents: number;
  unpriced: boolean;
  is_no_show: boolean;
  incidents_count: number;
  attendance_incident: AttendanceIncidentLine | null;
  incident_log_lines: Array<{ createdAt: string; note: string }> | null;
  guard_rate_contributions?: unknown;
};

function toIsoTimestamp(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${String(value)}`);
  }
  return date.toISOString();
}

function mapDbRowToTimesheetRow(row: TimesheetEntryDbRow): TimesheetRow {
  return {
    guardName: row.guard_name,
    objectName: row.object_name,
    postId: row.post_id,
    postName: row.post_name,
    startsAt: toIsoTimestamp(row.starts_at),
    endsAt: toIsoTimestamp(row.ends_at),
    totalHours: Number(row.total_hours),
    nightHours: Number(row.night_hours),
    holidayHours: Number(row.holiday_hours),
    regularHours: Number(row.regular_hours),
    reinforcementHours: Number(row.reinforcement_hours),
    rapidResponseHours: Number(row.rapid_response_hours),
    unworkedHours: Number(row.unworked_hours),
    incidentsCount: row.incidents_count,
    attendanceIncident: row.attendance_incident,
    incidentLogLines: row.incident_log_lines ?? [],
    clientAmountCents: row.client_amount_cents,
    guardAmountCents: row.guard_amount_cents,
    marginCents: row.margin_cents,
    guardRateContributions: parseGuardRateContributions(row.guard_rate_contributions),
    unpriced: row.unpriced,
    isNoShow: row.is_no_show,
  };
}

export type TimesheetFilterOptions = {
  guards: Array<{ id: string; name: string }>;
  objects: Array<{ id: string; name: string }>;
};

export async function listTimesheetFilterOptions(): Promise<TimesheetFilterOptions> {
  const [guardsRows, objectsRows] = await Promise.all([
    query<{ id: string; first_name: string; last_name: string }>(
      `
        SELECT id, first_name, last_name
        FROM guards
        ORDER BY last_name, first_name
      `,
    ),
    query<{ id: string; name: string }>(
      `
        SELECT id, name
        FROM security_objects
        ORDER BY name
      `,
    ),
  ]);

  return {
    guards: guardsRows.map((row) => ({
      id: row.id,
      name: `${row.last_name} ${row.first_name}`.trim(),
    })),
    objects: objectsRows.map((row) => ({ id: row.id, name: row.name })),
  };
}

export type TimesheetGuardDailyTotal = {
  guardId: string;
  guardName: string;
  workDate: string;
  totalHours: number;
  guardAmountCents: number;
};

export type TimesheetGuardSalaryTotals = {
  guardId: string;
  guardName: string;
  firstHalfCents: number;
  monthCents: number;
};

/** Начисления охраннику за 1–15 и за весь месяц из timesheet_shift_entries. */
export async function listTimesheetGuardSalaryTotals(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<TimesheetGuardSalaryTotals[]> {
  const rows = await query<{
    guard_id: string;
    guard_name: string;
    first_half_cents: number;
    month_cents: number;
  }>(
    `
      SELECT
        guard_id,
        guard_name,
        COALESCE(SUM(guard_amount_cents) FILTER (WHERE EXTRACT(DAY FROM work_date) <= 15), 0)::int AS first_half_cents,
        COALESCE(SUM(guard_amount_cents), 0)::int AS month_cents
      FROM timesheet_shift_entries
      WHERE ends_at > $1
        AND starts_at < $2
      GROUP BY guard_id, guard_name
      ORDER BY guard_name ASC
    `,
    [rangeStart, rangeEnd],
  );

  return rows.map((row) => ({
    guardId: row.guard_id,
    guardName: row.guard_name,
    firstHalfCents: row.first_half_cents,
    monthCents: row.month_cents,
  }));
}

export async function listTimesheetGuardDailyTotals(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<TimesheetGuardDailyTotal[]> {
  const rows = await query<{
    guard_id: string;
    guard_name: string;
    work_date: string;
    total_hours: string;
    guard_amount_cents: number;
  }>(
    `
      SELECT
        guard_id,
        guard_name,
        work_date::text,
        COALESCE(SUM(total_hours), 0)::text AS total_hours,
        COALESCE(SUM(guard_amount_cents), 0)::int AS guard_amount_cents
      FROM timesheet_shift_entries
      WHERE ends_at > $1
        AND starts_at < $2
      GROUP BY guard_id, guard_name, work_date
      ORDER BY guard_name ASC, work_date ASC
    `,
    [rangeStart, rangeEnd],
  );

  return rows.map((row) => ({
    guardId: row.guard_id,
    guardName: row.guard_name,
    workDate: row.work_date.slice(0, 10),
    totalHours: Number(row.total_hours),
    guardAmountCents: row.guard_amount_cents,
  }));
}

export async function listTimesheetEntries(
  rangeStart: Date,
  rangeEnd: Date,
  filters?: { guardId?: string; objectId?: string },
): Promise<TimesheetRow[]> {
  const guardId = filters?.guardId ?? null;
  const objectId = filters?.objectId ?? null;

  try {
    const rows = await query<TimesheetEntryDbRow>(
      `
        SELECT
          guard_name,
          object_name,
          post_id,
          post_name,
          starts_at,
          ends_at,
          total_hours::text,
          night_hours::text,
          holiday_hours::text,
          regular_hours::text,
          reinforcement_hours::text,
          rapid_response_hours::text,
          unworked_hours::text,
          client_amount_cents,
          guard_amount_cents,
          margin_cents,
          unpriced,
          is_no_show,
          incidents_count,
          attendance_incident,
          incident_log_lines,
          guard_rate_contributions
        FROM timesheet_shift_entries
        WHERE ends_at > $1
          AND starts_at < $2
          AND ($3::uuid IS NULL OR guard_id = $3)
          AND ($4::uuid IS NULL OR object_id = $4)
        ORDER BY starts_at ASC
      `,
      [rangeStart.toISOString(), rangeEnd.toISOString(), guardId, objectId],
    );
    return rows.map(mapDbRowToTimesheetRow);
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) return [];
    throw error;
  }
}
