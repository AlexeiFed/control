"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission, ForbiddenError, roles } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import {
  createManagedUser,
  deleteManagedUser,
  DuplicateUserError,
  InvalidUserInputError,
  updateManagedUser,
  updateManagedUserPassword,
} from "../../../lib/auth/user-service";

const createSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  role: z.enum(roles),
  password: z.string().min(8, "Пароль не короче 8 символов"),
});

const passwordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(8, "Пароль не короче 8 символов"),
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().trim().email(),
  name: z.string().trim().min(1),
  role: z.enum(roles),
  active: z.boolean(),
});

export type AdminUserActionResult =
  | { ok: true }
  | { ok: false; error: string };

async function ensureUsersManage() {
  const session = await requireSession();
  try {
    assertPermission(session.user.role, "users:manage");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return { session: null, error: "Нет прав" };
    }
    throw error;
  }
  return { session, error: null };
}

export async function adminCreateUserAction(input: z.infer<typeof createSchema>): Promise<AdminUserActionResult> {
  const gate = await ensureUsersManage();
  if (gate.error) return { ok: false, error: gate.error };

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors[0] ?? "Некорректные данные" };
  }

  try {
    await createManagedUser(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateUserError) {
      return { ok: false, error: "Пользователь с таким email уже есть" };
    }
    if (error instanceof InvalidUserInputError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath("/login");
  return { ok: true };
}

export async function adminSetUserPasswordAction(
  input: z.infer<typeof passwordSchema>,
): Promise<AdminUserActionResult> {
  const gate = await ensureUsersManage();
  if (gate.error) return { ok: false, error: gate.error };

  const parsed = passwordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors[0] ?? "Некорректные данные" };
  }

  try {
    await updateManagedUserPassword(parsed.data.userId, parsed.data.password);
  } catch (error) {
    if (error instanceof InvalidUserInputError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath("/login");
  return { ok: true };
}

export async function adminUpdateUserAction(
  input: z.infer<typeof updateSchema>,
): Promise<AdminUserActionResult> {
  const gate = await ensureUsersManage();
  if (gate.error) return { ok: false, error: gate.error };

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors[0] ?? "Некорректные данные" };
  }

  if (gate.session?.user.id === parsed.data.userId && !parsed.data.active) {
    return { ok: false, error: "Нельзя отключить свой аккаунт" };
  }

  try {
    await updateManagedUser(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateUserError) {
      return { ok: false, error: "Пользователь с таким email уже есть" };
    }
    if (error instanceof InvalidUserInputError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath("/login");
  return { ok: true };
}

const deleteSchema = z.object({
  userId: z.string().uuid(),
});

export async function adminDeleteUserAction(
  input: z.infer<typeof deleteSchema>,
): Promise<AdminUserActionResult> {
  const gate = await ensureUsersManage();
  if (gate.error) return { ok: false, error: gate.error };

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.flatten().formErrors[0] ?? "Некорректные данные" };
  }

  if (gate.session?.user.id === parsed.data.userId) {
    return { ok: false, error: "Нельзя удалить свой аккаунт" };
  }

  try {
    await deleteManagedUser(parsed.data.userId);
  } catch (error) {
    if (error instanceof InvalidUserInputError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }

  revalidatePath("/admin/users");
  revalidatePath("/login");
  return { ok: true };
}
