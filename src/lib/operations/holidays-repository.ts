import { query } from "../db/pool";

export type HolidayRecord = {
  id: string;
  holidayDate: string;
  name: string;
};

type HolidayRow = {
  id: string;
  holiday_date: string;
  name: string;
};

function mapRow(row: HolidayRow): HolidayRecord {
  return {
    id: row.id,
    holidayDate: String(row.holiday_date).slice(0, 10),
    name: row.name,
  };
}

/** `endExclusive` — первая дата после периода (как верхняя граница смен в табеле). */
export async function listHolidaysInRange(
  startInclusive: string,
  endExclusive: string,
): Promise<HolidayRecord[]> {
  const rows = await query<HolidayRow>(
    `
      SELECT id, holiday_date::text AS holiday_date, name
      FROM holidays
      WHERE holiday_date >= $1::date AND holiday_date < $2::date
      ORDER BY holiday_date ASC, name ASC
    `,
    [startInclusive, endExclusive],
  );
  return rows.map(mapRow);
}

export async function listAllHolidays(): Promise<HolidayRecord[]> {
  const rows = await query<HolidayRow>(
    `
      SELECT id, holiday_date::text AS holiday_date, name
      FROM holidays
      ORDER BY holiday_date DESC, name ASC
    `,
  );
  return rows.map(mapRow);
}

export async function createHoliday(input: { holidayDate: string; name: string }): Promise<void> {
  await query(
    `
      INSERT INTO holidays (holiday_date, name)
      VALUES ($1::date, $2)
      ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name
    `,
    [input.holidayDate, input.name.trim()],
  );
}

export async function deleteHoliday(id: string): Promise<string | null> {
  const rows = await query<{ holiday_date: string }>(
    `DELETE FROM holidays WHERE id = $1 RETURNING holiday_date::text AS holiday_date`,
    [id],
  );
  const raw = rows[0]?.holiday_date;
  return raw ? String(raw).slice(0, 10) : null;
}
