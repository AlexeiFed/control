import { describe, expect, it } from "vitest";
import {
  formatUniformConditionLabel,
  formatUniformIssuedTooltip,
  formatUniformSizeDisplay,
  formatTshirtIssuedTooltip,
  formatTshirtStatusDisplay,
  normalizeUniformIssuedFields,
  normalizeUniformReturn,
  normalizeTshirtIssuedFields,
  normalizeTshirtReturn,
  parseTshirtIssuedFromForm,
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
      uniformReturnedOn: null,
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
      uniformReturnedOn: null,
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

  it("сдаёт форму: снимает выдачу и фиксирует дату сдачи", () => {
    expect(normalizeUniformReturn({ returnedOn: "2026-08-14" })).toEqual({
      uniformIssued: false,
      uniformIssuedOn: null,
      uniformCondition: null,
      uniformNote: null,
      uniformReturnedOn: "2026-08-14",
    });
  });

  it("требует дату сдачи", () => {
    expect(() => normalizeUniformReturn({ returnedOn: "  " })).toThrow(/дат/i);
  });
});

describe("tshirt issued", () => {
  it("clears fields when not issued", () => {
    expect(
      normalizeTshirtIssuedFields({
        issued: false,
        size: 6,
        issuedOn: "2026-01-01",
      }),
    ).toEqual({
      tshirtIssued: false,
      tshirtSize: null,
      tshirtIssuedOn: null,
      tshirtReturnedOn: null,
    });
  });

  it("requires size and date when issued", () => {
    expect(() =>
      normalizeTshirtIssuedFields({
        issued: true,
        size: null,
        issuedOn: "2026-01-01",
      }),
    ).toThrow(/размер/i);

    expect(() =>
      normalizeTshirtIssuedFields({
        issued: true,
        size: 6,
        issuedOn: "",
      }),
    ).toThrow(/дат/i);
  });

  it("keeps size and date when issued", () => {
    expect(
      normalizeTshirtIssuedFields({
        issued: true,
        size: 58,
        issuedOn: "2026-06-01",
      }),
    ).toEqual({
      tshirtIssued: true,
      tshirtSize: 58,
      tshirtIssuedOn: "2026-06-01",
      tshirtReturnedOn: null,
    });
  });

  it("сдаёт футболку: снимает выдачу и фиксирует дату сдачи", () => {
    expect(normalizeTshirtReturn({ returnedOn: "2026-08-14" })).toEqual({
      tshirtIssued: false,
      tshirtSize: null,
      tshirtIssuedOn: null,
      tshirtReturnedOn: "2026-08-14",
    });
  });

  it("требует дату сдачи футболки", () => {
    expect(() => normalizeTshirtReturn({ returnedOn: "  " })).toThrow(/дат/i);
  });

  it("читает чекбокс футболки независимо от выдачи формы", () => {
    const withTshirt = new FormData();
    withTshirt.set("tshirtIssued", "on");
    expect(parseTshirtIssuedFromForm(withTshirt)).toBe(true);

    const withoutTshirt = new FormData();
    withoutTshirt.set("uniformIssued", "on");
    expect(parseTshirtIssuedFromForm(withoutTshirt)).toBe(false);
  });

  it("строит tooltip выдачи футболки", () => {
    expect(
      formatTshirtIssuedTooltip({
        size: 4,
        issuedOn: "2026-06-01",
      }),
    ).toBe("Размер: L, дата: 01.06.2026");
  });

  it("всегда показывает статус футболки, в том числе без выдачи формы", () => {
    expect(
      formatTshirtStatusDisplay({
        issued: true,
        size: 58,
        issuedOn: "2026-06-01",
        returnedOn: null,
      }),
    ).toBe("58 · 01.06.2026");

    expect(
      formatTshirtStatusDisplay({
        issued: false,
        size: null,
        issuedOn: null,
        returnedOn: "2026-08-14",
      }),
    ).toBe("Нет · сдана 14.08.2026");

    expect(
      formatTshirtStatusDisplay({
        issued: false,
        size: null,
        issuedOn: null,
        returnedOn: null,
      }),
    ).toBe("Нет");
  });
});

describe("uniform issued tooltip", () => {
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
