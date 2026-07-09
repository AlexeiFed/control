export const GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT = "guard-compliance-reminders:refresh";

/** Сигнал клиенту перезагрузить баннер медкомиссии / периодической проверки. */
export function dispatchGuardComplianceRemindersRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT));
}
