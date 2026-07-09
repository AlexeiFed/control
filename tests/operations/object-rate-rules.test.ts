import { describe, expect, it } from "vitest";
import { formatTimeForUi } from "../../src/lib/operations/object-rate-rules-repository";

describe("formatTimeForUi", () => {
  it("нормализует время из PostgreSQL в HH:mm", () => {
    expect(formatTimeForUi("14:00:00")).toBe("14:00");
    expect(formatTimeForUi("8:30:00")).toBe("08:30");
  });

  it("возвращает null для пустого значения", () => {
    expect(formatTimeForUi(null)).toBeNull();
    expect(formatTimeForUi("")).toBeNull();
  });
});
