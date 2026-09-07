import { describe, expect, it } from "vitest";
import {
  guardComplianceFieldsSchema,
  parseOptionalDocumentNumber,
} from "../../src/lib/guards/guard-compliance-schema";

describe("optional document numbers", () => {
  it("trims empty values to null", () => {
    expect(parseOptionalDocumentNumber("")).toBeNull();
    expect(parseOptionalDocumentNumber("  ")).toBeNull();
    expect(parseOptionalDocumentNumber(" У-10421 ")).toBe("У-10421");
  });

  it("parses license and personal card numbers in compliance schema", () => {
    const parsed = guardComplianceFieldsSchema.parse({
      medicalCommissionPassedOn: "",
      periodicCheckPassedOn: "",
      personalCardAssignedOn: "",
      employedOn: "",
      licenseGrade: "",
      licenseValidUntil: "",
      licenseNumber: "  1234567  ",
      personalCardNumber: "ЛК-9",
    });
    expect(parsed.licenseNumber).toBe("1234567");
    expect(parsed.personalCardNumber).toBe("ЛК-9");
  });
});
