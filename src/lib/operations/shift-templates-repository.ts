import { tableColumnExists } from "../db/column-compat";
import { getDbPool, query } from "../db/pool";
import { getPreviousCivilDate, getTemplateVersionEffectiveTo } from "../scheduling/shift-template-history";

async function getShiftTemplateExtraSelects(): Promise<{
  shiftHours: string;
  reinforcementShiftHours: string;
  shiftsRapidResponsePerDay: string;
  rapidResponseShiftHours: string;
  shiftsShiftLeadPerDay: string;
  shiftLeadShiftHours: string;
  insertReinforcementHoursColumn: boolean;
  insertShiftLeadColumns: boolean;
}> {
  const [hasShiftHours, hasReinforcementHours, hasRapidResponse, hasRapidResponseHours, hasShiftLead, hasShiftLeadHours] =
    await Promise.all([
    tableColumnExists("object_shift_templates", "shift_hours"),
    tableColumnExists("object_shift_templates", "reinforcement_shift_hours"),
    tableColumnExists("object_shift_templates", "shifts_rapid_response_per_day"),
    tableColumnExists("object_shift_templates", "rapid_response_shift_hours"),
    tableColumnExists("object_shift_templates", "shifts_shift_lead_per_day"),
    tableColumnExists("object_shift_templates", "shift_lead_shift_hours"),
  ]);
  return {
    shiftHours: hasShiftHours ? "shift_hours" : "24 AS shift_hours",
    reinforcementShiftHours: hasReinforcementHours
      ? "reinforcement_shift_hours"
      : "24 AS reinforcement_shift_hours",
    shiftsRapidResponsePerDay: hasRapidResponse
      ? "shifts_rapid_response_per_day"
      : "0 AS shifts_rapid_response_per_day",
    rapidResponseShiftHours: hasRapidResponseHours
      ? "rapid_response_shift_hours"
      : "24 AS rapid_response_shift_hours",
    shiftsShiftLeadPerDay: hasShiftLead ? "shifts_shift_lead_per_day" : "0 AS shifts_shift_lead_per_day",
    shiftLeadShiftHours: hasShiftLeadHours ? "shift_lead_shift_hours" : "24 AS shift_lead_shift_hours",
    insertReinforcementHoursColumn: hasReinforcementHours,
    insertShiftLeadColumns: hasShiftLead && hasShiftLeadHours,
  };
}

export type ObjectShiftTemplateRow = {
  objectId: string;
  dayOfWeek: number;
  shiftsPerDay: number;
  shiftsReinforcementPerDay: number;
  shiftHours?: number;
  reinforcementShiftHours?: number;
  shiftsRapidResponsePerDay?: number;
  rapidResponseShiftHours?: number;
  shiftsShiftLeadPerDay?: number;
  shiftLeadShiftHours?: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  postId?: string | null;
};

type DbRow = {
  object_id: string;
  day_of_week: number;
  shifts_per_day: number;
  shifts_reinforcement_per_day: number;
  shift_hours: number;
  reinforcement_shift_hours: number;
  shifts_rapid_response_per_day: number;
  rapid_response_shift_hours: number;
  shifts_shift_lead_per_day: number;
  shift_lead_shift_hours: number;
  effective_from: string;
  effective_to: string | null;
  post_id: string | null;
};

function mapRow(row: DbRow): ObjectShiftTemplateRow {
  return {
    objectId: row.object_id,
    dayOfWeek: row.day_of_week,
    shiftsPerDay: row.shifts_per_day,
    shiftsReinforcementPerDay: row.shifts_reinforcement_per_day,
    shiftHours: row.shift_hours ?? 24,
    reinforcementShiftHours: row.reinforcement_shift_hours ?? 24,
    shiftsRapidResponsePerDay: row.shifts_rapid_response_per_day ?? 0,
    rapidResponseShiftHours: row.rapid_response_shift_hours ?? 24,
    shiftsShiftLeadPerDay: row.shifts_shift_lead_per_day ?? 0,
    shiftLeadShiftHours: row.shift_lead_shift_hours ?? 24,
    effectiveFrom: String(row.effective_from).slice(0, 10),
    effectiveTo: row.effective_to ? String(row.effective_to).slice(0, 10) : null,
    postId: row.post_id,
  };
}

export async function listShiftTemplatesForObjectIds(objectIds: string[]): Promise<ObjectShiftTemplateRow[]> {
  if (objectIds.length === 0) return [];
  const extra = await getShiftTemplateExtraSelects();
  const hasPostId = await tableColumnExists("object_shift_templates", "post_id");
  const rows = await query<DbRow>(
    `
      SELECT
        object_id,
        day_of_week,
        shifts_per_day,
        shifts_reinforcement_per_day,
        ${extra.shiftHours},
        ${extra.reinforcementShiftHours},
        ${extra.shiftsRapidResponsePerDay},
        ${extra.rapidResponseShiftHours},
        ${extra.shiftsShiftLeadPerDay},
        ${extra.shiftLeadShiftHours},
        effective_from::text,
        effective_to::text,
        ${hasPostId ? "post_id" : "NULL::uuid AS post_id"}
      FROM object_shift_templates
      WHERE object_id = ANY($1::uuid[])
      ORDER BY object_id, day_of_week, effective_from ASC
    `,
    [objectIds],
  );
  return rows.map(mapRow);
}

/** Копирует активные шаблоны объекта (post_id IS NULL) на новый пост. */
export async function copyShiftTemplatesToPost(objectId: string, postId: string): Promise<void> {
  const hasPostId = await tableColumnExists("object_shift_templates", "post_id");
  if (!hasPostId) return;

  await query(
    `
      INSERT INTO object_shift_templates (
        object_id,
        day_of_week,
        shifts_per_day,
        shifts_reinforcement_per_day,
        shift_hours,
        reinforcement_shift_hours,
        shifts_rapid_response_per_day,
        rapid_response_shift_hours,
        shifts_shift_lead_per_day,
        shift_lead_shift_hours,
        effective_from,
        effective_to,
        post_id
      )
      SELECT
        object_id,
        day_of_week,
        shifts_per_day,
        shifts_reinforcement_per_day,
        shift_hours,
        reinforcement_shift_hours,
        shifts_rapid_response_per_day,
        rapid_response_shift_hours,
        shifts_shift_lead_per_day,
        shift_lead_shift_hours,
        effective_from,
        effective_to,
        $2::uuid
      FROM object_shift_templates
      WHERE object_id = $1
        AND post_id IS NULL
        AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    `,
    [objectId, postId],
  );
}

/** Сохраняет новую версию шаблона, закрывая предыдущую историю без изменения старых дат. */
export async function replaceShiftTemplatesForObject(
  objectId: string,
  perDay: Array<{
    dayOfWeek: number;
    shiftsPerDay: number;
    shiftsReinforcementPerDay: number;
    shiftHours: number;
    reinforcementShiftHours: number;
    shiftsRapidResponsePerDay: number;
    rapidResponseShiftHours: number;
    shiftsShiftLeadPerDay: number;
    shiftLeadShiftHours: number;
  }>,
  effectiveFrom: string,
  postId: string | null = null,
): Promise<void> {
  const pool = getDbPool();
  const client = await pool.connect();
  const extra = await getShiftTemplateExtraSelects();
  const hasPostId = await tableColumnExists("object_shift_templates", "post_id");
  const postScope = (paramIndex: number): { sql: string; params: string[] } => {
    if (!hasPostId) return { sql: "", params: [] };
    if (postId) return { sql: ` AND post_id = $${paramIndex}::uuid`, params: [postId] };
    return { sql: " AND post_id IS NULL", params: [] };
  };
  try {
    await client.query("BEGIN");
    const deleteFuture = postScope(3);
    await client.query(
      `DELETE FROM object_shift_templates WHERE object_id = $1 AND effective_from > $2::date${deleteFuture.sql}`,
      [objectId, effectiveFrom, ...deleteFuture.params],
    );
    const previousEffectiveTo = getPreviousCivilDate(effectiveFrom);
    const selectNext = postScope(3);
    const nextRows = await client.query<{ effective_from: string }>(
      `
        SELECT MIN(effective_from)::text AS effective_from
        FROM object_shift_templates
        WHERE object_id = $1
          AND effective_from > $2::date
          ${selectNext.sql}
      `,
      [objectId, effectiveFrom, ...selectNext.params],
    );
    const nextEffectiveFrom = nextRows.rows[0]?.effective_from
      ? String(nextRows.rows[0].effective_from).slice(0, 10)
      : null;
    const newEffectiveTo = getTemplateVersionEffectiveTo(effectiveFrom, nextEffectiveFrom);

    const updatePrev = postScope(4);
    await client.query(
      `
        UPDATE object_shift_templates
        SET effective_to = $3::date
        WHERE object_id = $1
          AND effective_from < $2::date
          AND (effective_to IS NULL OR effective_to >= $2::date)
          ${updatePrev.sql}
      `,
      [objectId, effectiveFrom, previousEffectiveTo, ...updatePrev.params],
    );
    const deleteCurrent = postScope(3);
    await client.query(
      `DELETE FROM object_shift_templates WHERE object_id = $1 AND effective_from = $2::date${deleteCurrent.sql}`,
      [objectId, effectiveFrom, ...deleteCurrent.params],
    );
    for (const row of perDay) {
      if (extra.insertReinforcementHoursColumn) {
        const shiftLeadSql = extra.insertShiftLeadColumns
          ? `shifts_shift_lead_per_day, shift_lead_shift_hours,`
          : "";
        const shiftLeadValues = extra.insertShiftLeadColumns ? `, $9, $10` : "";
        const postIdSql = hasPostId ? `, post_id` : "";
        const baseParamCount = extra.insertShiftLeadColumns ? 10 : 8;
        const effectiveFromIndex = baseParamCount + 1;
        const effectiveToIndex = baseParamCount + 2;
        const postIdValue = hasPostId ? `, $${baseParamCount + 3}::uuid` : "";
        const insertParams = extra.insertShiftLeadColumns
          ? [
              objectId,
              row.dayOfWeek,
              row.shiftsPerDay,
              row.shiftsReinforcementPerDay,
              row.shiftHours,
              row.reinforcementShiftHours,
              row.shiftsRapidResponsePerDay,
              row.rapidResponseShiftHours,
              row.shiftsShiftLeadPerDay,
              row.shiftLeadShiftHours,
              effectiveFrom,
              newEffectiveTo,
            ]
          : [
              objectId,
              row.dayOfWeek,
              row.shiftsPerDay,
              row.shiftsReinforcementPerDay,
              row.shiftHours,
              row.reinforcementShiftHours,
              row.shiftsRapidResponsePerDay,
              row.rapidResponseShiftHours,
              effectiveFrom,
              newEffectiveTo,
            ];
        if (hasPostId) insertParams.push(postId);
        await client.query(
          `
            INSERT INTO object_shift_templates (
              object_id,
              day_of_week,
              shifts_per_day,
              shifts_reinforcement_per_day,
              shift_hours,
              reinforcement_shift_hours,
              shifts_rapid_response_per_day,
              rapid_response_shift_hours,
              ${shiftLeadSql}
              effective_from,
              effective_to
              ${postIdSql}
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8${shiftLeadValues}, $${effectiveFromIndex}::date, $${effectiveToIndex}::date${postIdValue})
          `,
          insertParams,
        );
      } else {
        const postIdSql = hasPostId ? `, post_id` : "";
        const postIdValue = hasPostId ? `, $10::uuid` : "";
        const insertParams = [
          objectId,
          row.dayOfWeek,
          row.shiftsPerDay,
          row.shiftsReinforcementPerDay,
          row.shiftHours,
          row.shiftsRapidResponsePerDay,
          row.rapidResponseShiftHours,
          effectiveFrom,
          newEffectiveTo,
        ];
        if (hasPostId) insertParams.push(postId);
        await client.query(
          `
            INSERT INTO object_shift_templates (
              object_id,
              day_of_week,
              shifts_per_day,
              shifts_reinforcement_per_day,
              shift_hours,
              shifts_rapid_response_per_day,
              rapid_response_shift_hours,
              effective_from,
              effective_to
              ${postIdSql}
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9::date${postIdValue})
          `,
          insertParams,
        );
      }
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
