import type { GuardEmploymentType, ShiftKind } from "./types";

type GuardForAssignmentSort = {
  hasCar: boolean;
  employmentType?: GuardEmploymentType;
};

function sortGroupForShiftKind<T extends GuardForAssignmentSort>(
  group: readonly T[],
  shiftKind: ShiftKind,
  compareByName: (a: T, b: T) => number,
): T[] {
  const sorted = [...group].sort(compareByName);
  if (shiftKind !== "RapidResponse") return sorted;
  const withCar: T[] = [];
  const withoutCar: T[] = [];
  for (const item of sorted) {
    if (item.hasCar) withCar.push(item);
    else withoutCar.push(item);
  }
  return [...withCar, ...withoutCar];
}

/** Штатные первыми; при МП/ГБР внутри группы — с авто выше. */
export function sortGuardsForShiftAssignment<T extends GuardForAssignmentSort>(
  items: readonly T[],
  shiftKind: ShiftKind,
  compareByName: (a: T, b: T) => number,
): T[] {
  const employed: T[] = [];
  const other: T[] = [];
  for (const item of items) {
    if (item.employmentType === "Employed") employed.push(item);
    else other.push(item);
  }
  return [
    ...sortGroupForShiftKind(employed, shiftKind, compareByName),
    ...sortGroupForShiftKind(other, shiftKind, compareByName),
  ];
}

export function formatGuardAssignmentLabel(
  name: string,
  hasCar: boolean,
  shiftKind: ShiftKind,
): string {
  if (shiftKind === "RapidResponse" && hasCar) return `${name} · авто`;
  return name;
}
