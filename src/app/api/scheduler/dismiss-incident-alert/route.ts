import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { dismissIncidentReplacementAlert } from "../../../../lib/operations/scheduler-repository";

const bodySchema = z.object({
  shiftId: z.string().uuid(),
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

  let shiftId: string;
  try {
    const body = (await request.json()) as unknown;
    shiftId = bodySchema.parse(body).shiftId;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid" }, { status: 400 });
  }

  try {
    await dismissIncidentReplacementAlert(shiftId);
    revalidateTag("global-alerts", "max");
    revalidateTag("scheduler", "max");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось скрыть инцидент";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
