import { isUndefinedColumnOrTableError } from "../db/column-compat";
import { query } from "../db/pool";
import { shortageDismissKey } from "../scheduling/schedule-shortage-dismiss";

export async function listShortageDismissals(
  objectIds: string[],
  dateFromIso: string,
  dateToIso: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (objectIds.length === 0) return map;

  try {
    const rows = await query<{
      object_id: string;
      date_iso: string;
      fingerprint: string;
    }>(
      `
        SELECT object_id::text, date_iso::text, fingerprint
        FROM schedule_day_shortage_dismissals
        WHERE object_id = ANY($1::uuid[])
          AND date_iso >= $2::date
          AND date_iso <= $3::date
      `,
      [objectIds, dateFromIso, dateToIso],
    );

    for (const row of rows) {
      const iso = row.date_iso.slice(0, 10);
      map.set(shortageDismissKey(row.object_id, iso), row.fingerprint);
    }
  } catch (error) {
    if (!isUndefinedColumnOrTableError(error)) throw error;
  }

  return map;
}

export async function upsertShortageDismissal(input: {
  objectId: string;
  dateIso: string;
  fingerprint: string;
  dismissedBy: string;
}): Promise<void> {
  try {
    await query(
      `
        INSERT INTO schedule_day_shortage_dismissals
          (object_id, date_iso, fingerprint, dismissed_by, dismissed_at)
        VALUES ($1::uuid, $2::date, $3, $4, now())
        ON CONFLICT (object_id, date_iso) DO UPDATE SET
          fingerprint = EXCLUDED.fingerprint,
          dismissed_by = EXCLUDED.dismissed_by,
          dismissed_at = now()
      `,
      [input.objectId, input.dateIso, input.fingerprint, input.dismissedBy],
    );
  } catch (error) {
    if (isUndefinedColumnOrTableError(error)) {
      throw new Error(
        "На сервере не применена миграция dismiss недобора по дням (20260723). Выполните npm run db:migrate на сервере.",
      );
    }
    throw error;
  }
}
