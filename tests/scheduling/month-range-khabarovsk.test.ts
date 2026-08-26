import { describe, expect, it } from "vitest";
import { getMonthRangeKhabarovsk } from "../../src/lib/operations/scheduler-repository";

describe("getMonthRangeKhabarovsk", () => {
  it("август 2026: [2026-08-01+10, 2026-09-01+10)", () => {
    expect(getMonthRangeKhabarovsk(2026, 7)).toEqual({
      start: "2026-08-01T00:00:00+10:00",
      end: "2026-09-01T00:00:00+10:00",
    });
  });

  it("декабрь → январь следующего года", () => {
    expect(getMonthRangeKhabarovsk(2026, 11)).toEqual({
      start: "2026-12-01T00:00:00+10:00",
      end: "2027-01-01T00:00:00+10:00",
    });
  });
});
