import { toDateIsoKhabarovsk } from "../format/display-date";

/** За сколько дней до истечения показывать напоминание (≈2 месяца). */
export const GUARD_COMPLIANCE_REMINDER_DAYS = 60;
export const PERIODIC_CHECK_REMINDER_DAYS = GUARD_COMPLIANCE_REMINDER_DAYS;

/** Срок на прохождение пер. проверки после заведения личной карточки. */
export const PERSONAL_CARD_PERIODIC_CHECK_GRACE_DAYS = 30;

/** YYYY-MM-DD из ISO-даты или timestamp из БД. */
export function parseIsoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Срок действия медкомиссии / периодической проверки — 1 год с даты прохождения. */
export function guardComplianceExpiryIso(passedOnIso: string): string {
  const iso = parseIsoDateOnly(passedOnIso);
  if (!iso) return passedOnIso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return passedOnIso;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  dt.setUTCFullYear(dt.getUTCFullYear() + 1);
  const ey = dt.getUTCFullYear();
  const em = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const ed = String(dt.getUTCDate()).padStart(2, "0");
  return `${ey}-${em}-${ed}`;
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.NaN;
  return Math.round((b - a) / 86_400_000);
}

export function periodicCheckExpiryIso(passedOnIso: string): string {
  return guardComplianceExpiryIso(passedOnIso);
}

export function needsGuardComplianceReminder(passedOnIso: string, todayIso: string): boolean {
  const passed = parseIsoDateOnly(passedOnIso);
  if (!passed) return false;
  const expiry = guardComplianceExpiryIso(passed);
  const daysLeft = daysBetweenIso(todayIso, expiry);
  return Number.isFinite(daysLeft) && daysLeft <= GUARD_COMPLIANCE_REMINDER_DAYS;
}

export function needsPeriodicCheckReminder(passedOnIso: string, todayIso: string): boolean {
  return needsGuardComplianceReminder(passedOnIso, todayIso);
}

function addCalendarDaysIso(iso: string, days: number): string {
  const base = parseIsoDateOnly(iso);
  if (!base) return iso;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(base);
  if (!m) return iso;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${d}`;
}

/** Крайний срок пер. проверки после заведения ЛК (дата ЛК + 30 дней). */
export function personalCardPeriodicCheckDueIso(personalCardAssignedOnIso: string): string {
  return addCalendarDaysIso(personalCardAssignedOnIso, PERSONAL_CARD_PERIODIC_CHECK_GRACE_DAYS);
}

/**
 * ЛК заведена, пер. проверка не пройдена, с даты ЛК прошло ≥30 дней.
 * Если пер. проверка уже есть — только срок год+60 дней (см. needsPeriodicCheckReminder).
 */
export function needsPeriodicCheckReminderAfterPersonalCard(
  personalCardAssignedOnIso: string,
  periodicCheckPassedOn: string | null | undefined,
  todayIso: string,
): boolean {
  if (parseIsoDateOnly(periodicCheckPassedOn)) return false;
  const pc = parseIsoDateOnly(personalCardAssignedOnIso);
  if (!pc) return false;
  const dueIso = personalCardPeriodicCheckDueIso(pc);
  const daysPastDue = daysBetweenIso(dueIso, todayIso);
  return Number.isFinite(daysPastDue) && daysPastDue >= 0;
}

export function needsPeriodicCheckReminderForGuard(
  periodicCheckPassedOn: string | null | undefined,
  personalCardAssignedOn: string | null | undefined,
  todayIso: string,
): boolean {
  const periodic = parseIsoDateOnly(periodicCheckPassedOn);
  if (periodic) return needsPeriodicCheckReminder(periodic, todayIso);
  if (personalCardAssignedOn) {
    return needsPeriodicCheckReminderAfterPersonalCard(
      personalCardAssignedOn,
      null,
      todayIso,
    );
  }
  return false;
}

/** Сегодня по календарю Хабаровска (как в ERP). */
export function todayIsoLocal(): string {
  return toDateIsoKhabarovsk(new Date());
}

/** Строка реестра — в баннере медкомиссии или периодической проверки (активный). */
export function isGuardComplianceReminderRow(guard: {
  status: string;
  medicalCommissionPassedOn: string | null;
  periodicCheckPassedOn: string | null;
  personalCardAssignedOn?: string | null;
}, todayIso: string = todayIsoLocal()): boolean {
  if (guard.status !== "Active") return false;
  if (
    guard.medicalCommissionPassedOn &&
    needsGuardComplianceReminder(guard.medicalCommissionPassedOn, todayIso)
  ) {
    return true;
  }
  return needsPeriodicCheckReminderForGuard(
    guard.periodicCheckPassedOn,
    guard.personalCardAssignedOn,
    todayIso,
  );
}

/** Fingerprint для sessionStorage: при смене дат прохождения баннер снова показывается. */
export function complianceReminderBannerFingerprint(
  items: Array<{
    guardId: string;
    passedOn?: string;
    expiryIso?: string;
    reminderKind?: string;
  }>,
): string {
  return items
    .map(
      (item) =>
        `${item.guardId}|${item.reminderKind ?? "expiry"}|${item.passedOn ?? ""}|${item.expiryIso ?? ""}`,
    )
    .sort()
    .join(";");
}
