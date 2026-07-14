import { describe, expect, it } from "vitest";
import { filterGuardsForRegistryTable } from "./guard-registry-filter";
import type { GuardListRow } from "../operations/guards-repository";

function row(partial: Partial<GuardListRow>): GuardListRow {
  return {
    id: "1",
    firstName: "Иван",
    middleName: "",
    lastName: "Петров",
    status: "Active",
    dismissedOn: null,
    birthDate: null,
    phone: "",
    contactPhone: "",
    uniformSize: 50,
    uniformHeight: 180,
    uniformIssued: false,
    uniformIssuedOn: null,
    uniformCondition: null,
    uniformNote: null,
    position: "Guard",
    licenseType: "Licensed",
    licenseGrade: 5,
    licenseValidUntil: "2026-01-01",
    employmentType: "Employed",
    employedOn: "2024-01-01",
    medicalCommissionPassedOn: null,
    periodicCheckPassedOn: null,
    personalCardAssignedOn: null,
    isTrainee: false,
    traineeUntil: null,
    hasCar: true,
    traineeExpired: false,
    objectIds: ["obj-1"],
    objectNames: ["Объект 1"],
    weekShiftCount: 0,
    weekHours: 0,
    ...partial,
  };
}

describe("filterGuardsForRegistryTable", () => {
  const guards = [
    row({ id: "1", lastName: "Петров", licenseType: "Licensed", hasCar: true }),
    row({
      id: "2",
      firstName: "Сидор",
      lastName: "Иванов",
      licenseType: "None",
      employmentType: "Unemployed" as const,
      hasCar: false,
      uniformSize: null,
      uniformHeight: null,
      objectIds: [],
      objectNames: [],
    }),
  ];

  it("filters by employed yes", () => {
    const result = filterGuardsForRegistryTable(guards, {
      query: "",
      position: "",
      licenseType: "",
      employed: "yes",
      hasCar: "",
      hasUniform: "",
      objectId: "",
      status: "",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("1");
  });

  it("filters by license and car", () => {
    const result = filterGuardsForRegistryTable(guards, {
      query: "",
      position: "",
      licenseType: "Licensed",
      employed: "",
      hasCar: "yes",
      hasUniform: "",
      objectId: "",
      status: "",
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("1");
  });

  describe("filters by uniform issued", () => {
    const uniformGuards = [
      row({
        id: "1",
        uniformIssued: true,
        uniformIssuedOn: "2026-01-01",
        uniformCondition: "new",
      }),
      row({
        id: "2",
        firstName: "Сидор",
        lastName: "Иванов",
        uniformIssued: false,
        uniformSize: null,
        uniformHeight: null,
      }),
      row({
        id: "3",
        firstName: "Пётр",
        lastName: "Сидоров",
        uniformIssued: false,
        uniformSize: 50,
        uniformHeight: 180,
      }),
    ];

    it("includes only not issued when hasUniform is no", () => {
      const result = filterGuardsForRegistryTable(uniformGuards, {
        query: "",
        position: "",
        licenseType: "",
        employed: "",
        hasCar: "",
        hasUniform: "no",
        objectId: "",
        status: "",
      });
      expect(result.map((g) => g.id)).toEqual(["2", "3"]);
    });

    it("includes only issued when hasUniform is yes", () => {
      const result = filterGuardsForRegistryTable(uniformGuards, {
        query: "",
        position: "",
        licenseType: "",
        employed: "",
        hasCar: "",
        hasUniform: "yes",
        objectId: "",
        status: "",
      });
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("1");
    });

    it("excludes guard with size/height but uniformIssued false when hasUniform is yes", () => {
      const result = filterGuardsForRegistryTable(uniformGuards, {
        query: "",
        position: "",
        licenseType: "",
        employed: "",
        hasCar: "",
        hasUniform: "yes",
        objectId: "",
        status: "",
      });
      expect(result.some((g) => g.id === "3")).toBe(false);
    });
  });
});
