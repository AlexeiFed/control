import { query } from "../db/pool";
import { normalizeOperationalAnchorTime } from "../scheduling/operational-day-timeline";
import { operationalDayMonthKey } from "../scheduling/operational-day-anchors";

export interface ObjectMonthlySetting {
  id: string;
  objectId: string;
  month: string;
  operationalDayStartTime: string;
}

/**
 * Батч месячных якорей суток: ключ `objectId|YYYY-MM` → HH:mm.
 * Только строки из `object_monthly_settings` (без fallback на security_objects).
 */
export async function listMonthlyOperationalDayStarts(
  objectIds: ReadonlyArray<string>,
  months: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (objectIds.length === 0 || months.length === 0) return out;

  const rows = await query<{
    object_id: string;
    month: string;
    operational_day_start_time: string;
  }>(
    `
      SELECT object_id::text, month, operational_day_start_time::text AS operational_day_start_time
      FROM object_monthly_settings
      WHERE object_id = ANY($1::uuid[])
        AND month = ANY($2::text[])
    `,
    [objectIds, months],
  );

  for (const row of rows) {
    out.set(
      operationalDayMonthKey(row.object_id, row.month),
      normalizeOperationalAnchorTime(row.operational_day_start_time),
    );
  }
  return out;
}

/** Месяцы YYYY-MM, покрывающие набор civil-дат. */
export function monthKeysFromDateIsos(dateIsos: ReadonlyArray<string>): string[] {
  return [...new Set(dateIsos.map((iso) => iso.slice(0, 7)).filter((m) => /^\d{4}-\d{2}$/.test(m)))];
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
