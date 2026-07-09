import { hasGuardUniform } from "../format/uniform";
import type { GuardListRow } from "../operations/guards-repository";
import type { GuardLicenseType, GuardPosition, GuardStatus } from "../scheduling/types";

export type YesNoFilter = "" | "yes" | "no";

export type GuardRegistryTableFilters = {
  query: string;
  position: GuardPosition | "";
  licenseType: GuardLicenseType | "";
  employed: YesNoFilter;
  hasCar: YesNoFilter;
  hasUniform: YesNoFilter;
  objectId: string;
  status: GuardStatus | "";
};

export const emptyGuardRegistryTableFilters: GuardRegistryTableFilters = {
  query: "",
  position: "",
  licenseType: "",
  employed: "",
  hasCar: "",
  hasUniform: "",
  objectId: "",
  status: "",
};

export function filterGuardsForRegistryTable(
  guards: GuardListRow[],
  filters: GuardRegistryTableFilters,
): GuardListRow[] {
  const normalizedQuery = filters.query.trim().toLowerCase();

  return guards.filter((guard) => {
    if (normalizedQuery) {
      const full = `${guard.firstName} ${guard.middleName} ${guard.lastName}`.toLowerCase();
      const reversed = `${guard.lastName} ${guard.firstName} ${guard.middleName}`.toLowerCase();
      if (!full.includes(normalizedQuery) && !reversed.includes(normalizedQuery)) return false;
    }
    if (filters.position && guard.position !== filters.position) return false;
    if (filters.licenseType && (guard.licenseType ?? "None") !== filters.licenseType) return false;
    if (filters.employed === "yes" && guard.employmentType !== "Employed") return false;
    if (filters.employed === "no" && guard.employmentType !== "Unemployed") return false;
    if (filters.hasCar === "yes" && !guard.hasCar) return false;
    if (filters.hasCar === "no" && guard.hasCar) return false;
    const uniform = hasGuardUniform(guard.uniformSize, guard.uniformHeight);
    if (filters.hasUniform === "yes" && !uniform) return false;
    if (filters.hasUniform === "no" && uniform) return false;
    if (filters.objectId && !guard.objectIds.includes(filters.objectId)) return false;
    if (filters.status && guard.status !== filters.status) return false;
    return true;
  });
}

export function hasActiveGuardRegistryFilters(filters: GuardRegistryTableFilters): boolean {
  return (
    filters.query.trim() !== "" ||
    filters.position !== "" ||
    filters.licenseType !== "" ||
    filters.employed !== "" ||
    filters.hasCar !== "" ||
    filters.hasUniform !== "" ||
    filters.objectId !== "" ||
    filters.status !== ""
  );
}
