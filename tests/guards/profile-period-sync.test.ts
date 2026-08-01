import { describe, expect, it } from "vitest";
import {
  buildEmploymentPeriodSegments,
  buildLicensePeriodSegments,
  resolveInitialProfileFromIso,
} from "../../src/lib/guards/profile-period-sync";

describe("profile-period-sync", () => {
  it("правило «У»: Licensed только с даты ЛК (до даты — Б/У)", () => {
    const segments = buildLicensePeriodSegments({
      initialFrom: "2026-01-01",
      personalCardAssignedOn: "2026-06-19",
    });
    expect(segments).toEqual([
      { effectiveFrom: "2026-01-01", effectiveTo: "2026-06-18", value: "None" },
      { effectiveFrom: "2026-06-19", effectiveTo: null, value: "Licensed" },
    ]);
  });

  it("без даты ЛК → весь профиль Б/У (правило «У» не матчится)", () => {
    const segments = buildLicensePeriodSegments({
      initialFrom: "2026-01-01",
      personalCardAssignedOn: null,
    });
    expect(segments).toEqual([
      { effectiveFrom: "2026-01-01", effectiveTo: null, value: "None" },
    ]);
  });

  it("дата ЛК ≤ initialFrom → Licensed с начала профиля", () => {
    const segments = buildLicensePeriodSegments({
      initialFrom: "2026-06-19",
      personalCardAssignedOn: "2026-06-19",
    });
    expect(segments).toEqual([
      { effectiveFrom: "2026-06-19", effectiveTo: null, value: "Licensed" },
    ]);
  });

  it("строит переход не трудоустроен → трудоустроен с даты оф. труд.", () => {
    const segments = buildEmploymentPeriodSegments({
      initialFrom: "2026-01-01",
      employmentType: "Employed",
      employedOn: "2026-07-01",
    });
    expect(segments).toEqual([
      { effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30", value: "Unemployed" },
      { effectiveFrom: "2026-07-01", effectiveTo: null, value: "Employed" },
    ]);
  });

  it("берёт самую раннюю дату как начало профиля", () => {
    expect(
      resolveInitialProfileFromIso({
        createdAtIso: "2026-03-01T00:00:00Z",
        existingPeriodStarts: ["2026-01-01"],
        personalCardAssignedOn: "2026-06-19",
        employedOn: null,
      }),
    ).toBe("2026-01-01");
  });
});
