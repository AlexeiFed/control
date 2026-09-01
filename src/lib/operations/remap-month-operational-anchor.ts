import { getDbPool } from "../db/pool";
import { shiftsHaveIncidentColumns } from "../db/column-compat";
import { splitMinutesByMonth, totalMinutesByMonth } from "../scheduling/month-split";
import { planShiftsRematToNewAnchor } from "../scheduling/remap-operational-anchor";
import { listShiftsForObjectInLocalMonth } from "./scheduler-repository";
import { syncShiftDerivedEntries } from "../scheduling/sync-shift-derived";

function parseMonth(month: string): { year: number; monthIndex0: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error("Некорректный месяц");
  const year = Number(m[1]);
  const monthIndex0 = Number(m[2]) - 1;
  if (!Number.isFinite(year) || monthIndex0 < 0 || monthIndex0 > 11) {
    throw new Error("Некорректный месяц");
  }
  return { year, monthIndex0 };
}

/** Сдвигает смены месяца на новый якорь суток, колонки графика не меняются. */
export async function rematObjectMonthShiftsForOperationalAnchor(input: {
  objectId: string;
  month: string;
  oldAnchor: string;
  newAnchor: string;
}): Promise<number> {
  const { year, monthIndex0 } = parseMonth(input.month);
  const shifts = await listShiftsForObjectInLocalMonth(input.objectId, year, monthIndex0);
  const plan = planShiftsRematToNewAnchor(shifts, input.month, input.oldAnchor, input.newAnchor);
  if (plan.length === 0) return 0;

  const hasIncident = await shiftsHaveIncidentColumns();
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const item of plan) {
      if (!item.guardId) continue;
      const overlap = await client.query<{ id: string; object_id: string }>(
        `
          SELECT id, object_id
          FROM shifts
          WHERE guard_id = $1::uuid
            AND object_id <> $2::uuid
            AND is_no_show = false
            AND starts_at < $4
            AND ends_at > $3
          LIMIT 1
        `,
        [item.guardId, input.objectId, item.startsAt.toISOString(), item.endsAt.toISOString()],
      );
      if (overlap.rows[0]) {
        throw new Error("Нельзя сменить сутки: смена пересечётся с другим объектом");
      }

      const monthMinutes = splitMinutesByMonth(item.startsAt, item.endsAt);
      const totalMinutes = totalMinutesByMonth(monthMinutes);
      if (hasIncident) {
        await client.query(
          `
            UPDATE shifts
            SET
              starts_at = $2,
              ends_at = $3,
              total_minutes = $4,
              month_minutes = $5::jsonb,
              incident_worked_until_at = $6
            WHERE id = $1::uuid
          `,
          [
            item.shiftId,
            item.startsAt.toISOString(),
            item.endsAt.toISOString(),
            totalMinutes,
            JSON.stringify(monthMinutes),
            item.incidentWorkedUntilAt?.toISOString() ?? null,
          ],
        );
      } else {
        await client.query(
          `
            UPDATE shifts
            SET
              starts_at = $2,
              ends_at = $3,
              total_minutes = $4,
              month_minutes = $5::jsonb
            WHERE id = $1::uuid
          `,
          [
            item.shiftId,
            item.startsAt.toISOString(),
            item.endsAt.toISOString(),
            totalMinutes,
            JSON.stringify(monthMinutes),
          ],
        );
      }
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  for (const item of plan) {
    await syncShiftDerivedEntries(item.shiftId, "schedule-sync");
  }

  return plan.length;
}
