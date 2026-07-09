import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("global CSS", () => {
  it("does not reset button font weight through the font shorthand", () => {
    const css = readFileSync("src/app/globals.css", "utf8");

    expect(css).not.toContain("font: inherit");
    expect(css).toContain("font-family: inherit");
  });
});
