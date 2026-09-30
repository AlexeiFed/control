import { after } from "next/server";

/** Синхронизация производных данных смены (кураторский журнал + материализованный табель). */
export async function syncShiftDerivedEntries(shiftId: string, actorUserId: string): Promise<void> {
  const [{ syncCuratorEntryFromShiftSafe }, { syncTimesheetEntryFromShiftSafe }] = await Promise.all([
    import("../curators/sync-shift-entry"),
    import("../accounting/sync-timesheet-entry"),
  ]);
  await Promise.all([
    syncCuratorEntryFromShiftSafe(shiftId, actorUserId),
    syncTimesheetEntryFromShiftSafe(shiftId),
  ]);
}

/** Пачка: табель одним проходом, журнал кураторов с ограниченной параллельностью. */
export async function syncShiftDerivedEntriesMany(
  shiftIds: readonly string[],
  actorUserId: string,
): Promise<void> {
  const ids = [...new Set(shiftIds.filter(Boolean))];
  if (ids.length === 0) return;
  const [{ syncCuratorEntryFromShiftSafe }, { syncTimesheetEntriesForShiftIds }] = await Promise.all([
    import("../curators/sync-shift-entry"),
    import("../accounting/sync-timesheet-entry"),
  ]);
  let index = 0;
  const workers = Array.from({ length: Math.min(4, ids.length) }, async () => {
    while (index < ids.length) {
      const id = ids[index]!;
      index += 1;
      await syncCuratorEntryFromShiftSafe(id, actorUserId);
    }
  });
  await Promise.all([Promise.all(workers), syncTimesheetEntriesForShiftIds(ids)]);
}

function scheduleAfterResponse(task: () => Promise<void>): void {
  try {
    after(task);
  } catch {
    void task();
  }
}

/** Не блокирует ответ: табель и журнал куратора дописываются после отправки. */
export function scheduleSyncShiftDerivedEntries(shiftId: string, actorUserId: string): void {
  scheduleAfterResponse(() => syncShiftDerivedEntries(shiftId, actorUserId));
}

export function scheduleSyncShiftDerivedEntriesMany(
  shiftIds: readonly string[],
  actorUserId: string,
): void {
  if (shiftIds.length === 0) return;
  scheduleAfterResponse(() => syncShiftDerivedEntriesMany(shiftIds, actorUserId));
}

export function scheduleSyncTimesheetEntry(shiftId: string): void {
  scheduleAfterResponse(async () => {
    const { syncTimesheetEntryFromShiftSafe } = await import("../accounting/sync-timesheet-entry");
    await syncTimesheetEntryFromShiftSafe(shiftId);
  });
}
