import type { GuardStatus } from "../scheduling/types";

export type GuardFilterInput = {
  query?: string;
  objectId?: string;
  status?: string;
};

export type GuardFilters = {
  query: string;
  objectId: string;
  status: GuardStatus | "";
};

export function normalizeGuardFilters(input: GuardFilterInput): GuardFilters {
  return {
    query: input.query?.trim() ?? "",
    objectId: input.objectId?.trim() ?? "",
    status: isGuardStatus(input.status) ? input.status : "",
  };
}

export function isGuardStatus(value: unknown): value is GuardStatus {
  return (
    value === "Active" ||
    value === "Sick" ||
    value === "OnVacation" ||
    value === "Inactive" ||
    value === "Dismissed"
  );
}
