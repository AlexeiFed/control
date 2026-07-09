import { NextResponse } from "next/server";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { listPendingIncidentReplacements } from "../../../../lib/operations/scheduler-repository";

export const dynamic = "force-dynamic";

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
    const items = await listPendingIncidentReplacements();
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
