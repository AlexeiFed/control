import {
  getShiftIncidentReturningColumns,
  getShiftIncidentSelectColumns,
  getShiftSelectedRateRuleSelect,
  shiftsHaveIncidentAlertDismissedColumn,
  shiftsHaveIncidentColumns,
  shiftsHaveSelectedRateRuleColumn,
  tableColumnExists,
} from "../db/column-compat";
import { getDbPool, query } from "../db/pool";
import type { PoolClient } from "pg";
import { unstable_cache } from "next/cache";
import { findScheduleConflict, type ScheduleConflict } from "../scheduling/conflicts";
import {
  formatMinutesAsHours,
  localDatesSpannedByShift,
} from "../scheduling/guard-daily-load";
import { addDaysToIsoDate, formatDisplayDateLocal, parseIsoDateKhabarovskOrNull, toDateIsoKhabarovsk } from "../format/display-date";
import type { Guard, RateUnit, SecurityObject, Shift, ShiftKind, ShiftLog, IncidentCategory } from "../scheduling/types";
import type { GuardProfileResolver } from "../guards/profile-periods";
import { buildGuardProfileResolver } from "./guard-profile-periods-repository";
import { normalizeOperationalAnchorTime } from "../scheduling/operational-day-timeline";
import { mapGuardLicenseFromDb } from "../scheduling/guard-profile";
import { normalizeShiftKindFromDb } from "../scheduling/types";
import { guardStatusLabels } from "./status-labels";
import { splitMinutesByMonth, totalMinutesByMonth } from "../scheduling/month-split";
import { listObjectRateRulesForObjects, type ObjectRateRuleRecord } from "./object-rate-rules-repository";
import { getGuardsHasCarSelect, getGuardsPhoneSelect } from "./guards-repository";

type GuardRow = {
  id: string;
  first_name: string;
  last_name: string;
  status: Guard["status"];
  phone: string;
  position: Guard["position"];
  license_type: string | null;
  employment_type: Guard["employmentType"];
  is_trainee: boolean;
  trainee_until: string | null;
  has_car: boolean;
};

type ObjectRow = {
  id: string;
  name: string;
  address: string;
  status: SecurityObject["status"];
  operational_day_start_time: string;
};

type ShiftRow = {
  id: string;
  guard_id: string;
  object_id: string;
  post_id: string | null;
  starts_at: string;
  ends_at: string;
  shift_kind: ShiftKind | null;
  manual_client_rate_cents: number | null;
  manual_guard_rate_cents: number | null;
  manual_rate_unit: RateUnit | null;
  manual_rate_reason: string | null;
  is_no_show: boolean;
  selected_rate_rule_id: string | null;
  incident_category: string | null;
  incident_comment: string | null;
  incident_worked_until_at: string | null;
  incident_recorded_at: string | null;
  replaced_by_shift_id: string | null;
};

type ShiftLogRow = {
  id: string;
  shift_id: string;
  author_user_id: string;
  created_at: string;
  note: string;
  incident_level: ShiftLog["incidentLevel"];
  object_name?: string;
  guard_last_name?: string;
  guard_first_name?: string;
  shift_starts_at?: string;
  shift_ends_at?: string;
};

export type SchedulerSnapshot = {
  guards: Guard[];
  objects: SecurityObject[];
  shifts: Shift[];
  logs: ShiftLog[];
};

export type ObjectMonthScheduledGuard = {
  guardId: string;
  displayName: string;
};

function getMonthRangeKhabarovsk(year: number, monthIndex0: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const startIso = `${year}-${pad(monthIndex0 + 1)}-01T00:00:00+10:00`;
  
  // Конец месяца - это первое число следующего месяца
  let nextYear = year;
  let nextMonth = monthIndex0 + 1;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear++;
  }
  const endIso = `${nextYear}-${pad(nextMonth + 1)}-01T00:00:00+10:00`;
  
  return { start: startIso, end: endIso };
}

/** Охранники с хотя бы одной сменой на объекте в указанном локальном календарном месяце. */
export async function listScheduledGuardsByObjectForLocalMonth(
  objectIds: ReadonlyArray<string>,
  year: number,
  monthIndex0: number,
): Promise<Record<string, ObjectMonthScheduledGuard[]>> {
  const empty: Record<string, ObjectMonthScheduledGuard[]> = {};
  for (const id of objectIds) empty[id] = [];
  if (objectIds.length === 0) return empty;

  const { start, end } = getMonthRangeKhabarovsk(year, monthIndex0);

  const rows = await query<{
    object_id: string;
    guard_id: string;
    first_name: string;
    last_name: string;
  }>(
    `
      SELECT DISTINCT s.object_id, g.id AS guard_id, g.first_name, g.last_name
      FROM shifts s
      INNER JOIN guards g ON g.id = s.guard_id
      WHERE s.ends_at > $1 AND s.starts_at < $2
        AND s.object_id = ANY($3::uuid[])
      ORDER BY s.object_id, g.last_name, g.first_name, g.id
    `,
    [start, end, objectIds],
  );

  for (const row of rows) {
    const bucket = empty[row.object_id];
    if (!bucket) continue;
    const displayName = `${row.last_name} ${row.first_name}`.trim();
    bucket.push({ guardId: row.guard_id, displayName });
  }

  return empty;
}

export async function listShiftsForGuardsInLocalMonth(
  guardIds: string[],
  year: number,
  monthIndex0: number,
): Promise<Shift[]> {
  if (guardIds.length === 0) return [];
  const { start, end } = getMonthRangeKhabarovsk(year, monthIndex0);
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);

  const rows = await query<ShiftRow>(
    `
      SELECT
        id, guard_id, object_id, post_id, starts_at, ends_at, shift_kind,
        manual_client_rate_cents, manual_guard_rate_cents,
        manual_rate_unit, manual_rate_reason,
        is_no_show,
        ${rateRuleSel},
        ${incidentSel}
      FROM shifts
      WHERE guard_id = ANY($1::uuid[])
        AND ends_at > $2 AND starts_at < $3
      ORDER BY starts_at ASC
    `,
    [guardIds, start, end],
  );

  return rows.map(mapDbShiftRow);
}

export type TimesheetSnapshot = {
  guards: Guard[];
  objects: SecurityObject[];
  shifts: Shift[];
  incidentCounts: ReadonlyMap<string, number>;
  rateRulesByObjectId: Record<string, ObjectRateRuleRecord[]>;
  incidentLogLinesByShiftId: ReadonlyMap<string, ReadonlyArray<{ createdAt: string; note: string }>>;
  profileResolver: GuardProfileResolver;
};

export async function getSchedulerSnapshot(weekStart: Date): Promise<SchedulerSnapshot> {
  const raw = await getSchedulerSnapshotRawCached(weekStart.toISOString());
  return mapSchedulerSnapshotRaw(raw);
}

type SchedulerSnapshotRaw = {
  guardsRows: GuardRow[];
  objectsRows: ObjectRow[];
  shiftsRows: ShiftRow[];
  logsRows: ShiftLogRow[];
};

async function loadSchedulerSnapshotRaw(weekStartIso: string): Promise<SchedulerSnapshotRaw> {
  const weekStart = new Date(weekStartIso);
  /** Сетка 14 дней + «хвост» для превью смен охранника (−3…+7 от любой колонки). */
  const dayMs = 24 * 60 * 60_000;
  const shiftQueryStart = new Date(weekStart.getTime() - 3 * dayMs);
  const shiftQueryEndExclusive = new Date(weekStart.getTime() + 21 * dayMs);
  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);

  const [guardsRows, objectsRows, shiftsRows, logsRows] = await Promise.all([
    query<GuardRow>(
      `
        SELECT
          id,
          first_name,
          last_name,
          status,
          ${phoneSel},
          position,
          license_type,
          employment_type,
          is_trainee,
          trainee_until,
          ${hasCarSel}
        FROM guards
        ORDER BY last_name, first_name
      `,
    ),
    query<ObjectRow>(
      `
        SELECT id, name, address, status, operational_day_start_time::text AS operational_day_start_time
        FROM security_objects
        ORDER BY name
      `,
    ),
    query<ShiftRow>(
      `
        SELECT
          id,
          guard_id,
          object_id,
          post_id,
          starts_at,
          ends_at,
          shift_kind,
          manual_client_rate_cents,
          manual_guard_rate_cents,
          manual_rate_unit,
          manual_rate_reason,
          is_no_show,
          ${rateRuleSel},
          ${incidentSel}
        FROM shifts
        WHERE ends_at > $1 AND starts_at < $2
        ORDER BY starts_at ASC
      `,
      [shiftQueryStart.toISOString(), shiftQueryEndExclusive.toISOString()],
    ),
    query<ShiftLogRow>(
      `
        SELECT
          l.id,
          l.shift_id,
          l.author_user_id,
          l.created_at,
          l.note,
          l.incident_level,
          o.name AS object_name,
          g.last_name AS guard_last_name,
          g.first_name AS guard_first_name,
          s.starts_at AS shift_starts_at,
          s.ends_at AS shift_ends_at
        FROM shift_logs l
        INNER JOIN shifts s ON s.id = l.shift_id
        INNER JOIN security_objects o ON o.id = s.object_id
        INNER JOIN guards g ON g.id = s.guard_id
        ORDER BY l.created_at DESC
        LIMIT 300
      `,
    ),
  ]);

  return { guardsRows, objectsRows, shiftsRows, logsRows };
}

const getSchedulerSnapshotRawCached = unstable_cache(
  (weekStartIso: string) => loadSchedulerSnapshotRaw(weekStartIso),
  ["scheduler-snapshot:v1"],
  {
    tags: ["scheduler", "shifts", "directory"],
    revalidate: 60,
  },
);

function mapSchedulerSnapshotRaw(raw: SchedulerSnapshotRaw): SchedulerSnapshot {
  const guards = raw.guardsRows.map(mapDbGuardRow);
  const objects = raw.objectsRows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    status: row.status,
    operationalDayStartTime: normalizeOperationalAnchorTime(row.operational_day_start_time),
  }));
  const shifts = raw.shiftsRows.map(mapDbShiftRow);
  const logs = raw.logsRows.map((row) => ({
    id: row.id,
    shiftId: row.shift_id,
    authorUserId: row.author_user_id,
    createdAt: new Date(row.created_at),
    note: row.note,
    incidentLevel: row.incident_level,
    objectName: row.object_name,
    guardName: `${row.guard_last_name ?? ""} ${row.guard_first_name ?? ""}`.trim() || undefined,
    shiftStartsAt: row.shift_starts_at ? new Date(row.shift_starts_at) : undefined,
    shiftEndsAt: row.shift_ends_at ? new Date(row.shift_ends_at) : undefined,
  }));

  return { guards, objects, shifts, logs };
}

export async function listShiftsInLocalRange(rangeStart: Date, rangeEnd: Date): Promise<Shift[]> {
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);
  const rows = await query<ShiftRow>(
    `
      SELECT
        id, guard_id, object_id, post_id, starts_at, ends_at, shift_kind,
        manual_client_rate_cents, manual_guard_rate_cents,
        manual_rate_unit, manual_rate_reason,
        is_no_show,
        ${rateRuleSel},
        ${incidentSel}
      FROM shifts
      WHERE ends_at > $1 AND starts_at < $2
      ORDER BY starts_at ASC
    `,
    [rangeStart.toISOString(), rangeEnd.toISOString()],
  );
  return rows.map(mapDbShiftRow);
}

type TimesheetIncidentCountRaw = { shift_id: string; count: number };
type TimesheetLogLineRaw = { shift_id: string; note: string; created_at: string };

type TimesheetSnapshotRaw = {
  guards: GuardRow[];
  objects: ObjectRow[];
  shifts: ShiftRow[];
  incidents: TimesheetIncidentCountRaw[];
  logLines: TimesheetLogLineRaw[];
  rateRules: ObjectRateRuleRecord[];
};

async function loadTimesheetSnapshotRaw(
  rangeStartIso: string,
  rangeEndIso: string,
  guardId: string,
  objectId: string,
): Promise<TimesheetSnapshotRaw> {
  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);
  const gId = guardId || null;
  const oId = objectId || null;

  const [guardsRows, objectsRows, shiftsRows, incidentRows, logLinesRows] = await Promise.all([
    query<GuardRow>(
      `
        SELECT
          id,
          first_name,
          last_name,
          status,
          ${phoneSel},
          position,
          license_type,
          employment_type,
          is_trainee,
          trainee_until,
          ${hasCarSel}
        FROM guards
        ORDER BY last_name, first_name
      `,
    ),
    query<ObjectRow>(
      `
        SELECT id, name, address, status, operational_day_start_time::text AS operational_day_start_time
        FROM security_objects
        ORDER BY name
      `,
    ),
    query<ShiftRow>(
      `
        SELECT
          id,
          guard_id,
          object_id,
          post_id,
          starts_at,
          ends_at,
          shift_kind,
          manual_client_rate_cents,
          manual_guard_rate_cents,
          manual_rate_unit,
          manual_rate_reason,
          is_no_show,
          ${rateRuleSel},
          ${incidentSel}
        FROM shifts
        WHERE ends_at > $1 AND starts_at < $2
          AND ($3::uuid IS NULL OR guard_id = $3)
          AND ($4::uuid IS NULL OR object_id = $4)
        ORDER BY starts_at ASC
      `,
      [rangeStartIso, rangeEndIso, gId, oId],
    ),
    query<TimesheetIncidentCountRaw>(
      `
        SELECT l.shift_id, COUNT(*)::int AS count
        FROM shift_logs l
        JOIN shifts s ON s.id = l.shift_id
        WHERE s.ends_at > $1 AND s.starts_at < $2
          AND ($3::uuid IS NULL OR s.guard_id = $3)
          AND ($4::uuid IS NULL OR s.object_id = $4)
        GROUP BY l.shift_id
      `,
      [rangeStartIso, rangeEndIso, gId, oId],
    ),
    query<TimesheetLogLineRaw>(
      `
        SELECT l.shift_id, l.note, l.created_at::text AS created_at
        FROM shift_logs l
        INNER JOIN shifts s ON s.id = l.shift_id
        WHERE s.ends_at > $1 AND s.starts_at < $2
          AND ($3::uuid IS NULL OR s.guard_id = $3)
          AND ($4::uuid IS NULL OR s.object_id = $4)
        ORDER BY l.created_at DESC
        LIMIT 1500
      `,
      [rangeStartIso, rangeEndIso, gId, oId],
    ),
  ]);

  const objectIds = [...new Set(shiftsRows.map((s) => s.object_id))];
  const rateRules = objectIds.length > 0 ? await listObjectRateRulesForObjects(objectIds) : [];

  return {
    guards: guardsRows,
    objects: objectsRows,
    shifts: shiftsRows,
    incidents: incidentRows,
    logLines: logLinesRows,
    rateRules,
  };
}

const getTimesheetSnapshotRawCached = unstable_cache(
  (rangeStartIso: string, rangeEndIso: string, guardId: string, objectId: string) =>
    loadTimesheetSnapshotRaw(rangeStartIso, rangeEndIso, guardId, objectId),
  ["timesheet-snapshot:v1"],
  {
    tags: ["timesheet", "shifts", "rates", "directory"],
    revalidate: 300,
  },
);

export async function getTimesheetSnapshot(
  rangeStart: Date,
  rangeEnd: Date,
  filters?: { guardId?: string; objectId?: string },
): Promise<TimesheetSnapshot> {
  const rawSnapshot = await getTimesheetSnapshotRawCached(
    rangeStart.toISOString(),
    rangeEnd.toISOString(),
    filters?.guardId ?? "",
    filters?.objectId ?? "",
  );

  const { guards: guardsRows, objects: objectsRows, shifts: shiftsRows, incidents: incidentRows, logLines: logLinesRows, rateRules: rateRulesFlat } = rawSnapshot;

  const guards = guardsRows.map(mapDbGuardRow);
  const objects = objectsRows.map((row) => ({
    id: row.id,
    name: row.name,
    address: row.address,
    status: row.status,
    operationalDayStartTime: normalizeOperationalAnchorTime(row.operational_day_start_time),
  }));
  const shifts = shiftsRows.map(mapDbShiftRow);
  const incidentCounts = new Map<string, number>();
  for (const row of incidentRows) incidentCounts.set(row.shift_id, row.count);

  const incidentLogLinesByShiftId = new Map<string, Array<{ createdAt: string; note: string }>>();
  for (const row of logLinesRows) {
    const list = incidentLogLinesByShiftId.get(row.shift_id) ?? [];
    if (list.length >= 15) continue;
    list.push({ createdAt: row.created_at, note: row.note });
    incidentLogLinesByShiftId.set(row.shift_id, list);
  }

  const rateRulesByObjectId: Record<string, ObjectRateRuleRecord[]> = {};
  for (const r of rateRulesFlat) {
    if (!rateRulesByObjectId[r.objectId]) rateRulesByObjectId[r.objectId] = [];
    rateRulesByObjectId[r.objectId]!.push(r);
  }

  const profileResolver = await buildGuardProfileResolver(guards.map((g) => g.id));

  return { guards, objects, shifts, incidentCounts, rateRulesByObjectId, incidentLogLinesByShiftId, profileResolver };
}

/** Удаление строки смены. Логи смены удаляются каскадно. */
export async function deleteShiftById(shiftId: string): Promise<{ objectId: string }> {
  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hasReplacedBy = await tableColumnExists("shifts", "replaced_by_shift_id");
    const existing = await client.query<{ object_id: string; replaced_by_shift_id: string | null }>(
      `
        SELECT object_id, ${hasReplacedBy ? "replaced_by_shift_id" : "NULL::uuid AS replaced_by_shift_id"}
        FROM shifts
        WHERE id = $1::uuid
        FOR UPDATE
      `,
      [shiftId],
    );
    const target = existing.rows[0];
    if (!target) throw new Error("Смена не найдена");

    if (hasReplacedBy) {
      await client.query(`UPDATE shifts SET replaced_by_shift_id = NULL WHERE replaced_by_shift_id = $1::uuid`, [
        shiftId,
      ]);
      if (target.replaced_by_shift_id) {
        const replacementId = target.replaced_by_shift_id;
        await client.query(`UPDATE shifts SET replaced_by_shift_id = NULL WHERE replaced_by_shift_id = $1::uuid`, [
          replacementId,
        ]);
        await client.query(`DELETE FROM shifts WHERE id = $1::uuid`, [replacementId]);
      }
    }

    const deleted = await client.query<{ object_id: string }>(
      `DELETE FROM shifts WHERE id = $1::uuid RETURNING object_id`,
      [shiftId],
    );
    const row = deleted.rows[0];
    if (!row) throw new Error("Смена не найдена");
    await client.query("COMMIT");
    return { objectId: row.object_id };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // транзакция могла не начаться
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function updateShiftAssignment(input: {
  shiftId: string;
  guardId: string;
  objectId: string;
  postId?: string | null;
  startsAt: Date;
  endsAt: Date;
  assignmentDateIso?: string;
  shiftKind: ShiftKind;
  manualClientRateCents?: number | null;
  manualGuardRateCents?: number | null;
  manualRateUnit?: RateUnit | null;
  manualRateReason?: string;
  selectedRateRuleId?: string | null;
}): Promise<{ objectId: string }> {
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);
  const existingRows = await query<ShiftRow>(
    `
      SELECT
        id, guard_id, object_id, post_id, starts_at, ends_at, shift_kind,
        manual_client_rate_cents, manual_guard_rate_cents,
        manual_rate_unit, manual_rate_reason,
        is_no_show,
        ${rateRuleSel},
        ${incidentSel}
      FROM shifts
      WHERE id = $1
    `,
    [input.shiftId],
  );
  const existingRow = existingRows[0];
  if (!existingRow) throw new Error("Смена не найдена");
  if (existingRow.object_id !== input.objectId) throw new Error("Смена принадлежит другому объекту");

  const existing = mapDbShiftRow(existingRow);
  if (existing.isNoShow) throw new Error("Нельзя редактировать смену с невыходом");
  if (existing.incidentRecordedAt) throw new Error("Нельзя редактировать смену с зафиксированным инцидентом");
  if (existing.replacedByShiftId) throw new Error("Смена уже заменена");

  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const guards = await query<GuardRow>(
    `
      SELECT
        id,
        first_name,
        last_name,
        status,
        ${phoneSel},
        position,
        license_type,
        employment_type,
        is_trainee,
        trainee_until,
        ${hasCarSel}
      FROM guards
      WHERE id = $1
    `,
    [input.guardId],
  );
  const guardRow = guards[0];
  if (!guardRow) throw new Error("Охранник не найден");

  const dayRangeShifts = await listGuardShiftsForDayRangeCheck(
    input.guardId,
    input.startsAt,
    input.endsAt,
    input.shiftId,
  );

  const conflict = findScheduleConflict(
    mapDbGuardRow(guardRow),
    {
      guardId: input.guardId,
      objectId: input.objectId,
      postId: input.postId ?? null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      shiftKind: input.shiftKind,
      manualClientRateCents: input.manualClientRateCents ?? null,
      manualGuardRateCents: input.manualGuardRateCents ?? null,
      manualRateUnit: input.manualRateUnit ?? null,
      manualRateReason: input.manualRateReason ?? "",
      isNoShow: false,
      incidentCategory: null,
      incidentComment: "",
      incidentWorkedUntilAt: null,
      incidentRecordedAt: null,
      replacedByShiftId: null,
      selectedRateRuleId: input.selectedRateRuleId ?? null,
    },
    dayRangeShifts,
    input.shiftId,
    {
      assignmentDateIso:
        input.assignmentDateIso ?? toDateIsoKhabarovsk(input.startsAt),
    },
  );

  if (conflict) {
    const guardName = `${guardRow.first_name} ${guardRow.last_name}`.trim();
    throw new Error(await formatScheduleConflictError(conflict, guardName, dayRangeShifts, input.objectId));
  }

  const monthMinutes = splitMinutesByMonth(input.startsAt, input.endsAt);
  const totalMinutes = totalMinutesByMonth(monthMinutes);
  const hasRateRuleCol = await shiftsHaveSelectedRateRuleColumn();

  const updated = await query<{ id: string }>(
    `
      UPDATE shifts
      SET
        guard_id = $2,
        starts_at = $3,
        ends_at = $4,
        total_minutes = $5,
        month_minutes = $6::jsonb,
        shift_kind = $7,
        manual_client_rate_cents = $8,
        manual_guard_rate_cents = $9,
        manual_rate_unit = $10,
        manual_rate_reason = $11${hasRateRuleCol ? ",\n        selected_rate_rule_id = $12" : ""},
        post_id = ${hasRateRuleCol ? "$13" : "$12"}
      WHERE id = $1
      RETURNING id
    `,
    hasRateRuleCol
      ? [
          input.shiftId,
          input.guardId,
          input.startsAt.toISOString(),
          input.endsAt.toISOString(),
          totalMinutes,
          JSON.stringify(monthMinutes),
          input.shiftKind,
          input.manualClientRateCents ?? null,
          input.manualGuardRateCents ?? null,
          input.manualRateUnit ?? null,
          (input.manualRateReason ?? "").trim(),
          input.selectedRateRuleId ?? null,
          input.postId ?? null,
        ]
      : [
          input.shiftId,
          input.guardId,
          input.startsAt.toISOString(),
          input.endsAt.toISOString(),
          totalMinutes,
          JSON.stringify(monthMinutes),
          input.shiftKind,
          input.manualClientRateCents ?? null,
          input.manualGuardRateCents ?? null,
          input.manualRateUnit ?? null,
          (input.manualRateReason ?? "").trim(),
          input.postId ?? null,
        ],
  );
  if (!updated[0]) throw new Error("Не удалось обновить смену");

  const { syncShiftDerivedEntries } = await import("../scheduling/sync-shift-derived");
  await syncShiftDerivedEntries(input.shiftId, "schedule-sync");

  return { objectId: input.objectId };
}

export async function listShiftsForObjectInLocalMonth(
  objectId: string,
  year: number,
  monthIndex0: number,
): Promise<Shift[]> {
  const { start, end } = getMonthRangeKhabarovsk(year, monthIndex0);
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);

  const rows = await query<ShiftRow>(
    `
      SELECT
        id, guard_id, object_id, post_id, starts_at, ends_at, shift_kind,
        manual_client_rate_cents, manual_guard_rate_cents,
        manual_rate_unit, manual_rate_reason,
        is_no_show,
        ${rateRuleSel},
        ${incidentSel}
      FROM shifts
      WHERE object_id = $1
        AND ends_at > $2 AND starts_at < $3
      ORDER BY starts_at ASC
    `,
    [objectId, start, end],
  );

  return rows.map(mapDbShiftRow);
}

export type CreateShiftAssignmentResult = {
  shiftId: string;
  /** Для «не выход»: добавить запись в журнал только при первой отметке */
  appendNoShowLog?: boolean;
};

export async function createShiftAssignment(input: {
  guardId: string;
  objectId: string;
  postId?: string | null;
  startsAt: Date;
  endsAt: Date;
  assignmentDateIso?: string;
  replaceShiftId?: string;
  shiftKind: ShiftKind;
  manualClientRateCents: number | null;
  manualGuardRateCents: number | null;
  manualRateUnit: RateUnit | null;
  manualRateReason: string;
  selectedRateRuleId?: string | null;
  isNoShow?: boolean;
}): Promise<CreateShiftAssignmentResult> {
  const phoneSel = await getGuardsPhoneSelect("direct");
  const hasCarSel = await getGuardsHasCarSelect("direct");
  const guards = await query<GuardRow>(
    `
      SELECT
        id,
        first_name,
        last_name,
        status,
        ${phoneSel},
        position,
        license_type,
        employment_type,
        is_trainee,
        trainee_until,
        ${hasCarSel}
      FROM guards
      WHERE id = $1
    `,
    [input.guardId],
  );
  const guardRow = guards[0];
  if (!guardRow) throw new Error("Охранник не найден");

  /** Отметка «не выход» по существующей смене: строка сохраняется (для замены и табеля). */
  if (input.isNoShow && input.replaceShiftId) {
    const updated = await query<{ id: string }>(
      `
        UPDATE shifts
        SET is_no_show = true
        WHERE id = $1 AND guard_id = $2 AND is_no_show = false
        RETURNING id
      `,
      [input.replaceShiftId, input.guardId],
    );
    if (updated[0]) {
      const { syncShiftDerivedEntries } = await import("../scheduling/sync-shift-derived");
      await syncShiftDerivedEntries(updated[0].id, "schedule-sync");
      return { shiftId: updated[0].id, appendNoShowLog: true };
    }
    const current = await query<{ id: string; is_no_show: boolean }>(
      `SELECT id, is_no_show FROM shifts WHERE id = $1 AND guard_id = $2`,
      [input.replaceShiftId, input.guardId],
    );
    const row = current[0];
    if (!row) throw new Error("Смена не найдена или охранник не совпадает");
    if (row.is_no_show) {
      const { syncShiftDerivedEntries } = await import("../scheduling/sync-shift-derived");
      await syncShiftDerivedEntries(row.id, "schedule-sync");
      return { shiftId: row.id, appendNoShowLog: false };
    }
    throw new Error("Не удалось отметить невыход");
  }

  let skipDeleteReplacedShift = false;
  if (input.replaceShiftId) {
    const replaced = await query<{ is_no_show: boolean }>(
      `SELECT is_no_show FROM shifts WHERE id = $1`,
      [input.replaceShiftId],
    );
    if (!replaced[0]) throw new Error("Смена для замены не найдена");
    if (replaced[0].is_no_show) skipDeleteReplacedShift = true;
  }

  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);
  const incidentReturning = await getShiftIncidentReturningColumns();
  const hasRateRuleCol = await shiftsHaveSelectedRateRuleColumn();

  // При невыходе (isNoShow) мы не проверяем конфликты, так как охранник физически не на месте
  if (!input.isNoShow) {
    const dayRangeShifts = await listGuardShiftsForDayRangeCheck(
      input.guardId,
      input.startsAt,
      input.endsAt,
      input.replaceShiftId ?? null,
    );

    const conflict = findScheduleConflict(
      mapDbGuardRow(guardRow),
      {
        guardId: input.guardId,
        objectId: input.objectId,
        postId: input.postId ?? null,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        shiftKind: input.shiftKind,
        manualClientRateCents: input.manualClientRateCents,
        manualGuardRateCents: input.manualGuardRateCents,
        manualRateUnit: input.manualRateUnit,
        manualRateReason: input.manualRateReason,
        isNoShow: input.isNoShow ?? false,
        incidentCategory: null,
        incidentComment: "",
        incidentWorkedUntilAt: null,
        incidentRecordedAt: null,
        replacedByShiftId: null,
        selectedRateRuleId: input.selectedRateRuleId ?? null,
      },
      dayRangeShifts,
      input.replaceShiftId,
      {
        assignmentDateIso:
          input.assignmentDateIso ?? toDateIsoKhabarovsk(input.startsAt),
      },
    );

    if (conflict) {
      const guardName = `${guardRow.first_name} ${guardRow.last_name}`.trim();
      throw new Error(await formatScheduleConflictError(conflict, guardName, dayRangeShifts, input.objectId));
    }
  }

  const monthMinutes = splitMinutesByMonth(input.startsAt, input.endsAt);
  const totalMinutes = totalMinutesByMonth(monthMinutes);

  const pool = getDbPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (input.replaceShiftId && !skipDeleteReplacedShift) {
      await client.query(`DELETE FROM shifts WHERE id = $1`, [input.replaceShiftId]);
    }

    const insertedRows = await client.query<ShiftRow>(
      `
        INSERT INTO shifts (
          guard_id,
          object_id,
          starts_at,
          ends_at,
          total_minutes,
          month_minutes,
          shift_kind,
          manual_client_rate_cents,
          manual_guard_rate_cents,
          manual_rate_unit,
          manual_rate_reason,
          is_no_show${hasRateRuleCol ? ",\n          selected_rate_rule_id" : ""},
          post_id
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12${hasRateRuleCol ? ", $13" : ""}, ${hasRateRuleCol ? "$14" : "$13"})
        RETURNING
          id,
          guard_id,
          object_id,
          post_id,
          starts_at,
          ends_at,
          shift_kind,
          manual_client_rate_cents,
          manual_guard_rate_cents,
          manual_rate_unit,
          manual_rate_reason,
          is_no_show,
          ${rateRuleSel},
          ${incidentSel}
          ${incidentReturning}
      `,
      [
        input.guardId,
        input.objectId,
        input.startsAt.toISOString(),
        input.endsAt.toISOString(),
        totalMinutes,
        JSON.stringify(monthMinutes),
        input.shiftKind,
        input.manualClientRateCents,
        input.manualGuardRateCents,
        input.manualRateUnit,
        input.manualRateReason.trim() || "",
        input.isNoShow ?? false,
        ...(hasRateRuleCol ? [input.selectedRateRuleId ?? null] : []),
        input.postId ?? null,
      ],
    );

    const row = insertedRows.rows[0];
    if (!row) throw new Error("Не удалось создать смену");

    // Замена no-show/инцидентной смены: помечаем оригинал как «закрыт» новой сменой,
    // чтобы баннер «Требуется замена по инциденту» исчез.
    if (input.replaceShiftId && skipDeleteReplacedShift && !input.isNoShow) {
      await client.query(
        `UPDATE shifts SET replaced_by_shift_id = $1 WHERE id = $2 AND replaced_by_shift_id IS NULL`,
        [row.id, input.replaceShiftId],
      );
    }

    await client.query("COMMIT");
    const { syncShiftDerivedEntries } = await import("../scheduling/sync-shift-derived");
    await syncShiftDerivedEntries(row.id, "schedule-sync");
    return { shiftId: row.id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapDbGuardRow(row: GuardRow): Guard {
  return {
    id: row.id,
    name: `${row.last_name} ${row.first_name}`.trim(),
    status: row.status,
    phone: row.phone ?? "",
    position: row.position ?? "Guard",
    licenseType: mapGuardLicenseFromDb(row.license_type),
    employmentType: row.employment_type ?? "Unemployed",
    isTrainee: row.is_trainee ?? false,
    traineeUntil: parseIsoDateKhabarovskOrNull(row.trainee_until),
    hasCar: row.has_car ?? false,
  };
}

function mapDbShiftRow(row: ShiftRow): Shift {
  return {
    id: row.id,
    guardId: row.guard_id,
    objectId: row.object_id,
    postId: row.post_id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    shiftKind: normalizeShiftKindFromDb(row.shift_kind),
    manualClientRateCents: row.manual_client_rate_cents ?? null,
    manualGuardRateCents: row.manual_guard_rate_cents ?? null,
    manualRateUnit: row.manual_rate_unit ?? null,
    manualRateReason: row.manual_rate_reason ?? "",
    isNoShow: row.is_no_show ?? false,
    incidentCategory: (row.incident_category as IncidentCategory | null) ?? null,
    incidentComment: row.incident_comment?.trim() ?? "",
    incidentWorkedUntilAt: row.incident_worked_until_at ? new Date(row.incident_worked_until_at) : null,
    incidentRecordedAt: row.incident_recorded_at ? new Date(row.incident_recorded_at) : null,
    replacedByShiftId: row.replaced_by_shift_id ?? null,
    selectedRateRuleId: row.selected_rate_rule_id ?? null,
  };
}

/**
 * Результат массового клонирования смен недели.
 * `created` — сколько смен фактически создано, `skipped` — сколько пропущено и почему.
 */
export type CloneWeekShiftsResult = {
  created: number;
  skipped: Array<{ sourceShiftId: string; reason: string }>;
};

/**
 * Клонирует смены объекта из исходной недели в целевую (сдвиг на 7×N дней).
 * Пропускает «невыходы», уже заменённые смены и пары (день, охранник, время), которые
 * уже существуют в целевой неделе или конфликтуют с другими сменами охранника.
 *
 * Использует `createShiftAssignment` per-shift, чтобы переиспользовать валидацию конфликтов и RBAC-схему.
 */
export async function cloneObjectWeekShifts(input: {
  objectId: string;
  sourceMondayKhabarovskIso: string; // YYYY-MM-DD
  targetMondayKhabarovskIso: string; // YYYY-MM-DD
}): Promise<CloneWeekShiftsResult> {
  const sourceStart = new Date(`${input.sourceMondayKhabarovskIso}T00:00:00+10:00`);
  const sourceEnd = new Date(sourceStart.getTime() + 7 * 24 * 3_600_000);
  const targetStart = new Date(`${input.targetMondayKhabarovskIso}T00:00:00+10:00`);
  const targetEnd = new Date(targetStart.getTime() + 7 * 24 * 3_600_000);
  const deltaMs = targetStart.getTime() - sourceStart.getTime();

  if (Number.isNaN(sourceStart.getTime()) || Number.isNaN(targetStart.getTime())) {
    throw new Error("Некорректные даты для копирования недели");
  }
  if (deltaMs === 0) {
    throw new Error("Исходная и целевая неделя совпадают");
  }

  // Загружаем смены исходной недели объекта (без невыходов и без замен).
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);
  const sourceRows = await query<ShiftRow>(
    `
      SELECT
        id, guard_id, object_id, post_id, starts_at, ends_at, shift_kind,
        manual_client_rate_cents, manual_guard_rate_cents, manual_rate_unit, manual_rate_reason,
        is_no_show,
        ${rateRuleSel},
        ${incidentSel}
      FROM shifts
      WHERE object_id = $1::uuid
        AND starts_at >= $2
        AND starts_at < $3
        AND is_no_show = false
        AND replaced_by_shift_id IS NULL
      ORDER BY starts_at ASC
    `,
    [input.objectId, sourceStart.toISOString(), sourceEnd.toISOString()],
  );

  // Загружаем уже существующие смены целевой недели (для дедупликации по (guardId, startsAt, endsAt)).
  const existingRows = await query<{ guard_id: string; starts_at: string; ends_at: string }>(
    `
      SELECT guard_id, starts_at, ends_at
      FROM shifts
      WHERE object_id = $1::uuid
        AND starts_at >= $2
        AND starts_at < $3
        AND is_no_show = false
    `,
    [input.objectId, targetStart.toISOString(), targetEnd.toISOString()],
  );
  const existingKeys = new Set(
    existingRows.map((row) => `${row.guard_id}|${row.starts_at}|${row.ends_at}`),
  );

  const result: CloneWeekShiftsResult = { created: 0, skipped: [] };

  for (const row of sourceRows) {
    const newStartsAt = new Date(new Date(row.starts_at).getTime() + deltaMs);
    const newEndsAt = new Date(new Date(row.ends_at).getTime() + deltaMs);
    const dedupKey = `${row.guard_id}|${newStartsAt.toISOString()}|${newEndsAt.toISOString()}`;
    if (existingKeys.has(dedupKey)) {
      result.skipped.push({ sourceShiftId: row.id, reason: "уже есть в целевой неделе" });
      continue;
    }
    try {
      await createShiftAssignment({
        guardId: row.guard_id,
        objectId: row.object_id,
        postId: row.post_id,
        startsAt: newStartsAt,
        endsAt: newEndsAt,
        shiftKind: normalizeShiftKindFromDb(row.shift_kind),
        manualClientRateCents: row.manual_client_rate_cents ?? null,
        manualGuardRateCents: row.manual_guard_rate_cents ?? null,
        manualRateUnit: row.manual_rate_unit ?? null,
        manualRateReason: row.manual_rate_reason ?? "",
        isNoShow: false,
        selectedRateRuleId: row.selected_rate_rule_id ?? null,
      });
      existingKeys.add(dedupKey);
      result.created += 1;
    } catch (error) {
      result.skipped.push({
        sourceShiftId: row.id,
        reason: error instanceof Error ? error.message : "не удалось создать",
      });
    }
  }

  return result;
}

/**
 * Спецификация одной смены для массового создания через `bulkCreateShifts`.
 * Формат полностью совпадает с входом `createShiftAssignment`, кроме `replaceShiftId` и `isNoShow` —
 * массовое создание не предусматривает замен и невыходов.
 */
export type BulkShiftSpec = {
  guardId: string;
  objectId: string;
  postId?: string | null;
  startsAt: Date;
  endsAt: Date;
  shiftKind: ShiftKind;
};

export type BulkCreateShiftsResult = {
  created: number;
  skipped: Array<{ objectId: string; dateIso: string; reason: string }>;
};

/**
 * Создаёт все указанные смены последовательно через `createShiftAssignment`.
 * Сбои не прерывают процесс — каждая ошибка попадает в `skipped` с причиной.
 * Используется drag-to-fill и мульти-выбором ячеек.
 */
export async function bulkCreateShifts(items: ReadonlyArray<BulkShiftSpec>): Promise<BulkCreateShiftsResult> {
  const result: BulkCreateShiftsResult = { created: 0, skipped: [] };
  for (const item of items) {
    const dateIso = toDateIsoKhabarovsk(item.startsAt);
    try {
      await createShiftAssignment({
        guardId: item.guardId,
        objectId: item.objectId,
        postId: item.postId ?? null,
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        assignmentDateIso: dateIso,
        shiftKind: item.shiftKind,
        manualClientRateCents: null,
        manualGuardRateCents: null,
        manualRateUnit: null,
        manualRateReason: "",
        isNoShow: false,
      });
      result.created += 1;
    } catch (error) {
      result.skipped.push({
        objectId: item.objectId,
        dateIso,
        reason: error instanceof Error ? error.message : "не удалось создать",
      });
    }
  }
  return result;
}

async function getObjectNameById(objectId: string): Promise<string> {
  const rows = await query<{ name: string }>(
    `
      SELECT name
      FROM security_objects
      WHERE id = $1
    `,
    [objectId],
  );
  return rows[0]?.name ?? "объект";
}

async function listGuardShiftsForDayRangeCheck(
  guardId: string,
  startsAt: Date,
  endsAt: Date,
  excludeShiftId?: string | null,
  client?: PoolClient,
): Promise<Shift[]> {
  const dates = localDatesSpannedByShift(startsAt, endsAt).sort();
  if (dates.length === 0) return [];

  const rangeStart = new Date(`${dates[0]!}T00:00:00+10:00`);
  const rangeEnd = new Date(`${addDaysToIsoDate(dates[dates.length - 1]!, 1)}T00:00:00+10:00`);
  const [incidentSel, rateRuleSel] = await Promise.all([
    getShiftIncidentSelectColumns(),
    getShiftSelectedRateRuleSelect(),
  ]);
  const sql = `
    SELECT
      id,
      guard_id,
      object_id,
      post_id,
      starts_at,
      ends_at,
      shift_kind,
      manual_client_rate_cents,
      manual_guard_rate_cents,
      manual_rate_unit,
      manual_rate_reason,
      is_no_show,
      ${rateRuleSel},
      ${incidentSel}
    FROM shifts
    WHERE guard_id = $1
      AND starts_at < $3
      AND ends_at > $2
      AND is_no_show = false
      AND ($4::uuid IS NULL OR id <> $4::uuid)
  `;
  const params = [guardId, rangeStart.toISOString(), rangeEnd.toISOString(), excludeShiftId ?? null];
  const rows = client
    ? (await client.query<ShiftRow>(sql, params)).rows
    : await query<ShiftRow>(sql, params);
  return rows.map(mapDbShiftRow);
}

async function formatScheduleConflictError(
  conflict: ScheduleConflict,
  guardName: string,
  contextShifts: Shift[],
  fallbackObjectId: string,
): Promise<string> {
  if (conflict.type === "guard-status") {
    return `Нельзя назначить ${guardName}: статус “${guardStatusLabels[conflict.status]}”`;
  }
  if (conflict.type === "shift-overlap") {
    const overlap = contextShifts.find((shift) => shift.id === conflict.shiftId);
    const overlapText = overlap ? formatShiftInterval(overlap.startsAt, overlap.endsAt) : "пересечение по времени";
    const objectName = await getObjectNameById(overlap?.objectId ?? fallbackObjectId);
    return `Нельзя назначить ${guardName}: пересечение со сменой на объекте “${objectName}” (${overlapText})`;
  }
  const remainingMinutes = Math.max(0, conflict.limitMinutes - conflict.existingMinutes);
  return `Нельзя назначить ${guardName}: превышен суточный лимит ${formatMinutesAsHours(conflict.limitMinutes)} ч за ${conflict.dateIso} (уже ${formatMinutesAsHours(conflict.existingMinutes)} ч, назначение +${formatMinutesAsHours(conflict.candidateMinutes)} ч). Доступно ещё ${formatMinutesAsHours(remainingMinutes)} ч.`;
}

function formatShiftInterval(startsAt: Date, endsAt: Date): string {
  const startDate = formatDisplayDateLocal(startsAt);
  const endDate = formatDisplayDateLocal(endsAt);
  const startTime = startsAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const endTime = endsAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const datePart = startDate === endDate ? startDate : `${startDate}–${endDate}`;
  return `${datePart}, ${startTime}–${endTime}`;
}

export type PendingIncidentReplacement = {
  shiftId: string;
  objectName: string;
  shiftDateKey: string;
  guardName: string;
  category: IncidentCategory;
  comment: string;
};

  export async function listPendingIncidentReplacements(): Promise<PendingIncidentReplacement[]> {
    if (!(await shiftsHaveIncidentColumns())) return [];

    const hasDismissCol = await shiftsHaveIncidentAlertDismissedColumn();
    const dismissFilter = hasDismissCol ? "AND s.incident_alert_dismissed_at IS NULL" : "";

    const rows = await query<{
      id: string;
      object_id: string;
      starts_at: string;
      ends_at: string;
      incident_worked_until_at: string | null;
      object_name: string;
      last_name: string;
      first_name: string;
      incident_category: string | null;
      incident_comment: string | null;
    }>(
      `
        SELECT
          s.id,
          s.object_id,
          s.starts_at,
          s.ends_at,
          s.incident_worked_until_at,
          o.name AS object_name,
          g.last_name,
          g.first_name,
          s.incident_category,
          s.incident_comment
        FROM shifts s
        INNER JOIN security_objects o ON o.id = s.object_id
        INNER JOIN guards g ON g.id = s.guard_id
        WHERE s.incident_recorded_at IS NOT NULL
          AND s.replaced_by_shift_id IS NULL
          ${dismissFilter}
        ORDER BY s.incident_recorded_at DESC
        LIMIT 30
      `,
    );
  
    const out: PendingIncidentReplacement[] = [];
  
    for (const row of rows) {
      const startsAt = new Date(row.starts_at);
      
      out.push({
        shiftId: row.id,
        objectName: row.object_name,
        shiftDateKey: toDateIsoKhabarovsk(startsAt),
        guardName: `${row.last_name} ${row.first_name}`.trim(),
        category: (row.incident_category as IncidentCategory | null) ?? "Other",
        comment: row.incident_comment?.trim() ?? "",
      });
    }
  
    return out;
  }

export async function dismissIncidentReplacementAlert(shiftId: string): Promise<void> {
  if (!(await shiftsHaveIncidentColumns())) {
    throw new Error("На сервере не применена миграция инцидентов смен");
  }
  if (!(await shiftsHaveIncidentAlertDismissedColumn())) {
    throw new Error("На сервере не применена миграция скрытия инцидентов из баннера");
  }

  const rows = await query<{ id: string }>(
    `
      UPDATE shifts
      SET incident_alert_dismissed_at = now()
      WHERE id = $1
        AND incident_recorded_at IS NOT NULL
        AND replaced_by_shift_id IS NULL
        AND incident_alert_dismissed_at IS NULL
      RETURNING id
    `,
    [shiftId],
  );

  if (!rows[0]?.id) {
    throw new Error("Инцидент не найден или уже скрыт");
  }
}

async function insertReplacementShiftRow(
  client: PoolClient,
  input: {
    guardId: string;
    objectId: string;
    postId: string | null;
    startsAt: Date;
    endsAt: Date;
    shiftKind: ShiftKind;
  },
): Promise<string> {
  const monthMinutes = splitMinutesByMonth(input.startsAt, input.endsAt);
  const totalMinutes = totalMinutesByMonth(monthMinutes);
  const incidentReturning = await getShiftIncidentReturningColumns();
  const inserted = await client.query<ShiftRow>(
    `
      INSERT INTO shifts (
        guard_id,
        object_id,
        post_id,
        starts_at,
        ends_at,
        total_minutes,
        month_minutes,
        shift_kind,
        manual_client_rate_cents,
        manual_guard_rate_cents,
        manual_rate_unit,
        manual_rate_reason,
        is_no_show
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, NULL, NULL, NULL, '', false)
      RETURNING
        id,
        guard_id,
        object_id,
        post_id,
        starts_at,
        ends_at,
        shift_kind,
        manual_client_rate_cents,
        manual_guard_rate_cents,
        manual_rate_unit,
        manual_rate_reason,
        is_no_show
        ${incidentReturning}
    `,
    [
      input.guardId,
      input.objectId,
      input.postId,
      input.startsAt.toISOString(),
      input.endsAt.toISOString(),
      totalMinutes,
      JSON.stringify(monthMinutes),
      input.shiftKind,
    ],
  );
  const row = inserted.rows[0];
  if (!row?.id) throw new Error("Не удалось создать смену замены");
  return row.id;
}

export async function recordShiftIncident(input: {
  shiftId: string;
  authorUserId: string;
  category: IncidentCategory;
  comment: string;
  workedUntilAt: Date | null;
  replacementGuardId: string | null;
  logNote: string;
}): Promise<void> {
  if (!(await shiftsHaveIncidentColumns())) {
    throw new Error(
      "На сервере не применена миграция инцидентов смен (20260512). Выполните npm run db:migrate на сервере.",
    );
  }

  const pool = getDbPool();
  const client = await pool.connect();
  let replacementShiftId: string | null = null;
  try {
    await client.query("BEGIN");
    const [incidentSel, rateRuleSel] = await Promise.all([
      getShiftIncidentSelectColumns(),
      getShiftSelectedRateRuleSelect(),
    ]);
    const lock = await client.query<ShiftRow>(
      `
        SELECT
          id,
          guard_id,
          object_id,
          post_id,
          starts_at,
          ends_at,
          shift_kind,
          manual_client_rate_cents,
          manual_guard_rate_cents,
          manual_rate_unit,
          manual_rate_reason,
          is_no_show,
          ${rateRuleSel},
          ${incidentSel}
        FROM shifts
        WHERE id = $1
        FOR UPDATE
      `,
      [input.shiftId],
    );
    const s = lock.rows[0];
    if (!s) throw new Error("Смена не найдена");
    if (s.incident_recorded_at) throw new Error("Инцидент по этой смене уже зафиксирован");

    const startsAt = new Date(s.starts_at);
    const endsAt = new Date(s.ends_at);
    let workedUntilIso: string | null = null;
    if (input.workedUntilAt) {
      const w = input.workedUntilAt;
      if (w.getTime() <= startsAt.getTime() || w.getTime() > endsAt.getTime()) {
        throw new Error("Время «отработал до» должно быть внутри интервала смены");
      }
      workedUntilIso = w.toISOString();
    }

    if (input.category === "FullNoShow" && workedUntilIso) {
      throw new Error("Для полного невыхода не указывают время отработки");
    }
    if (input.category === "LeftWork" && !workedUntilIso) {
      throw new Error("Для «Ушёл с работы» укажите время, до которого охранник отработал");
    }

    const replacementStartsAt = workedUntilIso ? new Date(workedUntilIso) : startsAt;

    if (input.replacementGuardId) {
      const phoneSel = await getGuardsPhoneSelect("direct");
      const hasCarSel = await getGuardsHasCarSelect("direct");
      const rg = await client.query<GuardRow>(
        `
          SELECT id, first_name, last_name, status, ${phoneSel}, position, license_type, employment_type, is_trainee, trainee_until, ${hasCarSel}
          FROM guards WHERE id = $1
        `,
        [input.replacementGuardId],
      );
      const guardRow = rg.rows[0];
      if (!guardRow) throw new Error("Охранник для замены не найден");

      const dayRangeShifts = await listGuardShiftsForDayRangeCheck(
        input.replacementGuardId,
        replacementStartsAt,
        endsAt,
        input.shiftId,
        client,
      );
      const conflict = findScheduleConflict(
        mapDbGuardRow(guardRow),
        {
          guardId: input.replacementGuardId,
          objectId: s.object_id,
          postId: s.post_id,
          startsAt: replacementStartsAt,
          endsAt,
          shiftKind: normalizeShiftKindFromDb(s.shift_kind),
          manualClientRateCents: s.manual_client_rate_cents,
          manualGuardRateCents: s.manual_guard_rate_cents,
          manualRateUnit: s.manual_rate_unit,
          manualRateReason: s.manual_rate_reason ?? "",
          isNoShow: false,
          incidentCategory: null,
          incidentComment: "",
          incidentWorkedUntilAt: null,
          incidentRecordedAt: null,
          replacedByShiftId: null,
          selectedRateRuleId: s.selected_rate_rule_id ?? null,
        },
        dayRangeShifts,
        undefined,
        { assignmentDateIso: toDateIsoKhabarovsk(replacementStartsAt) },
      );
      if (conflict) {
        const guardName = `${guardRow.first_name} ${guardRow.last_name}`.trim();
        const prefix = `Нельзя назначить замену ${guardName}`;
        if (conflict.type === "guard-status") {
          throw new Error(`${prefix}: статус “${guardStatusLabels[conflict.status]}”`);
        }
        throw new Error(
          await formatScheduleConflictError(conflict, guardName, dayRangeShifts, s.object_id).then((msg) =>
            msg.replace(`Нельзя назначить ${guardName}`, prefix),
          ),
        );
      }

      replacementShiftId = await insertReplacementShiftRow(client, {
        guardId: input.replacementGuardId,
        objectId: s.object_id,
        postId: s.post_id,
        startsAt: replacementStartsAt,
        endsAt,
        shiftKind: normalizeShiftKindFromDb(s.shift_kind),
      });

      await client.query(
        `
          UPDATE shifts
          SET
            is_no_show = true,
            incident_category = $2,
            incident_comment = $3,
            incident_worked_until_at = $4,
            incident_recorded_at = now(),
            replaced_by_shift_id = $5
          WHERE id = $1
        `,
        [input.shiftId, input.category, input.comment, workedUntilIso, replacementShiftId],
      );
    } else {
      await client.query(
        `
          UPDATE shifts
          SET
            is_no_show = true,
            incident_category = $2,
            incident_comment = $3,
            incident_worked_until_at = $4,
            incident_recorded_at = now()
          WHERE id = $1
        `,
        [input.shiftId, input.category, input.comment, workedUntilIso],
      );
    }

    await client.query(
      `
        INSERT INTO shift_logs (shift_id, author_user_id, note, incident_level)
        VALUES ($1, $2, $3, 'Warning')
      `,
      [input.shiftId, input.authorUserId, input.logNote.trim()],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const { syncShiftDerivedEntries } = await import("../scheduling/sync-shift-derived");
  await syncShiftDerivedEntries(input.shiftId, input.authorUserId);
  if (replacementShiftId) {
    await syncShiftDerivedEntries(replacementShiftId, input.authorUserId);
  }
}

export async function createShiftLog(input: {
  shiftId: string;
  authorUserId: string;
  note: string;
  incidentLevel: ShiftLog["incidentLevel"];
}): Promise<ShiftLog> {
  const rows = await query<ShiftLogRow>(
    `
      INSERT INTO shift_logs (shift_id, author_user_id, note, incident_level)
      VALUES ($1, $2, $3, $4)
      RETURNING id, shift_id, author_user_id, created_at, note, incident_level
    `,
    [input.shiftId, input.authorUserId, input.note.trim(), input.incidentLevel],
  );
  const row = rows[0];
  if (!row) throw new Error("Не удалось создать запись журнала");
  const { syncTimesheetEntryFromShiftSafe } = await import("../accounting/sync-timesheet-entry");
  await syncTimesheetEntryFromShiftSafe(input.shiftId);
  return {
    id: row.id,
    shiftId: row.shift_id,
    authorUserId: row.author_user_id,
    createdAt: new Date(row.created_at),
    note: row.note,
    incidentLevel: row.incident_level,
  };
}
