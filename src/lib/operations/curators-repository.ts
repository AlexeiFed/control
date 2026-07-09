import { query } from "../db/pool";
import {
  DEFAULT_CURATOR_TARIFFS,
  isScheduleCuratorWorkType,
  type CuratorTariffs,
  type CuratorWorkType,
} from "../curators/work-entry-amount";
import { createCuratorWithGuard, ensureAllCuratorGuardsLinked } from "./curators-guards-link";

export type CuratorRecord = {
  id: string;
  guardId: string;
  firstName: string;
  lastName: string;
  totalRub: number;
};

export type CuratorMonthlyPaymentRecord = {
  curatorId: string;
  isPaid: boolean;
  paidAmountRub: number;
};

export type CuratorWorkEntryRecord = {
  id: string;
  curatorId: string;
  curatorFirstName: string;
  curatorLastName: string;
  workDate: string;
  workType: CuratorWorkType;
  hours: number | null;
  amountRub: number;
  isBaseIncluded: boolean;
  customBaseRub: number | null;
  customHourlyRate: number | null;
  shiftId: string | null;
  objectId: string | null;
  description: string;
  paymentFormula: string;
  ruleName: string | null;
  objectHourlyRateRub: number | null;
  isAdminLocked: boolean;
};

export type CuratorDailyTotalsRecord = {
  curatorId: string;
  curatorFirstName: string;
  curatorLastName: string;
  workDate: string;
  totalHours: number;
  totalRub: number;
};

type CuratorRow = {
  id: string;
  guard_id: string;
  first_name: string;
  last_name: string;
  total_rub: string | null;
};

type EntryRow = {
  id: string;
  curator_id: string;
  curator_first_name: string;
  curator_last_name: string;
  work_date: string;
  work_type: CuratorWorkType;
  hours: string | null;
  amount_rub: string;
  is_base_included: boolean;
  custom_hourly_rate: string | null;
  shift_id: string | null;
  object_id: string | null;
  description: string;
  payment_formula: string;
  rule_name: string | null;
  object_hourly_rate_rub: string | null;
  is_admin_locked: boolean;
};

type DailyTotalsRow = {
  curator_id: string;
  curator_first_name: string;
  curator_last_name: string;
  work_date: string;
  total_hours: string;
  total_rub: string;
};

function mapCurator(row: CuratorRow): CuratorRecord {
  return {
    id: row.id,
    guardId: row.guard_id,
    firstName: row.first_name,
    lastName: row.last_name,
    totalRub: Number(row.total_rub ?? 0),
  };
}

function mapDailyTotals(row: DailyTotalsRow): CuratorDailyTotalsRecord {
  return {
    curatorId: row.curator_id,
    curatorFirstName: row.curator_first_name,
    curatorLastName: row.curator_last_name,
    workDate: String(row.work_date).slice(0, 10),
    totalHours: Number(row.total_hours),
    totalRub: Number(row.total_rub),
  };
}

function mapEntry(row: EntryRow): CuratorWorkEntryRecord {
  return {
    id: row.id,
    curatorId: row.curator_id,
    curatorFirstName: row.curator_first_name,
    curatorLastName: row.curator_last_name,
    workDate: String(row.work_date).slice(0, 10),
    workType: row.work_type,
    hours: row.hours == null ? null : Number(row.hours),
    amountRub: Number(row.amount_rub),
    isBaseIncluded: row.is_base_included,
    customBaseRub: null,
    customHourlyRate: row.custom_hourly_rate == null ? null : Number(row.custom_hourly_rate),
    shiftId: row.shift_id,
    objectId: row.object_id,
    description: row.description ?? "",
    paymentFormula: row.payment_formula ?? "",
    ruleName: row.rule_name,
    objectHourlyRateRub: row.object_hourly_rate_rub == null ? null : Number(row.object_hourly_rate_rub),
    isAdminLocked: row.is_admin_locked,
  };
}

const entrySelectSql = `
  e.id,
  e.curator_id,
  c.first_name AS curator_first_name,
  c.last_name AS curator_last_name,
  e.work_date::text AS work_date,
  e.work_type,
  e.hours::text AS hours,
  e.amount_rub::text AS amount_rub,
  e.is_base_included,
  e.custom_hourly_rate::text AS custom_hourly_rate,
  e.shift_id,
  e.object_id,
  e.description,
  e.payment_formula,
  e.rule_name,
  e.object_hourly_rate_rub::text AS object_hourly_rate_rub,
  e.is_admin_locked
`;

export async function listCuratorsWithTotals(): Promise<CuratorRecord[]> {
  await ensureAllCuratorGuardsLinked();

  const rows = await query<CuratorRow>(
    `
      SELECT
        c.id,
        g.id AS guard_id,
        g.first_name,
        g.last_name,
        COALESCE(SUM(e.amount_rub), 0)::text AS total_rub
      FROM guards g
      INNER JOIN curators c ON c.guard_id = g.id
      LEFT JOIN curator_work_entries e ON e.curator_id = c.id
      WHERE g.position = 'Curator'
      GROUP BY g.id, c.id, g.first_name, g.last_name
      ORDER BY g.last_name ASC, g.first_name ASC
    `,
  );
  return rows.map(mapCurator);
}

export async function createCurator(input: { firstName: string; lastName: string }): Promise<string> {
  return createCuratorWithGuard(input);
}

export async function deleteCurator(id: string): Promise<void> {
  await query(`DELETE FROM curators WHERE id = $1`, [id]);
}

export async function listEntriesForDate(workDate: string): Promise<CuratorWorkEntryRecord[]> {
  const rows = await query<EntryRow>(
    `
      SELECT
        ${entrySelectSql}
      FROM curator_work_entries e
      JOIN curators c ON c.id = e.curator_id
      WHERE e.work_date = $1::date
      ORDER BY c.last_name ASC, c.first_name ASC, e.created_at ASC
    `,
    [workDate],
  );
  return rows.map(mapEntry);
}

/** Суммы по дням в полуинтервале [startInclusive, endExclusive) для подсветки календаря. */
export async function sumEntryRubByDateInRange(
  startInclusive: string,
  endExclusive: string,
): Promise<Array<{ workDate: string; totalRub: number }>> {
  const rows = await query<{ work_date: string; total_rub: string }>(
    `
      SELECT work_date::text AS work_date, SUM(amount_rub)::text AS total_rub
      FROM curator_work_entries
      WHERE work_date >= $1::date AND work_date < $2::date
      GROUP BY work_date
      ORDER BY work_date ASC
    `,
    [startInclusive, endExclusive],
  );
  return rows.map((r) => ({
    workDate: String(r.work_date).slice(0, 10),
    totalRub: Number(r.total_rub),
  }));
}

/** Суммы по кураторам в полуинтервале [startInclusive, endExclusive). */
export async function sumEntryRubByCuratorInRange(
  startInclusive: string,
  endExclusive: string,
): Promise<Array<{ curatorId: string; totalRub: number }>> {
  const rows = await query<{ curator_id: string; total_rub: string }>(
    `
      SELECT curator_id, SUM(amount_rub)::text AS total_rub
      FROM curator_work_entries
      WHERE work_date >= $1::date AND work_date < $2::date
      GROUP BY curator_id
    `,
    [startInclusive, endExclusive],
  );
  return rows.map((r) => ({
    curatorId: r.curator_id,
    totalRub: Number(r.total_rub),
  }));
}

/** Дневные итоги по кураторам за включённый диапазон дат. */
export async function listCuratorDailyTotalsInRange(
  startInclusive: string,
  endInclusive: string,
): Promise<CuratorDailyTotalsRecord[]> {
  const rows = await query<DailyTotalsRow>(
    `
      SELECT
        e.curator_id,
        c.first_name AS curator_first_name,
        c.last_name AS curator_last_name,
        e.work_date::text AS work_date,
        COALESCE(SUM(e.hours), 0)::text AS total_hours,
        COALESCE(SUM(e.amount_rub), 0)::text AS total_rub
      FROM curator_work_entries e
      JOIN curators c ON c.id = e.curator_id
      WHERE e.work_date >= $1::date AND e.work_date <= $2::date
      GROUP BY e.curator_id, c.first_name, c.last_name, e.work_date
      ORDER BY c.last_name ASC, c.first_name ASC, e.work_date ASC
    `,
    [startInclusive, endInclusive],
  );

  return rows.map(mapDailyTotals);
}

export async function createWorkEntry(input: {
  curatorId: string;
  workDate: string;
  workType: CuratorWorkType;
  hours: number | null;
  amountRub: number;
  createdByUserId: string;
  isBaseIncluded?: boolean;
  customHourlyRate?: number | null;
}): Promise<void> {
  await query(
    `
      INSERT INTO curator_work_entries (
        curator_id, work_date, work_type, hours, amount_rub, 
        created_by_user_id, is_base_included, custom_hourly_rate
      )
      VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8)
    `,
    [
      input.curatorId,
      input.workDate,
      input.workType,
      input.hours,
      input.amountRub,
      input.createdByUserId,
      input.isBaseIncluded ?? true,
      input.customHourlyRate ?? null,
    ],
  );
}

export async function getWorkEntryById(entryId: string): Promise<CuratorWorkEntryRecord | null> {
  const rows = await query<EntryRow>(
    `
      SELECT ${entrySelectSql}
      FROM curator_work_entries e
      JOIN curators c ON c.id = e.curator_id
      WHERE e.id = $1::uuid
    `,
    [entryId],
  );
  return rows[0] ? mapEntry(rows[0]) : null;
}

export async function updateWorkEntry(input: {
  id: string;
  workType: CuratorWorkType;
  hours: number | null;
  amountRub: number;
  isBaseIncluded: boolean;
  customBaseRub: number | null;
  customHourlyRate: number | null;
  isAdminLocked?: boolean;
}): Promise<void> {
  await query(
    `
      UPDATE curator_work_entries
      SET 
        work_type = $2,
        hours = $3,
        amount_rub = $4,
        is_base_included = $5,
        custom_hourly_rate = $6,
        is_admin_locked = COALESCE($7, is_admin_locked),
        updated_at = now()
      WHERE id = $1::uuid
    `,
    [
      input.id,
      input.workType,
      input.hours,
      input.amountRub,
      input.isBaseIncluded,
      input.customHourlyRate,
      input.isAdminLocked ?? null,
    ],
  );
}

function periodMonthFromYearMonthIndex0(year: number, monthIndex0: number): string {
  return `${String(year).padStart(4, "0")}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
}

export async function listCuratorMonthlyPaymentsForMonth(
  year: number,
  monthIndex0: number,
): Promise<CuratorMonthlyPaymentRecord[]> {
  const periodMonth = periodMonthFromYearMonthIndex0(year, monthIndex0);
  const rows = await query<{
    curator_id: string;
    is_paid: boolean;
    paid_amount_rub: string;
  }>(
    `
      SELECT curator_id, is_paid, paid_amount_rub::text
      FROM curator_monthly_payments
      WHERE period_month = $1::date
    `,
    [periodMonth],
  );
  return rows.map((r) => ({
    curatorId: r.curator_id,
    isPaid: r.is_paid,
    paidAmountRub: Number(r.paid_amount_rub),
  }));
}

export async function upsertCuratorMonthlyPayment(input: {
  curatorId: string;
  year: number;
  monthIndex0: number;
  isPaid: boolean;
  paidAmountRub: number;
}): Promise<void> {
  const periodMonth = periodMonthFromYearMonthIndex0(input.year, input.monthIndex0);
  await query(
    `
      INSERT INTO curator_monthly_payments (curator_id, period_month, is_paid, paid_amount_rub, updated_at)
      VALUES ($1::uuid, $2::date, $3, $4, now())
      ON CONFLICT (curator_id, period_month) DO UPDATE SET
        is_paid = EXCLUDED.is_paid,
        paid_amount_rub = EXCLUDED.paid_amount_rub,
        updated_at = now()
    `,
    [input.curatorId, periodMonth, input.isPaid, input.paidAmountRub],
  );
}

/** Даты оклада по кураторам в полуинтервале [startInclusive, endExclusive). */
export async function listMonthlySalaryDatesByCuratorInRange(
  startInclusive: string,
  endExclusive: string,
): Promise<Record<string, string>> {
  const rows = await query<{ curator_id: string; work_date: string }>(
    `
      SELECT curator_id, work_date::text AS work_date
      FROM curator_work_entries
      WHERE work_type = 'MonthlySalary'
        AND work_date >= $1::date
        AND work_date < $2::date
    `,
    [startInclusive, endExclusive],
  );
  return Object.fromEntries(
    rows.map((r) => [r.curator_id, String(r.work_date).slice(0, 10)]),
  );
}

/** ISO-дата существующего оклада в месяце workDate, если уже назначен. */
export async function findMonthlySalaryDateInMonth(
  curatorId: string,
  workDate: string,
  excludeEntryId?: string,
): Promise<string | null> {
  const [y, m] = workDate.split("-").map(Number);
  const start = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const endExclusive = `${String(next.y).padStart(4, "0")}-${String(next.m).padStart(2, "0")}-01`;

  const rows = await query<{ work_date: string }>(
    `
      SELECT work_date::text AS work_date
      FROM curator_work_entries
      WHERE curator_id = $1::uuid
        AND work_type = 'MonthlySalary'
        AND work_date >= $2::date
        AND work_date < $3::date
        AND ($4::uuid IS NULL OR id <> $4::uuid)
      ORDER BY work_date ASC
      LIMIT 1
    `,
    [curatorId, start, endExclusive, excludeEntryId ?? null],
  );
  return rows[0] ? String(rows[0].work_date).slice(0, 10) : null;
}

export async function deleteCuratorWorkEntryById(entryId: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    `DELETE FROM curator_work_entries WHERE id = $1::uuid RETURNING id`,
    [entryId],
  );
  return rows.length > 0;
}

const CURATOR_TARIFFS_ROW_ID = 1;

type TariffsRow = {
  route_base_rub: string;
  route_hourly_rub: string;
  night_inspection_rub: string;
  replacement_hourly_rub: string;
  schedule_regular_hourly_rub: string;
};

function mapTariffsRow(row: TariffsRow): CuratorTariffs {
  return {
    routeBaseRub: Number(row.route_base_rub),
    routeHourlyRub: Number(row.route_hourly_rub),
    nightInspectionRub: Number(row.night_inspection_rub),
    replacementHourlyRub: Number(row.replacement_hourly_rub),
    scheduleRegularHourlyRub: Number(row.schedule_regular_hourly_rub),
  };
}

export async function getCuratorTariffs(): Promise<CuratorTariffs> {
  const rows = await query<TariffsRow>(
    `
      SELECT
        route_base_rub::text,
        route_hourly_rub::text,
        night_inspection_rub::text,
        replacement_hourly_rub::text,
        schedule_regular_hourly_rub::text
      FROM curator_tariffs_settings
      WHERE id = $1
    `,
    [CURATOR_TARIFFS_ROW_ID],
  );
  if (rows.length === 0) {
    return { ...DEFAULT_CURATOR_TARIFFS };
  }
  return mapTariffsRow(rows[0]!);
}

export async function saveCuratorTariffs(input: CuratorTariffs): Promise<void> {
  await query(
    `
      INSERT INTO curator_tariffs_settings (
        id,
        route_base_rub,
        route_hourly_rub,
        night_inspection_rub,
        replacement_hourly_rub,
        schedule_regular_hourly_rub
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        route_base_rub = EXCLUDED.route_base_rub,
        route_hourly_rub = EXCLUDED.route_hourly_rub,
        night_inspection_rub = EXCLUDED.night_inspection_rub,
        replacement_hourly_rub = EXCLUDED.replacement_hourly_rub,
        schedule_regular_hourly_rub = EXCLUDED.schedule_regular_hourly_rub,
        updated_at = now()
    `,
    [
      CURATOR_TARIFFS_ROW_ID,
      input.routeBaseRub,
      input.routeHourlyRub,
      input.nightInspectionRub,
      input.replacementHourlyRub,
      input.scheduleRegularHourlyRub,
    ],
  );
}
