/**
 * Репозиторий для управления праздниками, привязанными к конкретным объектам.
 */

import { query } from "../db/pool";

export type ObjectHolidayRecord = {
  id: string;
  objectId: string;
  holidayDate: string; // ISO date
  name: string;
};

export async function listObjectHolidays(objectId: string): Promise<ObjectHolidayRecord[]> {
  const rows = await query<any>(
    `
      SELECT id, object_id, holiday_date::text as holiday_date, name
      FROM object_holidays
      WHERE object_id = $1
      ORDER BY holiday_date
    `,
    [objectId],
  );

  return rows.map((r) => ({
    id: r.id,
    objectId: r.object_id,
    holidayDate: r.holiday_date,
    name: r.name,
  }));
}

export async function addObjectHoliday(objectId: string, date: string, name: string): Promise<void> {
  await query(
    `
      INSERT INTO object_holidays (object_id, holiday_date, name)
      VALUES ($1, $2, $3)
      ON CONFLICT (object_id, holiday_date) DO UPDATE SET name = EXCLUDED.name
    `,
    [objectId, date, name],
  );
}

export async function deleteObjectHoliday(id: string): Promise<void> {
  await query(`DELETE FROM object_holidays WHERE id = $1`, [id]);
}
