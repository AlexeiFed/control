import { NextResponse } from "next/server";
import { z } from "zod";
import { assertPermission, ForbiddenError, roles } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import {
  createManagedUser,
  DuplicateUserError,
  InvalidUserInputError,
} from "../../../../lib/auth/user-service";

const createUserSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  role: z.enum(roles),
  password: z.string().min(8),
  active: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await requireSession();

  try {
    assertPermission(session.user.role, "users:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
    }

    throw error;
  }

  try {
    const input = createUserSchema.parse(await request.json());
    const user = await createManagedUser(input);
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof InvalidUserInputError) {
      return NextResponse.json({ ok: false, error: "invalid_user_input" }, { status: 400 });
    }

    if (error instanceof DuplicateUserError) {
      return NextResponse.json({ ok: false, error: "email_already_exists" }, { status: 409 });
    }

    throw error;
  }
}
