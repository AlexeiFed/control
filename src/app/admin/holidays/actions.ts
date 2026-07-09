"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { createHoliday, deleteHoliday } from "../../../lib/operations/holidays-repository";
import { backfillTimesheetEntriesForLocalDateSafe } from "../../../lib/accounting/sync-timesheet-entry";

const createSchema = z.object({
  holidayDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(200),
});

export async function createHolidayAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "holidays:manage");

  const input = createSchema.parse({
    holidayDate: formData.get("holidayDate"),
    name: formData.get("name"),
  });

  await createHoliday({ holidayDate: input.holidayDate, name: input.name });
  await backfillTimesheetEntriesForLocalDateSafe(input.holidayDate);
  revalidatePath("/admin/holidays");
  revalidatePath("/scheduler");
  revalidatePath("/accounting/timesheet");
  revalidateTag("timesheet", undefined as any);
  revalidateTag("holidays", undefined as any);
  redirect("/admin/holidays");
}

export async function deleteHolidayAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "holidays:manage");

  const id = z.string().uuid().parse(formData.get("id"));
  const deletedDate = await deleteHoliday(id);
  if (deletedDate) {
    await backfillTimesheetEntriesForLocalDateSafe(deletedDate);
  }
  revalidatePath("/admin/holidays");
  revalidatePath("/scheduler");
  revalidatePath("/accounting/timesheet");
  revalidateTag("timesheet", undefined as any);
  revalidateTag("holidays", undefined as any);
  redirect("/admin/holidays");
}
