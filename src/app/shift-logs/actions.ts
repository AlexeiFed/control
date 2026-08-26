"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { z } from "zod";
import { assertPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { deleteShiftLog, setShiftLogAccounted } from "../../lib/operations/scheduler-repository";

const toggleSchema = z.object({
  logId: z.string().uuid(),
  accounted: z.boolean(),
});

const deleteSchema = z.object({
  logId: z.string().uuid(),
});

function assertCanWriteLogs(role: string): boolean {
  return role === "Administrator" || role === "Planner";
}

export async function toggleShiftLogAccountedAction(input: {
  logId: string;
  accounted: boolean;
}): Promise<{ ok: true; accountedAt: string | null } | { ok: false; error: string }> {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:write");

  if (!assertCanWriteLogs(session.user.role)) {
    return { ok: false, error: "Недостаточно прав" };
  }

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Некорректные данные" };
  }

  try {
    const log = await setShiftLogAccounted(parsed.data);
    revalidatePath("/shift-logs");
    revalidatePath("/scheduler");
    return {
      ok: true,
      accountedAt: log.accountedAt ? log.accountedAt.toISOString() : null,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось обновить запись",
    };
  }
}

export async function deleteShiftLogAction(input: {
  logId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:write");

  if (!assertCanWriteLogs(session.user.role)) {
    return { ok: false, error: "Недостаточно прав" };
  }

  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Некорректные данные" };
  }

  try {
    await deleteShiftLog(parsed.data.logId);
    revalidatePath("/shift-logs");
    revalidatePath("/scheduler");
    revalidatePath("/accounting/timesheet");
    revalidateTag("timesheet", "max");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Не удалось удалить запись",
    };
  }
}
