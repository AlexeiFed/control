/**
 * CSV-экспорт смен видимой недели графика.
 * URL: /api/scheduler/export/csv?week=YYYY-MM-DD
 * Формат: одна строка на смену; объекты, охранники, время и тип уже расшифрованы.
 * Дата — операционные сутки (как колонка графика), не календарный старт.
 *
 * Используется кнопкой «Экспорт CSV» в фильтре графика.
 */
import { assertPermission } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import { getSchedulerSnapshot } from "../../../../../lib/operations/scheduler-repository";
import {
  listMonthlyOperationalDayStarts,
  monthKeysFromDateIsos,
} from "../../../../../lib/operations/object-monthly-settings-repository";
import {
  formatCompactTimeRangeLocal,
  getKhabarovskComponents,
  toDateIsoKhabarovsk,
} from "../../../../../lib/format/display-date";
import { shiftKindLabels } from "../../../../../lib/operations/status-labels";
import type { ShiftKind } from "../../../../../lib/scheduling/types";
import { resolveTimesheetRowOperationalDateIso } from "../../../../../lib/accounting/timesheet-operational-day";
import { normalizeOperationalAnchorTime } from "../../../../../lib/scheduling/operational-day-timeline";

function csvEscape(value: string | number | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseWeekStartKhabarovsk(value: string | null): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const date = new Date(`${value}T00:00:00+10:00`);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const kh = getKhabarovskComponents(new Date());
  const mondayOffset = kh.dayOfWeek === 0 ? -6 : 1 - kh.dayOfWeek;
  const monday = getKhabarovskComponents(new Date(Date.now() + mondayOffset * 24 * 3_600_000));
  return new Date(
    `${monday.year}-${String(monday.month0 + 1).padStart(2, "0")}-${String(monday.date).padStart(2, "0")}T00:00:00+10:00`,
  );
}

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:read");

  const url = new URL(request.url);
  const weekStart = parseWeekStartKhabarovsk(url.searchParams.get("week"));
  const weekEnd = new Date(weekStart.getTime() + 14 * 24 * 60 * 60_000);
  const objectIdFilter = url.searchParams.get("objectId");

  const snapshot = await getSchedulerSnapshot(weekStart);
  const guardById = new Map(snapshot.guards.map((g) => [g.id, g]));
  const objectById = new Map(snapshot.objects.map((o) => [o.id, o]));

  const filteredShifts = snapshot.shifts
    .filter((s) => s.startsAt >= weekStart && s.startsAt < weekEnd)
    .filter((s) => !objectIdFilter || s.objectId === objectIdFilter)
    .sort((a, b) => {
      const objA = objectById.get(a.objectId)?.name ?? "";
      const objB = objectById.get(b.objectId)?.name ?? "";
      const objCmp = objA.localeCompare(objB, "ru-RU");
      if (objCmp !== 0) return objCmp;
      return a.startsAt.getTime() - b.startsAt.getTime();
    });

  const objectDefaults = new Map(
    snapshot.objects.map((o) => [o.id, normalizeOperationalAnchorTime(o.operationalDayStartTime)] as const),
  );
  const dateIsos = filteredShifts.map((s) => toDateIsoKhabarovsk(s.startsAt));
  const monthlyByKey = await listMonthlyOperationalDayStarts(
    [...objectById.keys()],
    monthKeysFromDateIsos(dateIsos),
  );

  const headers = [
    "Дата",
    "Объект",
    "Охранник",
    "Тип смены",
    "Начало",
    "Конец",
    "Часов",
    "Невыход",
  ];
  const lines: string[] = [headers.join(";")];
  for (const shift of filteredShifts) {
    const dateIso = resolveTimesheetRowOperationalDateIso(
      {
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        objectId: shift.objectId,
      },
      objectDefaults,
      monthlyByKey,
    );
    const obj = objectById.get(shift.objectId);
    const guard = guardById.get(shift.guardId);
    const interval = formatCompactTimeRangeLocal(shift.startsAt, shift.endsAt);
    const [startTime, endTime] = interval.split("–");
    const hours = Math.round(((shift.endsAt.getTime() - shift.startsAt.getTime()) / 3_600_000) * 10) / 10;
    lines.push(
      [
        csvEscape(dateIso),
        csvEscape(obj?.name ?? shift.objectId),
        csvEscape(guard?.name ?? shift.guardId),
        csvEscape(shiftKindLabels[shift.shiftKind as ShiftKind] ?? shift.shiftKind),
        csvEscape(startTime ?? ""),
        csvEscape(endTime ?? ""),
        csvEscape(hours),
        csvEscape(shift.isNoShow ? "да" : "нет"),
      ].join(";"),
    );
  }

  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  const filename = `scheduler-${toDateIsoKhabarovsk(weekStart)}.csv`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
