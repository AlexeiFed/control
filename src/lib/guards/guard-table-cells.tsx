import type { CSSProperties, ReactNode } from "react";
import { formatDisplayDateFromIso } from "../format/display-date";
import { designTokens } from "../design-tokens";
import type { GuardListRow } from "../operations/guards-repository";

export const guardTableThClass =
  "border-b border-app-border px-2 py-1.5 text-center align-middle text-xs font-medium leading-tight text-app-muted";

export const guardTableTdClass =
  "px-2 py-2 text-center align-middle text-xs whitespace-nowrap";

/** Подсветка строки реестра: фон на `<tr>` в Safari не рисуется — красим все `<td>`. */
export const guardRegistryReminderRowClass = "[&>td]:![background-color:var(--guard-compliance-row-bg)]";

export function guardRegistryReminderRowStyle(highlight: boolean): CSSProperties | undefined {
  if (!highlight) return undefined;
  return {
    ["--guard-compliance-row-bg" as string]: designTokens.color.accent.complianceReminderRow,
  };
}

/** Цвет фамилии: зелёный — трудоустроен, жёлтый — в ЛК есть дата. */
export function guardRegistryLastNameClass(guard: GuardListRow): string {
  if (guard.employmentType === "Employed") return "font-semibold text-status-active";
  if (guard.personalCardAssignedOn) return "font-semibold text-accent-warning";
  return "font-semibold";
}

export function GuardTableHeaderLabel({ label }: { label: string }): ReactNode {
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) {
    return <span className="block">{label}</span>;
  }
  return (
    <span className="block leading-tight">
      {parts[0]}
      <br />
      {parts.slice(1).join(" ")}
    </span>
  );
}

export function formatGuardTableDate(iso: string | null | undefined): string {
  return iso ? formatDisplayDateFromIso(iso) : "—";
}

export function guardTableLicenseGrade(guard: GuardListRow): string {
  if (guard.licenseType !== "Licensed") return "—";
  return guard.licenseGrade != null ? String(guard.licenseGrade) : "—";
}

export function guardTableLicenseValidUntil(guard: GuardListRow): string {
  if (guard.licenseType !== "Licensed") return "—";
  return formatGuardTableDate(guard.licenseValidUntil);
}
