import { NextResponse } from "next/server";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { listObjectSwitchTabs } from "../../../../lib/operations/objects-repository";

export async function GET() {
  const session = await requireSession();

  try {
    assertPermission(session.user.role, "objects:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  try {
    const objects = await listObjectSwitchTabs();
    return NextResponse.json({ ok: true, objects });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
