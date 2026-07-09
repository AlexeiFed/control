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

export function mapGuardLicenseForRates(guard: Pick<Guard, "licenseType">): GuardLicenseType {
  return effectiveGuardLicenseType(guard.licenseType);
}
