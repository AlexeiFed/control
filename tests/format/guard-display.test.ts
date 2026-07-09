import { describe, expect, it } from "vitest";
import { formatGuardLastNameOnly, formatGuardSurnameWithInitial } from "../../src/lib/format/guard-display";

describe("guard-display", () => {
  it("formats surname with initial", () => {
    expect(formatGuardSurnameWithInitial("Петров Иван")).toBe("Петров И.");
  });

  it("takes last token as surname only", () => {
    expect(formatGuardLastNameOnly("Иванов Сергей")).toBe("Иванов");
    expect(formatGuardLastNameOnly("Иван")).toBe("Иван");
  });
});
