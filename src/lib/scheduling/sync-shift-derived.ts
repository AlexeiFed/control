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
