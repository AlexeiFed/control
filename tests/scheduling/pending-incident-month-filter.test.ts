import { describe, expect, it } from "vitest";
import {
  currentMonthStartIsoKhabarovsk,
  isShiftDateInCurrentOrFutureMonth,
} from "../../src/lib/scheduling/pending-incident-month-filter";
import { pluralizeRu } from "../../src/lib/format/pluralize-ru";

describe("pending-incident-month-filter", () => {
  it("считает начало месяца по Хабаровску", () => {
    // 2026-07-31 23:30 UTC = 2026-08-01 09:30 +10
    expect(currentMonthStartIsoKhabarovsk(new Date("2026-07-31T23:30:00.000Z"))).toBe("2026-08-01");
  });

  it("скрывает прошлый месяц и оставляет текущий+", () => {
    const now = new Date("2026-08-01T05:00:00.000Z"); // 15:00 Хабаровск 1 авг
    expect(isShiftDateInCurrentOrFutureMonth("2026-07-30", now)).toBe(false);
    expect(isShiftDateInCurrentOrFutureMonth("2026-07-31", now)).toBe(false);
    expect(isShiftDateInCurrentOrFutureMonth("2026-08-01", now)).toBe(true);
    expect(isShiftDateInCurrentOrFutureMonth("2026-09-01", now)).toBe(true);
  });
});

describe("pluralizeRu инцидент", () => {
  it("склоняет корректно", () => {
    expect(pluralizeRu(1, "инцидент", "инцидента", "инцидентов")).toBe("инцидент");
    expect(pluralizeRu(2, "инцидент", "инцидента", "инцидентов")).toBe("инцидента");
    expect(pluralizeRu(4, "инцидент", "инцидента", "инцидентов")).toBe("инцидента");
    expect(pluralizeRu(5, "инцидент", "инцидента", "инцидентов")).toBe("инцидентов");
    expect(pluralizeRu(18, "инцидент", "инцидента", "инцидентов")).toBe("инцидентов");
    expect(pluralizeRu(21, "инцидент", "инцидента", "инцидентов")).toBe("инцидент");
    expect(pluralizeRu(22, "инцидент", "инцидента", "инцидентов")).toBe("инцидента");
    expect(pluralizeRu(11, "инцидент", "инцидента", "инцидентов")).toBe("инцидентов");
  });
});
