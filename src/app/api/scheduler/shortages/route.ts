/**
 * Назначение: Эндпоинт для получения списка недоборов в графике смен на текущую неделю.
 * Описание: Возвращает список объектов и дней с недостающими часами/людьми для отображения в глобальном колокольчике.
 */

import { NextResponse } from "next/server";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { loadScheduleObjectsAndShifts, shortageShiftRange } from "../../../../lib/operations/scheduler-repository";
import { listShiftTemplatesForObjectIds } from "../../../../lib/operations/shift-templates-repository";
import { filterShortagesByStoredDismissals, loadMonthlyOperationalOverridesForDays } from "../../../../lib/operations/schedule-shortage-dismissals-repository";
import { loadPostIdsByObjectMonthForDays } from "../../../../lib/operations/object-posts-repository";
import { buildExpectedShiftsByObjectAndDay, civilDateKeyFromDate } from "../../../../lib/scheduling/object-shift-templates";
import { computeScheduleShortages } from "../../../../lib/scheduling/schedule-shortage";
import { formatWeekdayDayLabel, getMondayWeekStartKhabarovsk, shortageControlDates, SHORTAGE_CONTROL_DAY_COUNT, toDateIsoKhabarovsk } from "../../../../lib/format/display-date";

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
    // Контроль недобора: пн текущей недели … следующий пн включительно.
    const controlDates = shortageControlDates(weekStart);
    const weekDayIsos = controlDates.map((date) => civilDateKeyFromDate(date));
    const weekDays = controlDates.map((date) => ({
      iso: toDateIsoKhabarovsk(date),
      label: formatWeekdayDayLabel(date),
    }));

    const range = shortageShiftRange(weekStart, SHORTAGE_CONTROL_DAY_COUNT);
    const snapshot = await loadScheduleObjectsAndShifts({
      rangeStart: range.start,
      rangeEnd: range.end,
    });
    const objectIds = snapshot.objects.map((o) => o.id);

    const templates = objectIds.length > 0 
      ? await listShiftTemplatesForObjectIds(objectIds) 
      : [];

    const [postIdsByObjectMonth, monthlyOperationalOverrides] = await Promise.all([
      loadPostIdsByObjectMonthForDays(objectIds, weekDayIsos),
      loadMonthlyOperationalOverridesForDays(objectIds, weekDayIsos),
    ]);
    const expectedShiftsByObjectDay = buildExpectedShiftsByObjectAndDay(
      objectIds,
      weekDayIsos,
      templates,
      postIdsByObjectMonth,
    );

    const rawShortages = computeScheduleShortages(
      snapshot.objects,
      snapshot.shifts,
      expectedShiftsByObjectDay,
      weekDays,
      monthlyOperationalOverrides,
      { templates, postIdsByObjectMonth },
    );

    const shortages = await filterShortagesByStoredDismissals({
      objectIds,
      weekDayIsos,
      objects: snapshot.objects,
      shifts: snapshot.shifts,
      expectedByObjectDay: expectedShiftsByObjectDay,
      rawShortages,
      monthlyOperationalOverrides,
    });

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
