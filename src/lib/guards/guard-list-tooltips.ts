import { formatDisplayDateFromIso } from "../format/display-date";
import type { GuardListRow } from "../operations/guards-repository";

export function guardLicenseCellTooltip(guard: GuardListRow): string | undefined {
  if (guard.licenseType !== "Licensed") return undefined;
  const parts: string[] = [];
  if (guard.licenseGrade != null) parts.push(`Разряд ${guard.licenseGrade}`);
  if (guard.licenseValidUntil) {
    parts.push(`действует до ${formatDisplayDateFromIso(guard.licenseValidUntil)}`);
  }
  return parts.length > 0 ? parts.join(", ") : "Данные удостоверения не указаны";
}

export function guardEmploymentCellTooltip(guard: GuardListRow): string | undefined {
  if (guard.employmentType !== "Employed") return undefined;
  return guard.employedOn
    ? `Офиц. трудоустройство: ${formatDisplayDateFromIso(guard.employedOn)}`
    : "Дата трудоустройства не указана";
}
