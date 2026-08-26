import { query } from "../db/pool";
import type { PayrollHalf } from "../payroll/advance-period";
import { periodMonthIso } from "../payroll/advance-period";

export type GuardAdvanceRecord = {
  id: string;
  guardId: string;
  guardName: string;
  objectId: string;
  objectName: string;
  periodMonth: string;
  periodHalf: PayrollHalf;
  amountRub: number;
  issuedByUserId: string;
  issuedByName: string;
  issuedAt: string;
  note: string;
};

export function guardObjectAdvanceKey(guardId: string, objectId: string): string {
  return `${guardId}:${objectId}`;
}

export type GuardAdvanceTotals = {
  firstHalfRub: number;
  secondHalfRub: number;
};

export async function listGuardAdvancesForMonth(
  year: number,
  monthIndex0: number,
  guardId?: string,
): Promise<GuardAdvanceRecord[]> {
  const periodMonth = periodMonthIso(year, monthIndex0);
  const values: string[] = [periodMonth];
  let guardFilter = "";
  if (guardId) {
    values.push(guardId);
    guardFilter = `AND a.guard_id = $${values.length}::uuid`;
  }

  const rows = await query<{
    id: string;
    guard_id: string;
    guard_name: string;
    object_id: string;
    object_name: string | null;
    period_month: string;
    period_half: PayrollHalf;
    amount_rub: string;
    issued_by_user_id: string;
    issued_by_name: string;
    issued_at: string;
    note: string;
  }>(
    `
      SELECT
        a.id,
        a.guard_id,
        trim(g.last_name || ' ' || g.first_name) AS guard_name,
        a.object_id,
        so.name AS object_name,
        a.period_month::text,
        a.period_half,
        a.amount_rub::text,
        a.issued_by_user_id,
        a.issued_by_name,
        a.issued_at::text,
        a.note
      FROM guard_advance_payments a
      JOIN guards g ON g.id = a.guard_id
      LEFT JOIN security_objects so ON so.id = a.object_id
      WHERE a.period_month = $1::date
      ${guardFilter}
      ORDER BY a.issued_at DESC, a.id DESC
    `,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    guardId: row.guard_id,
    guardName: row.guard_name,
    objectId: row.object_id,
    objectName: row.object_name ?? "—",
    periodMonth: row.period_month,
    periodHalf: row.period_half,
    amountRub: Number(row.amount_rub),
    issuedByUserId: row.issued_by_user_id,
    issuedByName: row.issued_by_name,
    issuedAt: row.issued_at,
    note: row.note,
  }));
}

export async function createGuardAdvance(input: {
  guardId: string;
  objectId: string;
  year: number;
  monthIndex0: number;
  periodHalf: PayrollHalf;
  amountRub: number;
  issuedByUserId: string;
  issuedByName: string;
  note?: string;
}): Promise<string> {
  const periodMonth = periodMonthIso(input.year, input.monthIndex0);
  const rows = await query<{ id: string }>(
    `
      INSERT INTO guard_advance_payments (
        guard_id,
        object_id,
        period_month,
        period_half,
        amount_rub,
        issued_by_user_id,
        issued_by_name,
        note
      )
      VALUES ($1::uuid, $2::uuid, $3::date, $4, $5, $6, $7, $8)
      RETURNING id
    `,
    [
      input.guardId,
      input.objectId,
      periodMonth,
      input.periodHalf,
      input.amountRub,
      input.issuedByUserId,
      input.issuedByName,
      input.note?.trim() ?? "",
    ],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error("Не удалось сохранить аванс");
  return id;
}

export async function sumAdvancesByGuardForMonth(
  year: number,
  monthIndex0: number,
  objectId?: string,
): Promise<Map<string, GuardAdvanceTotals>> {
  const periodMonth = periodMonthIso(year, monthIndex0);
  const values: string[] = [periodMonth];
  let objectFilter = "";
  if (objectId) {
    values.push(objectId);
    objectFilter = `AND object_id = $${values.length}::uuid`;
  }
  const rows = await query<{
    guard_id: string;
    period_half: PayrollHalf;
    total_rub: string;
  }>(
    `
      SELECT guard_id, period_half, SUM(amount_rub)::text AS total_rub
      FROM guard_advance_payments
      WHERE period_month = $1::date
      ${objectFilter}
      GROUP BY guard_id, period_half
    `,
    values,
  );

  const map = new Map<string, GuardAdvanceTotals>();
  for (const row of rows) {
    const current = map.get(row.guard_id) ?? { firstHalfRub: 0, secondHalfRub: 0 };
    const total = Number(row.total_rub);
    if (row.period_half === "first") current.firstHalfRub = total;
    else current.secondHalfRub = total;
    map.set(row.guard_id, current);
  }
  return map;
}

export async function sumAdvancesByGuardObjectForMonth(
  year: number,
  monthIndex0: number,
): Promise<Map<string, GuardAdvanceTotals>> {
  const periodMonth = periodMonthIso(year, monthIndex0);
  const rows = await query<{
    guard_id: string;
    object_id: string;
    period_half: PayrollHalf;
    total_rub: string;
  }>(
    `
      SELECT guard_id, object_id, period_half, SUM(amount_rub)::text AS total_rub
      FROM guard_advance_payments
      WHERE period_month = $1::date
      GROUP BY guard_id, object_id, period_half
    `,
    [periodMonth],
  );

  const map = new Map<string, GuardAdvanceTotals>();
  for (const row of rows) {
    const key = guardObjectAdvanceKey(row.guard_id, row.object_id);
    const current = map.get(key) ?? { firstHalfRub: 0, secondHalfRub: 0 };
    const total = Number(row.total_rub);
    if (row.period_half === "first") current.firstHalfRub = total;
    else current.secondHalfRub = total;
    map.set(key, current);
  }
  return map;
}

export async function deleteGuardAdvance(id: string): Promise<void> {
  await query(`DELETE FROM guard_advance_payments WHERE id = $1::uuid`, [id]);
}
