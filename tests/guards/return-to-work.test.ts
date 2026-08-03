import { describe, expect, it } from "vitest";
import {
  canReturnGuardToWork,
  profileCloseDateBeforeReturn,
  validateReturnToWorkDate,
} from "../../src/lib/guards/return-to-work";

describe("canReturnGuardToWork", () => {
  it("только Dismissed", () => {
    expect(canReturnGuardToWork("Dismissed")).toBe(true);
    expect(canReturnGuardToWork("Active")).toBe(false);
    expect(canReturnGuardToWork("Inactive")).toBe(false);
    expect(canReturnGuardToWork("Sick")).toBe(false);
    expect(canReturnGuardToWork("OnVacation")).toBe(false);
  });
});

describe("validateReturnToWorkDate", () => {
  it("требует ISO-дату", () => {
    expect(validateReturnToWorkDate({ returnedOn: "", dismissedOn: null })).toEqual({
      ok: false,
      error: "Укажите дату возврата",
    });
    expect(validateReturnToWorkDate({ returnedOn: "03.08.2026", dismissedOn: null }).ok).toBe(false);
  });

  it("не раньше увольнения", () => {
    expect(
      validateReturnToWorkDate({ returnedOn: "2026-01-01", dismissedOn: "2026-02-01" }),
    ).toEqual({
      ok: false,
      error: "Дата возврата не может быть раньше даты увольнения",
    });
  });

  it("принимает дату = увольнению и позже", () => {
    expect(validateReturnToWorkDate({ returnedOn: "2026-02-01", dismissedOn: "2026-02-01" })).toEqual({
      ok: true,
    });
    expect(validateReturnToWorkDate({ returnedOn: "2026-03-01", dismissedOn: "2026-02-01" })).toEqual({
      ok: true,
    });
    expect(validateReturnToWorkDate({ returnedOn: "2026-03-01", dismissedOn: null })).toEqual({
      ok: true,
    });
  });
});

describe("profileCloseDateBeforeReturn", () => {
  it("закрывает по дате увольнения, а не по возврату", () => {
    expect(
      profileCloseDateBeforeReturn({
        returnedOn: "2026-07-21",
        dismissedOn: "2026-05-21",
      }),
    ).toBe("2026-05-21");
  });

  it("если увольнения нет — по дате возврата", () => {
    expect(
      profileCloseDateBeforeReturn({
        returnedOn: "2026-07-21",
        dismissedOn: null,
      }),
    ).toBe("2026-07-21");
  });
});
