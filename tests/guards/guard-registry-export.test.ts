import { describe, expect, it } from "vitest";
import { buildGuardRegistryExportRow, GUARD_REGISTRY_EXPORT_HEADERS } from "../../src/lib/guards/guard-registry-export";
import type { GuardListRow } from "../../src/lib/operations/guards-repository";

function row(partial: Partial<GuardListRow>): GuardListRow {
  return {
    id: "g1",
    firstName: "Иван",
    middleName: "Иванович",
    lastName: "Иванов",
    status: "Active",
    dismissedOn: null,
    birthDate: "1990-05-15",
    phone: "+7 (999) 111-22-33",
    contactPhone: "",
    uniformSize: 4,
    uniformHeight: 180,
    uniformIssued: false,
    uniformIssuedOn: null,
    uniformCondition: null,
    uniformNote: null,
    position: "Guard",
    licenseType: "Licensed",
    licenseGrade: 4,
    licenseValidUntil: "2027-01-01",
    employmentType: "Employed",
    employedOn: "2024-03-01",
    medicalCommissionPassedOn: "2025-01-01",
    periodicCheckPassedOn: "2025-06-01",
    personalCardAssignedOn: "2025-06-02",
    isTrainee: false,
    traineeUntil: null,
    hasCar: true,
    traineeExpired: false,
    objectIds: ["o1"],
    objectNames: ["Объект 1"],
    weekShiftCount: 3,
    weekHours: 36,
    ...partial,
  };
}

describe("guard-registry-export", () => {
  it("builds row with birth date and ordered columns", () => {
    const exported = buildGuardRegistryExportRow(row({}), 0);
    expect(exported).toHaveLength(GUARD_REGISTRY_EXPORT_HEADERS.length);
    expect(exported[1]).toBe("Иванов");
    expect(exported[2]).toBe("Иван");
    expect(exported[3]).toBe("Иванович");
    expect(exported[4]).toBe("15.05.1990");
    expect(exported[7]).toBe("Охранник");
    expect(exported[21]).toBe("Объект 1");
  });
});
