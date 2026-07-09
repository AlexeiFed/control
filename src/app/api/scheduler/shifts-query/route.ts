import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import {
  listShiftsForGuardsInLocalMonth,
  listShiftsInLocalRange,
} from "../../../../lib/operations/scheduler-repository";
import type { Shift } from "../../../../lib/scheduling/types";

const guardMonthSchema = z.object({
  guardId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

const rangeSchema = z.object({
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
});

function serializeShift(shift: Shift) {
  return {
    ...shift,
    startsAt: shift.startsAt.toISOString(),
    endsAt: shift.endsAt.toISOString(),
    incidentWorkedUntilAt: shift.incidentWorkedUntilAt?.toISOString() ?? null,
    incidentRecordedAt: shift.incidentRecordedAt?.toISOString() ?? null,
  };
}

export async function GET(request: Request) {
  const session = await requireSession();

  try {
    assertPermission(session.user.role, "schedule:read");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  const url = new URL(request.url);
  const guardId = url.searchParams.get("guardId");
  const year = url.searchParams.get("year");
  const month = url.searchParams.get("month");
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");

  try {
    let shifts: Shift[];
    if (guardId && year && month) {
      const parsed = guardMonthSchema.parse({ guardId, year, month });
      shifts = await listShiftsForGuardsInLocalMonth(
        [parsed.guardId],
        parsed.year,
        parsed.month - 1,
      );
    } else if (start && end) {
      const parsed = rangeSchema.parse({ start, end });
      shifts = await listShiftsInLocalRange(new Date(parsed.start), new Date(parsed.end));
    } else {
      return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
    }

    return NextResponse.json({ ok: true, shifts: shifts.map(serializeShift) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "invalid_query" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
