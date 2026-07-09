import { query } from "../db/pool";
import type { PayrollHalf } from "../payroll/advance-period";
import { periodMonthIso } from "../payroll/advance-period";

export type GuardAdvanceRecord = {
  id: string;
  guardId: string;
  guardName: string;
  periodMonth: string;
  periodHalf: PayrollHalf;
  amountRub: number;
  issuedByUserId: string;
  issuedByName: string;
  issuedAt: string;
  note: string;
};

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
        a.period_month::text,
        a.period_half,
        a.amount_rub::text,
        a.issued_by_user_id,
        a.issued_by_name,
        a.issued_at::text,
        a.note
      FROM guard_advance_payments a
      JOIN guards g ON g.id = a.guard_id
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
        period_month,
        period_half,
        amount_rub,
        issued_by_user_id,
        issued_by_name,
        note
      )
      VALUES ($1::uuid, $2::date, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      input.guardId,
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
): Promise<Map<string, GuardAdvanceTotals>> {
  const periodMonth = periodMonthIso(year, monthIndex0);
  const rows = await query<{
    guard_id: string;
    period_half: PayrollHalf;
    total_rub: string;
  }>(
    `
      SELECT guard_id, period_half, SUM(amount_rub)::text AS total_rub
      FROM guard_advance_payments
      WHERE period_month = $1::date
      GROUP BY guard_id, period_half
    `,
    [periodMonth],
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

export async function deleteGuardAdvance(id: string): Promise<void> {
  await query(`DELETE FROM guard_advance_payments WHERE id = $1::uuid`, [id]);
}
