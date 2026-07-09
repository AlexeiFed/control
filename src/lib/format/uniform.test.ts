import { describe, expect, it } from "vitest";
import {
  formatUniformSizeDisplay,
  parseUniformSizeFormValue,
  uniformSizeToFormValue,
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
