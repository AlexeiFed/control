import { NextResponse } from "next/server";
import { requireSession } from "../../../lib/auth/session";
import { getGlobalAlerts } from "../../../lib/operations/global-alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireSession();
  try {
    const payload = await getGlobalAlerts(session.user.role);
    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    console.error("Ошибка загрузки глобальных оповещений:", error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
