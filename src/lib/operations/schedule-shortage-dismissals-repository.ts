import { isUndefinedColumnOrTableError } from "../db/column-compat";
import { query } from "../db/pool";
import { getMondayWeekStartKhabarovsk } from "../format/display-date";
import { buildExpectedShiftsByObjectAndDay, civilDateKeyFromDate, type ExpectedShifts } from "../scheduling/object-shift-templates";
import type { ScheduleObjectRef, ScheduleObjectShortage } from "../scheduling/schedule-shortage";
import { buildValidShortageDismissKeySet } from "../scheduling/build-shortage-dismiss-state";
import { filterShortagesByDismissals, shortageDismissKey } from "../scheduling/schedule-shortage-dismiss";
import type { Shift } from "../scheduling/types";
import {
  listMonthlyOperationalDayStarts,
  monthKeysFromDateIsos,
} from "./object-monthly-settings-repository";
import { getSchedulerSnapshot } from "./scheduler-repository";
import { listShiftTemplatesForObjectIds } from "./shift-templates-repository";

export async function loadMonthlyOperationalOverridesForDays(
  objectIds: ReadonlyArray<string>,
  weekDayIsos: ReadonlyArray<string>,
): Promise<Map<string, string>> {
  return listMonthlyOperationalDayStarts(objectIds, monthKeysFromDateIsos(weekDayIsos));
}

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

/**
 * Применяет сохранённые dismiss'ы недоборов к сырым результатам `computeScheduleShortages`.
 * Общая логика для GET /api/scheduler/shortages и глобальных алертов, чтобы оба пути
 * скрывали одни и те же уже подтверждённые (и всё ещё валидные) недоборы дня.
 */
export async function filterShortagesByStoredDismissals(input: {
  objectIds: string[];
  weekDayIsos: ReadonlyArray<string>;
  objects: ReadonlyArray<ScheduleObjectRef>;
  shifts: ReadonlyArray<Shift>;
  expectedByObjectDay: Record<string, Record<string, ExpectedShifts>>;
  rawShortages: ReadonlyArray<ScheduleObjectShortage>;
  monthlyOperationalOverrides?: ReadonlyMap<string, string>;
}): Promise<ScheduleObjectShortage[]> {
  const storedDismissals = await listShortageDismissals(
    input.objectIds,
    input.weekDayIsos[0]!,
    input.weekDayIsos[input.weekDayIsos.length - 1]!,
  );
  const monthlyOperationalOverrides =
    input.monthlyOperationalOverrides ??
    (await loadMonthlyOperationalOverridesForDays(input.objectIds, input.weekDayIsos));
  const validDismissKeys = buildValidShortageDismissKeySet({
    objects: input.objects,
    shifts: input.shifts,
    expectedByObjectDay: input.expectedByObjectDay,
    weekDayIsos: input.weekDayIsos,
    storedDismissals,
    monthlyOperationalOverrides,
  });
  return filterShortagesByDismissals(input.rawShortages, validDismissKeys);
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

function currentWeekDayIsos(): string[] {
  const weekStart = getMondayWeekStartKhabarovsk();
  return Array.from({ length: 7 }, (_, index) =>
    civilDateKeyFromDate(new Date(weekStart.getTime() + index * 24 * 60 * 60_000)),
  );
}

/**
 * Пересчитывает валидные dismiss'ы недобора на текущую неделю для UI сетки объекта/планировщика.
 * Использует тот же снимок и ту же логику фингерпринтов, что и GET /shortages и POST /dismiss-day-shortage —
 * клиент никогда не должен просто доверять сохранённым в БД строкам без пересчёта.
 */
export async function buildCurrentWeekValidShortageDismissKeySet(
  objectIds: ReadonlyArray<string> = [],
): Promise<{ weekDayIsos: string[]; validKeys: Set<string> }> {
  const weekDayIsos = currentWeekDayIsos();
  const weekStart = getMondayWeekStartKhabarovsk();
  const snapshot = await getSchedulerSnapshot(weekStart);
  const objects =
    objectIds.length > 0 ? snapshot.objects.filter((o) => objectIds.includes(o.id)) : snapshot.objects;
  const scopedObjectIds = objects.map((o) => o.id);

  if (scopedObjectIds.length === 0) return { weekDayIsos, validKeys: new Set() };

  const templates = await listShiftTemplatesForObjectIds(scopedObjectIds);
  const expectedByObjectDay = buildExpectedShiftsByObjectAndDay(scopedObjectIds, weekDayIsos, templates);
  const storedDismissals = await listShortageDismissals(scopedObjectIds, weekDayIsos[0]!, weekDayIsos[6]!);
  const monthlyOperationalOverrides = await loadMonthlyOperationalOverridesForDays(
    scopedObjectIds,
    weekDayIsos,
  );

  const validKeys = buildValidShortageDismissKeySet({
    objects,
    shifts: snapshot.shifts,
    expectedByObjectDay,
    weekDayIsos,
    storedDismissals,
    monthlyOperationalOverrides,
  });

  return { weekDayIsos, validKeys };
}

/** Список валидных на текущую неделю dismiss-дат (`YYYY-MM-DD`) для одного объекта, для страницы объекта. */
export async function listValidShortageDismissDateIsosForObject(objectId: string): Promise<string[]> {
  const { weekDayIsos, validKeys } = await buildCurrentWeekValidShortageDismissKeySet([objectId]);
  return weekDayIsos.filter((dateIso) => validKeys.has(shortageDismissKey(objectId, dateIso)));
}
