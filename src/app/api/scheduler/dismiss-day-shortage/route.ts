/**
 * Назначение: Эндпоинт для скрытия (dismiss) недобора смен объекта на конкретный операционный день.
 * Описание: Пересчитывает фингерпринт текущего состояния дня (смены + план + незаменённый инцидент)
 * и сохраняет его — пока состояние дня не изменится, недобор будет скрыт из выдачи GET /shortages.
 */

import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { getSchedulerSnapshot } from "../../../../lib/operations/scheduler-repository";
import { listShiftTemplatesForObjectIds } from "../../../../lib/operations/shift-templates-repository";
import { upsertShortageDismissal } from "../../../../lib/operations/schedule-shortage-dismissals-repository";
import { buildExpectedShiftsByObjectAndDay, civilDateKeyFromDate } from "../../../../lib/scheduling/object-shift-templates";
import { buildOperationalDayAnchorByObjectId } from "../../../../lib/scheduling/schedule-shortage";
import { shiftBelongsToOperationalDayColumn } from "../../../../lib/scheduling/operational-day-timeline";
import { aggregatePlanSnapshot, shiftToDismissInput } from "../../../../lib/scheduling/build-shortage-dismiss-state";
import { buildShortageDayFingerprint } from "../../../../lib/scheduling/schedule-shortage-dismiss";
import { khabarovskWeekRangeContaining } from "../../../../lib/format/display-date";

const bodySchema = z.object({
  objectId: z.string().uuid(),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(request: Request) {
  const session = await requireSession();

  try {
    assertPermission(session.user.role, "schedule:write");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  let objectId: string;
  let dateIso: string;
  try {
    const body = (await request.json()) as unknown;
    const parsed = bodySchema.parse(body);
    objectId = parsed.objectId;
    dateIso = parsed.dateIso;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    const { start: weekStart } = khabarovskWeekRangeContaining(dateIso);
    const visibleDayCount = 7;
    const weekDayIsos = Array.from({ length: visibleDayCount }, (_, index) =>
      civilDateKeyFromDate(new Date(weekStart.getTime() + index * 24 * 60 * 60_000)),
    );

    const snapshot = await getSchedulerSnapshot(weekStart);
    const object = snapshot.objects.find((o) => o.id === objectId);
    if (!object) {
      return NextResponse.json({ ok: false, error: "object_not_found" }, { status: 400 });
    }

    const templates = await listShiftTemplatesForObjectIds([objectId]);
    const expectedShiftsByObjectDay = buildExpectedShiftsByObjectAndDay([objectId], weekDayIsos, templates);

    const anchorByObjectId = buildOperationalDayAnchorByObjectId([object]);
    const dayShifts = snapshot.shifts.filter(
      (s) => s.objectId === objectId && shiftBelongsToOperationalDayColumn(s, dateIso, anchorByObjectId),
    );
    const pendingIncident = dayShifts.some((s) => s.incidentRecordedAt != null && s.replacedByShiftId == null);

    const fingerprint = buildShortageDayFingerprint({
      shifts: dayShifts.map(shiftToDismissInput),
      plan: aggregatePlanSnapshot([expectedShiftsByObjectDay[objectId]?.[dateIso]]),
      pendingIncident,
    });

    await upsertShortageDismissal({
      objectId,
      dateIso,
      fingerprint,
      dismissedBy: session.user.id,
    });

    revalidateTag("global-alerts", "max");
    revalidateTag("scheduler", "max");

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось скрыть недобор";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
