/**
 * Назначение: Общий клиентский helper для снятия (dismiss) недобора часов дня объекта.
 * Используется из object-month-schedule-grid.tsx и scheduler-grid.tsx.
 */

export async function dismissDayShortage(objectId: string, dateIso: string): Promise<void> {
  const res = await fetch("/api/scheduler/dismiss-day-shortage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectId, dateIso }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error ?? "Не удалось снять предупреждение");
}
