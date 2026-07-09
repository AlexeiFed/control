import { formatDisplayDateFromIso } from "../format/display-date";
import { formatUniformSizeDisplay } from "../format/uniform";
import type { GuardListRow } from "../operations/guards-repository";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
  guardStatusLabels,
} from "../operations/status-labels";
import { mapGuardLicenseForRates } from "../scheduling/guard-profile";

export const GUARD_REGISTRY_EXPORT_HEADERS = [
  "№ п/п",
  "Фамилия",
  "Имя",
  "Отчество",
  "Дата рождения",
  "Телефон",
  "Контактный телефон",
  "Должность",
  "Удостоверение",
  "Разряд",
  "Удостоверение до",
  "Трудоустройство",
  "Дата оф. трудоустройства",
  "Медкомиссия",
  "Периодическая проверка",
  "Личная карточка",
  "Стажёр",
  "Стажировка до",
  "Авто",
  "Размер формы",
  "Рост",
  "Объекты",
  "Статус",
  "Дата увольнения",
] as const;

export type GuardRegistryExportRow = readonly (string | number)[];

function formatOptionalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatDisplayDateFromIso(iso);
}

function formatUniformSizeCell(guard: GuardListRow): string {
  if (guard.uniformSize == null) return "";
  return formatUniformSizeDisplay(guard.uniformSize);
}

export function buildGuardRegistryExportRow(guard: GuardListRow, index: number): GuardRegistryExportRow {
  const license = guard.licenseType ? guardLicenseLabels[mapGuardLicenseForRates(guard)] : "";
  return [
    index + 1,
    guard.lastName,
    guard.firstName,
    guard.middleName || "",
    formatOptionalDate(guard.birthDate),
    guard.phone || "",
    guard.contactPhone || "",
    guardPositionLabels[guard.position],
    license,
    guard.licenseType === "Licensed" && guard.licenseGrade != null ? guard.licenseGrade : "",
    guard.licenseType === "Licensed" ? formatOptionalDate(guard.licenseValidUntil) : "",
    guardEmploymentLabels[guard.employmentType],
    guard.employmentType === "Employed" ? formatOptionalDate(guard.employedOn) : "",
    formatOptionalDate(guard.medicalCommissionPassedOn),
    formatOptionalDate(guard.periodicCheckPassedOn),
    formatOptionalDate(guard.personalCardAssignedOn),
    guard.isTrainee ? "да" : "нет",
    guard.isTrainee ? formatOptionalDate(guard.traineeUntil) : "",
    guard.hasCar ? "да" : "нет",
    formatUniformSizeCell(guard),
    guard.uniformHeight != null ? guard.uniformHeight : "",
    guard.objectNames.join(", "),
    guardStatusLabels[guard.status],
    formatOptionalDate(guard.dismissedOn),
  ];
}

export function buildGuardRegistryExportRows(guards: readonly GuardListRow[]): GuardRegistryExportRow[] {
  return guards.map((guard, index) => buildGuardRegistryExportRow(guard, index));
}
