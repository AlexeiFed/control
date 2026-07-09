"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { createGuardAdvance, listGuardAdvancesForMonth, deleteGuardAdvance } from "../../../lib/operations/advances-repository";
import type { PayrollHalf } from "../../../lib/payroll/advance-period";
import { PAYROLL_HALVES } from "../../../lib/payroll/advance-period";

const periodHalfSchema = z.enum(PAYROLL_HALVES);

function parseMonthKey(value: string): { year: number; monthIndex0: number } {
  const trimmed = value.trim();
  const m = /^(\d{4})-(\d{2})$/.exec(trimmed);
  if (!m) throw new Error("Некорректный месяц");
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    throw new Error("Некорректный месяц");
  }
  return { year, monthIndex0: month - 1 };
}

export async function issueGuardAdvanceAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "advances:manage");

  const guardId = z.string().uuid().parse(formData.get("guardId"));
  const monthKey = z.string().parse(formData.get("month"));
  const periodHalf = periodHalfSchema.parse(formData.get("periodHalf"));
  const amountRub = z.coerce.number().int().min(1).max(9_999_999).parse(formData.get("amountRub"));
  const note = z.string().max(500).optional().parse(formData.get("note") ?? "") ?? "";

  const { year, monthIndex0 } = parseMonthKey(monthKey);

  await createGuardAdvance({
    guardId,
    year,
    monthIndex0,
    periodHalf,
    amountRub,
    issuedByUserId: session.user.id,
    issuedByName: session.user.name,
    note,
  });

  revalidatePath("/accounting/advances");
  revalidatePath("/accounting/timesheet");
}

export async function deleteGuardAdvanceAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "advances:manage");

  const id = z.string().uuid().parse(formData.get("id"));
  await deleteGuardAdvance(id);

  revalidatePath("/accounting/advances");
  revalidatePath("/accounting/timesheet");
}

export async function fetchGuardAdvancesForMonthAction(monthKey: string) {
  const session = await requireSession();
  assertPermission(session.user.role, "advances:read");

  const { year, monthIndex0 } = parseMonthKey(monthKey);
  const rows = await listGuardAdvancesForMonth(year, monthIndex0);
  return rows;
}

export type { PayrollHalf };
