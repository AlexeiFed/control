import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { createShiftAssignment } from "../../../../lib/operations/scheduler-repository";

const createShiftSchema = z.object({
  guardId: z.string().uuid(),
  objectId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  replaceShiftId: z.string().uuid().optional(),
  shiftKind: z.enum(["Regular", "Reinforcement", "RapidResponse"]).optional(),
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

  const input = createShiftSchema.parse(await request.json());

  try {
    const { shiftId } = await createShiftAssignment({
      guardId: input.guardId,
      objectId: input.objectId,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      replaceShiftId: input.replaceShiftId,
      shiftKind:
        input.shiftKind === "Reinforcement"
          ? "Reinforcement"
          : input.shiftKind === "RapidResponse"
            ? "RapidResponse"
            : "Regular",
      manualClientRateCents: null,
      manualGuardRateCents: null,
      manualRateUnit: null,
      manualRateReason: "",
    });

    return NextResponse.json({ ok: true, shiftId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка";
    if (message === "Охранник не найден") {
      return NextResponse.json({ ok: false, error: message }, { status: 404 });
    }
    if (message.startsWith("Нельзя назначить")) {
      return NextResponse.json({ ok: false, error: message }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
