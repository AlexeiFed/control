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

/** Статус охранника влияет на пикер смен и снапшот графика — сбрасываем кэш сразу. */
export function revalidateAfterGuardStatusChange(guardId?: string): void {
  const pathSpecs: Array<[string, "layout" | "page"]> = [
    ["/", "layout"],
    ["/guards", "layout"],
    ["/scheduler", "layout"],
    ["/objects", "layout"],
    ["/accounting", "layout"],
  ];
  if (guardId) pathSpecs.push([`/guards/${guardId}`, "page"]);

  for (const [path, type] of pathSpecs) {
    try {
      revalidatePath(path, type);
    } catch (error) {
      console.error("[revalidatePath]", path, error);
    }
  }
  for (const tag of ["scheduler", "directory", "global-alerts", "guards", "timesheet"] as const) {
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
