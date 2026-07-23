/**
 * Назначение: Эндпоинт для получения списка недоборов в графике смен на текущую неделю.
 * Описание: Возвращает список объектов и дней с недостающими часами/людьми для отображения в глобальном колокольчике.
 */

import { NextResponse } from "next/server";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { getSchedulerSnapshot } from "../../../../lib/operations/scheduler-repository";
import { listShiftTemplatesForObjectIds } from "../../../../lib/operations/shift-templates-repository";
import { listShortageDismissals } from "../../../../lib/operations/schedule-shortage-dismissals-repository";
import { buildExpectedShiftsByObjectAndDay, civilDateKeyFromDate } from "../../../../lib/scheduling/object-shift-templates";
import { computeScheduleShortages } from "../../../../lib/scheduling/schedule-shortage";
import { buildValidShortageDismissKeySet } from "../../../../lib/scheduling/build-shortage-dismiss-state";
import { filterShortagesByDismissals } from "../../../../lib/scheduling/schedule-shortage-dismiss";
import { getMondayWeekStartKhabarovsk, toDateIsoKhabarovsk, formatWeekdayDayLabel } from "../../../../lib/format/display-date";

export async function GET() {
  const session = await requireSession();

  try {
    assertPermission(session.user.role, "schedule:read");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  try {
    const weekStart = getMondayWeekStartKhabarovsk();
    // Только текущая календарная неделя пн–вс.
    const visibleDayCount = 7;
    const weekDayIsos = Array.from({ length: visibleDayCount }, (_, index) =>
      civilDateKeyFromDate(new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000)),
    );

    const weekDays = Array.from({ length: visibleDayCount }, (_, index) => {
      const date = new Date(weekStart.getTime() + index * 24 * 60 * 60_000);
      const iso = toDateIsoKhabarovsk(date);
      return {
        iso,
        label: formatWeekdayDayLabel(date),
      };
    });

    const snapshot = await getSchedulerSnapshot(weekStart);
    const objectIds = snapshot.objects.map((o) => o.id);

    const templates = objectIds.length > 0 
      ? await listShiftTemplatesForObjectIds(objectIds) 
      : [];

    const expectedShiftsByObjectDay = buildExpectedShiftsByObjectAndDay(objectIds, weekDayIsos, templates);

    const rawShortages = computeScheduleShortages(
      snapshot.objects,
      snapshot.shifts,
      expectedShiftsByObjectDay,
      weekDays
    );

    const storedDismissals = await listShortageDismissals(
      objectIds,
      weekDayIsos[0]!,
      weekDayIsos[weekDayIsos.length - 1]!,
    );
    const validDismissKeys = buildValidShortageDismissKeySet({
      objects: snapshot.objects,
      shifts: snapshot.shifts,
      expectedByObjectDay: expectedShiftsByObjectDay,
      weekDayIsos,
      storedDismissals,
    });
    const shortages = filterShortagesByDismissals(rawShortages, validDismissKeys);

    const weekStartIso = toDateIsoKhabarovsk(weekStart);

    return NextResponse.json({
      ok: true,
      shortages,
      weekStartIso,
    });
  } catch (error) {
    console.error("Ошибка при расчете недоборов смен:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
