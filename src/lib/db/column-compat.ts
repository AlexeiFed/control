import { query } from "./pool";

const columnExistsCache = new Map<string, boolean>();

export async function tableColumnExists(tableName: string, columnName: string): Promise<boolean> {
  const key = `${tableName}.${columnName}`;
  const cached = columnExistsCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const rows = await query<{ exists: boolean }>(
      `
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = $1
            AND column_name = $2
        ) AS exists
      `,
      [tableName, columnName],
    );
    const exists = rows[0]?.exists === true;
    columnExistsCache.set(key, exists);
    return exists;
  } catch {
    columnExistsCache.set(key, false);
    return false;
  }
}

export function isUndefinedColumnOrTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "42703" || error.code === "42P01")
  );
}

/** SELECT-фрагмент колонок инцидента смены (старые БД без миграции 20260512). */
export async function getShiftIncidentSelectColumns(alias = ""): Promise<string> {
  const prefix = alias ? `${alias}.` : "";
  const has = await tableColumnExists("shifts", "incident_category");
  if (!has) {
    return `
      NULL::text AS incident_category,
      ''::text AS incident_comment,
      NULL::timestamptz AS incident_worked_until_at,
      NULL::timestamptz AS incident_recorded_at,
      NULL::uuid AS replaced_by_shift_id`;
  }
  return `
      ${prefix}incident_category,
      ${prefix}incident_comment,
      ${prefix}incident_worked_until_at,
      ${prefix}incident_recorded_at,
      ${prefix}replaced_by_shift_id`;
}

export async function shiftsHaveIncidentColumns(): Promise<boolean> {
  return tableColumnExists("shifts", "incident_recorded_at");
}

export async function shiftsHaveIncidentAlertDismissedColumn(): Promise<boolean> {
  return tableColumnExists("shifts", "incident_alert_dismissed_at");
}

/** RETURNING-фрагмент колонок инцидента после INSERT/UPDATE (старые БД без миграции 20260512). */
export async function getShiftIncidentReturningColumns(): Promise<string> {
  const has = await tableColumnExists("shifts", "incident_category");
  if (!has) return "";
  return `,
          incident_category,
          incident_comment,
          incident_worked_until_at,
          incident_recorded_at,
          replaced_by_shift_id`;
}

/** SELECT-фрагмент `selected_rate_rule_id` (старые БД без миграции 20260615). */
export async function getShiftSelectedRateRuleSelect(alias = ""): Promise<string> {
  const prefix = alias ? `${alias}.` : "";
  const has = await tableColumnExists("shifts", "selected_rate_rule_id");
  if (!has) return "NULL::uuid AS selected_rate_rule_id";
  return `${prefix}selected_rate_rule_id`;
}

export async function shiftsHaveSelectedRateRuleColumn(): Promise<boolean> {
  return tableColumnExists("shifts", "selected_rate_rule_id");
}
