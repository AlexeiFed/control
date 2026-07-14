import { describe, expect, it } from "vitest";
import {
  formatUniformConditionLabel,
  formatUniformIssuedTooltip,
  formatUniformSizeDisplay,
  normalizeUniformIssuedFields,
  parseUniformCondition,
  parseUniformSizeFormValue,
  uniformSizeToFormValue,
  type UniformCondition,
} from "./uniform";

describe("uniform size letters and numbers", () => {
  it("parses letter sizes to codes", () => {
    expect(parseUniformSizeFormValue("M")).toBe(3);
    expect(parseUniformSizeFormValue("L")).toBe(4);
  });

  it("parses numeric sizes", () => {
    expect(parseUniformSizeFormValue("50")).toBe(50);
    expect(parseUniformSizeFormValue("70")).toBe(70);
  });

  it("round-trips display", () => {
    expect(uniformSizeToFormValue(3)).toBe("M");
    expect(formatUniformSizeDisplay(3)).toBe("M");
    expect(formatUniformSizeDisplay(52)).toBe("52");
  });
});

describe("uniform issued", () => {
  it("parses condition", () => {
    expect(parseUniformCondition("new")).toBe("new");
    expect(parseUniformCondition("used")).toBe("used");
    expect(parseUniformCondition("")).toBe(null);
    expect(parseUniformCondition("bad")).toBe(null);
  });

  it("labels condition", () => {
    expect(formatUniformConditionLabel("new")).toBe("новое");
    expect(formatUniformConditionLabel("used")).toBe("б/у");
  });

  it("clears fields when not issued", () => {
    expect(
      normalizeUniformIssuedFields({
        issued: false,
        issuedOn: "2026-01-01",
        condition: "new",
        note: "x",
      }),
    ).toEqual({
      uniformIssued: false,
      uniformIssuedOn: null,
      uniformCondition: null,
      uniformNote: null,
    });
  });

  it("requires date and condition when issued", () => {
    expect(() =>
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "",
        condition: "new",
        note: "",
      }),
    ).toThrow(/дат/i);

    expect(() =>
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "2026-01-01",
        condition: null,
        note: "  ",
      }),
    ).toThrow(/состояние/i);
  });

  it("keeps optional note when issued", () => {
    expect(
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "2026-01-01",
        condition: "used" as UniformCondition,
        note: "  порвана  ",
      }),
    ).toEqual({
      uniformIssued: true,
      uniformIssuedOn: "2026-01-01",
      uniformCondition: "used",
      uniformNote: "порвана",
    });

    expect(
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "2026-01-01",
        condition: "new",
        note: "   ",
      }).uniformNote,
    ).toBeNull();
  });

  it("builds tooltip", () => {
    expect(
      formatUniformIssuedTooltip({
        issuedOn: "2026-01-15",
        condition: "new",
        note: null,
      }),
    ).toMatch(/15\.01\.2026/);
    expect(
      formatUniformIssuedTooltip({
        issuedOn: "2026-01-15",
        condition: "new",
        note: null,
      }),
    ).toMatch(/новое/);
  });
});
