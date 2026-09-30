import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import {
  khabarovskMonthRangeContaining,
  khabarovskWeekRangeContaining,
  toDateIsoKhabarovsk,
} from "../../../../../lib/format/display-date";
import {
  listGuardServiceHistory,
  listGuardShiftHistoryInRange,
  type GuardServiceHistoryEntry,
} from "../../../../../lib/operations/guards-repository";
import { calculateShiftHours } from "../../../../../lib/scheduling/hour-calculator";

type RouteContext = { params: Promise<{ guardId: string }> };

function sumHours(shifts: Array<{ startsAt: Date; endsAt: Date }>): number {
  const totalHours = shifts.reduce((sum, shift) => {
    return sum + calculateShiftHours({ startsAt: shift.startsAt, endsAt: shift.endsAt }).totalHours;
  }, 0);
  return Math.round(totalHours * 100) / 100;
}

function serializeHistoryEntry(entry: GuardServiceHistoryEntry) {
  const base = {
    ...entry,
    at: entry.at.toISOString(),
    shiftStartsAt: entry.shiftStartsAt.toISOString(),
    shiftEndsAt: entry.shiftEndsAt.toISOString(),
  };
  if (entry.kind !== "incident") return base;
  return {
    ...base,
    workedUntilAt: entry.workedUntilAt ? entry.workedUntilAt.toISOString() : null,
  };
}

export async function GET(request: Request, context: RouteContext) {
  const session = await requireSession();
  try {
    assertPermission(session.user.role, "guards:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  const { guardId } = await context.params;
  if (!z.string().uuid().safeParse(guardId).success) {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  const dateParam = new URL(request.url).searchParams.get("date") ?? "";
  const dateIso = /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : toDateIsoKhabarovsk(new Date());
  const weekRange = khabarovskWeekRangeContaining(dateIso);
  const monthRange = khabarovskMonthRangeContaining(dateIso);

  const [weekShifts, monthShifts, history] = await Promise.all([
    listGuardShiftHistoryInRange(guardId, weekRange.start, weekRange.endExclusive),
    listGuardShiftHistoryInRange(guardId, monthRange.start, monthRange.endExclusive),
    listGuardServiceHistory(guardId),
  ]);

  return NextResponse.json({
    ok: true,
    weekTotalHours: sumHours(weekShifts),
    monthTotalHours: sumHours(monthShifts),
    history: history.map(serializeHistoryEntry),
  });
}
