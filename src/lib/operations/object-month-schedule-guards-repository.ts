import { query } from "../db/pool";

export async function listObjectMonthScheduleGuardIds(
  objectId: string,
  month: string,
): Promise<string[]> {
  const rows = await query<{ guard_id: string }>(
    `SELECT guard_id
     FROM object_month_schedule_guards
     WHERE object_id = $1 AND month = $2
     ORDER BY created_at ASC`,
    [objectId, month],
  );
  return rows.map((row) => row.guard_id);
}

export async function addGuardToObjectMonthRoster(
  objectId: string,
  month: string,
  guardId: string,
): Promise<void> {
  await query(
    `INSERT INTO object_month_schedule_guards (object_id, month, guard_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (object_id, month, guard_id) DO NOTHING`,
    [objectId, month, guardId],
  );
}

export async function removeGuardFromObjectMonthRoster(
  objectId: string,
  month: string,
  guardId: string,
): Promise<void> {
  await query(
    `DELETE FROM object_month_schedule_guards
     WHERE object_id = $1 AND month = $2 AND guard_id = $3`,
    [objectId, month, guardId],
  );
}
