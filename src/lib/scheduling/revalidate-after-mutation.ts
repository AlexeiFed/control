import { revalidatePath, revalidateTag } from "next/cache";

/** Инвалидация кэша баннера медкомиссии / периодической проверки после правок охранника. */
export function revalidateGuardComplianceAlerts(): void {
  for (const tag of ["global-alerts", "guards"] as const) {
    try {
      revalidateTag(tag, "max");
    } catch (error) {
      console.error("[revalidateTag]", tag, error);
    }
  }
}

/** Не роняем server action, если инвалидация кэша недоступна в текущем контексте Next.js. */
export function revalidateAfterShiftMutation(
  paths: string[],
  tags: string[] = ["timesheet", "scheduler", "global-alerts"],
): void {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      console.error("[revalidatePath]", path, error);
    }
  }
  for (const tag of tags) {
    try {
      revalidateTag(tag, "max");
    } catch (error) {
      console.error("[revalidateTag]", tag, error);
    }
  }
}
