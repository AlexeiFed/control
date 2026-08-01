import type { Guard, GuardLicenseType, GuardPosition } from "./types";

/** У всех должностей удостоверение: Б/У или У. */
export function isValidGuardLicenseForPosition(
  _position: GuardPosition,
  licenseType: GuardLicenseType | null,
): boolean {
  return licenseType === "None" || licenseType === "Licensed";
}

/** Значение из БД → тип для расчёта ставок (NULL трактуем как Б/У). */
export function mapGuardLicenseFromDb(raw: string | null | undefined): GuardLicenseType {
  if (raw === "Licensed" || raw === "None") return raw;
  return "None";
}

/** Для подбора ставки: у всех должностей одинаково, без NULL. */
export function effectiveGuardLicenseType(licenseType: GuardLicenseType | null): GuardLicenseType {
  return licenseType ?? "None";
}

/**
 * Лицензия для матчинга ставок.
 * Профиль «Licensed» на дату смены = правило «У»: с даты ЛК (удостоверение + личная карточка).
 * ТУ (Employed) приоритетнее: без даты ЛК всё равно матчим правила «ТУ + с ЛК».
 */
export function mapGuardLicenseForRates(
  guard: Pick<Guard, "licenseType" | "employmentType">,
): GuardLicenseType {
  if (guard.employmentType === "Employed") return "Licensed";
  return effectiveGuardLicenseType(guard.licenseType);
}
