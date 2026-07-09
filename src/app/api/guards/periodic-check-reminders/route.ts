import { NextResponse } from "next/server";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { formatDisplayDateFromIso } from "../../../../lib/format/display-date";
import { listGuardsForPeriodicCheckReminders } from "../../../../lib/operations/guards-repository";

export async function GET() {
  const session = await requireSession();

  try {
    assertPermission(session.user.role, "guards:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }
    throw error;
  }

  try {
    const rows = await listGuardsForPeriodicCheckReminders();
    const items = rows.map((row) => {
      const isPersonalCard = row.reminderKind === "personal_card";
      const referenceIso = isPersonalCard
        ? row.personalCardAssignedOn ?? row.passedOn
        : row.periodicCheckPassedOn ?? row.passedOn;
      return {
        guardId: row.guardId,
        guardName: `${row.lastName} ${row.firstName}`,
        reminderKind: row.reminderKind,
        passedOn: referenceIso,
        passedOnDisplay: formatDisplayDateFromIso(referenceIso),
        expiryIso: row.expiryIso,
        expiryDisplay: formatDisplayDateFromIso(row.expiryIso),
      };
    });
    return NextResponse.json({ ok: true, items });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
