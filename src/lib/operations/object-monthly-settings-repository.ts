import { query } from "../../db/db";

export interface ObjectMonthlySetting {
  id: string;
  objectId: string;
  month: string;
  operationalDayStartTime: string;
}

export async function getObjectMonthlySetting(objectId: string, month: string): Promise<ObjectMonthlySetting | null> {
  const rows = await query<{
    id: string;
    object_id: string;
    month: string;
    operational_day_start_time: string;
  }>(
    `SELECT id, object_id, month, operational_day_start_time::text AS operational_day_start_time
     FROM object_monthly_settings
     WHERE object_id = $1 AND month = $2`,
    [objectId, month]
  );

  if (rows.length === 0) return null;

  return {
    id: rows[0].id,
    objectId: rows[0].object_id,
    month: rows[0].month,
    operationalDayStartTime: rows[0].operational_day_start_time,
  };
}

export async function getObjectOperationalDayStartTimeForMonth(objectId: string, month: string): Promise<string | null> {
  const setting = await getObjectMonthlySetting(objectId, month);
  return setting?.operationalDayStartTime ?? null;
}

export async function upsertObjectMonthlySetting(objectId: string, month: string, startTime: string): Promise<void> {
  await query(
    `INSERT INTO object_monthly_settings (object_id, month, operational_day_start_time)
     VALUES ($1, $2, $3)
     ON CONFLICT (object_id, month) DO UPDATE
     SET operational_day_start_time = EXCLUDED.operational_day_start_time`,
    [objectId, month, startTime]
  );
}
