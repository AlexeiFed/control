import { describe, expect, it } from "vitest";
import { normalizeGuardFilters } from "../../src/lib/operations/guard-filters";

describe("normalizeGuardFilters", () => {
  it("trims supported guard filters and rejects unknown statuses", () => {
    expect(
      normalizeGuardFilters({
        query: " Иван ",
        objectId: " obj-1 ",
        status: "Sick",
      }),
    ).toEqual({
      query: "Иван",
      objectId: "obj-1",
      status: "Sick",
    });

    expect(normalizeGuardFilters({ status: "Unknown" })).toMatchObject({ status: "" });
  });
});
