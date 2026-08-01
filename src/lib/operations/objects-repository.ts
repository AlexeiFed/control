import { query } from "../db/pool";
import { isUndefinedColumnOrTableError } from "../db/column-compat";
import { getObjectMonthlySetting } from "./object-monthly-settings-repository";

import { normalizeOperationalAnchorTime } from "../scheduling/operational-day-timeline";

export type ObjectListRow = {
  id: string;
  name: string;
  address: string;
  description: string;
  status: "Active" | "Inactive";
  operationalDayStartTime: string;
  timesheetDirectorName: string;
  timesheetDirectorRole: string;
  timesheetSiteManagerEnabled: boolean;
  guardsCount: number;
  guardIds: string[];
  weekShiftCount: number;
  weekGuardCount: number;
};

type ObjectRow = {
  id: string;
  name: string;
  address: string;
  description: string;
  status: "Active" | "Inactive";
  operational_day_start_time: string;
  timesheet_director_name: string;
  timesheet_director_role: string;
  timesheet_site_manager_enabled: boolean;
  guards_count: string;
  guard_ids: string[] | null;
  week_shift_count: string;
  week_guard_count: string;
};

export type ObjectSwitchTabRow = {
  id: string;
  name: string;
  operationalDayStartTime: string;
};

/** Лёгкий список объектов для переключателя вкладок (без агрегаций смен). */
export async function listObjectSwitchTabs(): Promise<ObjectSwitchTabRow[]> {
  const rows = await query<{ id: string; name: string; operational_day_start_time: string }>(
    `
      SELECT id, name, operational_day_start_time::text AS operational_day_start_time
      FROM security_objects
      ORDER BY name
    `,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    operationalDayStartTime: normalizeOperationalAnchorTime(row.operational_day_start_time),
  }));
}

function mapObjectRow(row: ObjectRow): Omit<ObjectListRow, "guardsCount" | "guardIds" | "weekShiftCount" | "weekGuardCount"> {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    description: row.description,
    status: row.status,
    operationalDayStartTime: normalizeOperationalAnchorTime(row.operational_day_start_time),
    timesheetDirectorName: row.timesheet_director_name ?? "",
    timesheetDirectorRole: row.timesheet_director_role ?? "",
    timesheetSiteManagerEnabled: row.timesheet_site_manager_enabled ?? false,
  };
}

/** Лёгкий список объектов для назначения охраннику (без агрегаций смен/охранников). */
export async function listObjectsForAssignment(): Promise<ObjectListRow[]> {
  const rows = await query<{
    id: string;
    name: string;
    address: string;
    description: string;
    status: "Active" | "Inactive";
    operational_day_start_time: string;
    timesheet_director_name: string;
    timesheet_director_role: string;
    timesheet_site_manager_enabled: boolean;
  }>(`
    SELECT
      id,
      name,
      address,
      description,
      status,
      operational_day_start_time::text AS operational_day_start_time,
      COALESCE(timesheet_director_name, '') AS timesheet_director_name,
      COALESCE(timesheet_director_role, '') AS timesheet_director_role,
      COALESCE(timesheet_site_manager_enabled, false) AS timesheet_site_manager_enabled
    FROM security_objects
    ORDER BY name
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    description: row.description,
    status: row.status,
    operationalDayStartTime: normalizeOperationalAnchorTime(row.operational_day_start_time),
    timesheetDirectorName: row.timesheet_director_name ?? "",
    timesheetDirectorRole: row.timesheet_director_role ?? "",
    timesheetSiteManagerEnabled: row.timesheet_site_manager_enabled ?? false,
    guardsCount: 0,
    guardIds: [],
    weekShiftCount: 0,
    weekGuardCount: 0,
  }));
}

export async function listObjects(): Promise<ObjectListRow[]> {
  let rows: ObjectRow[];
  try {
    rows = await query<ObjectRow>(`
      SELECT
        so.id,
        so.name,
        so.address,
        so.description,
        so.status,
        so.operational_day_start_time::text AS operational_day_start_time,
        COALESCE(so.timesheet_director_name, '') AS timesheet_director_name,
        COALESCE(so.timesheet_director_role, '') AS timesheet_director_role,
        COALESCE(so.timesheet_site_manager_enabled, false) AS timesheet_site_manager_enabled,
        COUNT(goa.guard_id)::text AS guards_count,
        COALESCE(array_agg(goa.guard_id) FILTER (WHERE goa.guard_id IS NOT NULL), '{}') AS guard_ids,
        COALESCE(ws.week_shift_count, 0)::text AS week_shift_count,
        COALESCE(ws.week_guard_count, 0)::text AS week_guard_count
      FROM security_objects so
      LEFT JOIN guard_object_assignments goa ON goa.object_id = so.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS week_shift_count,
          COUNT(DISTINCT s.guard_id)::int AS week_guard_count
        FROM shifts s
        WHERE s.object_id = so.id
          AND s.ends_at > date_trunc('week', now())
          AND s.starts_at < date_trunc('week', now()) + interval '7 days'
      ) ws ON true
      GROUP BY
        so.id,
        so.operational_day_start_time,
        so.timesheet_director_name,
        so.timesheet_director_role,
        so.timesheet_site_manager_enabled,
        ws.week_shift_count,
        ws.week_guard_count
      ORDER BY so.name
    `);
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error;
    rows = await query<ObjectRow>(`
      SELECT
        so.id,
        so.name,
        so.address,
        so.description,
        so.status,
        so.operational_day_start_time::text AS operational_day_start_time,
        ''::text AS timesheet_director_name,
        ''::text AS timesheet_director_role,
        false AS timesheet_site_manager_enabled,
        COUNT(goa.guard_id)::text AS guards_count,
        COALESCE(array_agg(goa.guard_id) FILTER (WHERE goa.guard_id IS NOT NULL), '{}') AS guard_ids,
        '0'::text AS week_shift_count,
        '0'::text AS week_guard_count
      FROM security_objects so
      LEFT JOIN guard_object_assignments goa ON goa.object_id = so.id
      GROUP BY so.id, so.operational_day_start_time
      ORDER BY so.name
    `);
  }

  return rows.map((row) => ({
    ...mapObjectRow(row),
    guardsCount: Number(row.guards_count),
    guardIds: row.guard_ids ?? [],
    weekShiftCount: Number(row.week_shift_count),
    weekGuardCount: Number(row.week_guard_count),
  }));
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}

export async function createObject(input: {
  name: string;
  address: string;
  status?: "Active" | "Inactive";
}): Promise<string> {
  const rows = await query<{ id: string }>(
    `
      INSERT INTO security_objects (name, address, status)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [input.name.trim(), input.address.trim(), input.status ?? "Active"],
  );

  const objectId = rows[0]?.id;
  if (!objectId) throw new Error("Не удалось создать объект");
  return objectId;
}

export async function updateObjectStatus(
  objectId: string,
  status: "Active" | "Inactive",
): Promise<void> {
  await query(
    `
      UPDATE security_objects
      SET status = $2
      WHERE id = $1
    `,
    [objectId, status],
  );
}

export async function setObjectGuards(objectId: string, guardIds: string[]): Promise<void> {
  await query(
    `
      DELETE FROM guard_object_assignments
      WHERE object_id = $1
    `,
    [objectId],
  );

  if (guardIds.length === 0) return;

  await query(
    `
      INSERT INTO guard_object_assignments (guard_id, object_id)
      SELECT UNNEST($2::uuid[]), $1::uuid
      ON CONFLICT DO NOTHING
    `,
    [objectId, guardIds],
  );
}

export async function getObject(id: string): Promise<ObjectListRow | null> {
  const rows = await query<ObjectRow>(`
    SELECT
      so.id,
      so.name,
      so.address,
      so.description,
      so.status,
      so.operational_day_start_time::text AS operational_day_start_time,
      COALESCE(so.timesheet_director_name, '') AS timesheet_director_name,
      COALESCE(so.timesheet_director_role, '') AS timesheet_director_role,
      COALESCE(so.timesheet_site_manager_enabled, false) AS timesheet_site_manager_enabled,
      COUNT(goa.guard_id)::text AS guards_count,
      COALESCE(array_agg(goa.guard_id) FILTER (WHERE goa.guard_id IS NOT NULL), '{}') AS guard_ids,
      '0'::text AS week_shift_count,
      '0'::text AS week_guard_count
    FROM security_objects so
    LEFT JOIN guard_object_assignments goa ON goa.object_id = so.id
    WHERE so.id = $1
    GROUP BY
      so.id,
      so.operational_day_start_time,
      so.timesheet_director_name,
      so.timesheet_director_role,
      so.timesheet_site_manager_enabled
  `, [id]);

  const row = rows[0];
  if (!row) return null;

  return {
    ...mapObjectRow(row),
    guardsCount: Number(row.guards_count),
    guardIds: row.guard_ids ?? [],
    weekShiftCount: 0,
    weekGuardCount: 0,
  };
}

export async function getObjectOperationalDayStartTime(objectId: string): Promise<string> {
  const rows = await query<{ operational_day_start_time: string }>(
    `
      SELECT operational_day_start_time::text AS operational_day_start_time
      FROM security_objects
      WHERE id = $1
    `,
    [objectId],
  );
  return normalizeOperationalAnchorTime(rows[0]?.operational_day_start_time);
}

export async function getObjectOperationalDayStartTimeForMonth(objectId: string, month: string): Promise<string> {
  const setting = await getObjectMonthlySetting(objectId, month);
  if (setting) {
    return normalizeOperationalAnchorTime(setting.operationalDayStartTime);
  }

  // Fallback to the object's default
  const rows = await query<{ operational_day_start_time: string }>(
    `SELECT operational_day_start_time::text AS operational_day_start_time
     FROM security_objects WHERE id = $1`,
    [objectId]
  );

  return normalizeOperationalAnchorTime(rows[0]?.operational_day_start_time || '08:00:00');
}

export async function updateObject(id: string, input: {
  name: string;
  address: string;
  description: string;
  status: "Active" | "Inactive";
}): Promise<void> {
  const name = input.name.trim();
  await query(`
    UPDATE security_objects
    SET name = $1, address = $2, description = $3, status = $4
    WHERE id = $5
  `, [name, input.address.trim(), input.description.trim(), input.status, id]);

  // Табель хранит object_name снапшотом — без синка после rename одна сущность
  // распадается на две строки в сводке/ведомости (старое имя + новое).
  try {
    await query(
      `
        UPDATE timesheet_shift_entries
        SET object_name = $1
        WHERE object_id = $2::uuid
          AND object_name IS DISTINCT FROM $1
      `,
      [name, id],
    );
  } catch (error) {
    if (!isUndefinedColumnOrTableError(error)) throw error;
  }
}

export async function updateObjectOperationalDayStartTime(
  objectId: string,
  operationalDayStartTime: string,
): Promise<void> {
  const anchor = normalizeOperationalAnchorTime(operationalDayStartTime);
  await query(
    `
      UPDATE security_objects
      SET operational_day_start_time = $2::time
      WHERE id = $1
    `,
    [objectId, `${anchor}:00`],
  );
}

export async function updateObjectTimesheetApproval(
  objectId: string,
  input: {
    directorName: string;
    directorRole: string;
    siteManagerEnabled: boolean;
  },
): Promise<void> {
  await query(
    `
      UPDATE security_objects
      SET
        timesheet_director_name = $2,
        timesheet_director_role = $3,
        timesheet_site_manager_enabled = $4
      WHERE id = $1
    `,
    [
      objectId,
      input.directorName.trim(),
      input.directorRole.trim(),
      input.siteManagerEnabled,
    ],
  );
}

export async function listObjectTimesheetApprovalsByIds(
  objectIds: string[],
): Promise<Map<string, Pick<ObjectListRow, "timesheetDirectorName" | "timesheetDirectorRole" | "timesheetSiteManagerEnabled">>> {
  if (objectIds.length === 0) return new Map();

  const rows = await query<{
    id: string;
    timesheet_director_name: string;
    timesheet_director_role: string;
    timesheet_site_manager_enabled: boolean;
  }>(
    `
      SELECT
        id,
        COALESCE(timesheet_director_name, '') AS timesheet_director_name,
        COALESCE(timesheet_director_role, '') AS timesheet_director_role,
        COALESCE(timesheet_site_manager_enabled, false) AS timesheet_site_manager_enabled
      FROM security_objects
      WHERE id = ANY($1::uuid[])
    `,
    [objectIds],
  );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        timesheetDirectorName: row.timesheet_director_name,
        timesheetDirectorRole: row.timesheet_director_role,
        timesheetSiteManagerEnabled: row.timesheet_site_manager_enabled,
      },
    ]),
  );
}

export async function deleteObject(objectId: string): Promise<void> {
  await query(
    `
      DELETE FROM security_objects
      WHERE id = $1
    `,
    [objectId],
  );
}
