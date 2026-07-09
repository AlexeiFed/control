import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { createShiftLog } from "../../../../lib/operations/scheduler-repository";

const shiftLogSchema = z.object({
  shiftId: z.string().uuid(),
  note: z.string().trim().min(1),
  incidentLevel: z.enum(["None", "Info", "Warning", "Critical"]),
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

  const body = shiftLogSchema.parse(await request.json());

  try {
    const log = await createShiftLog({
      shiftId: body.shiftId,
      authorUserId: session.user.id,
      note: body.note,
      incidentLevel: body.incidentLevel,
    });

    return NextResponse.json(
      {
        ok: true,
        log: {
          ...log,
          createdAt: log.createdAt.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
