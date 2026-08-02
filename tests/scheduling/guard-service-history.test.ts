import { describe, expect, it } from "vitest";
import { isIncidentCompanionShiftLog } from "../../src/lib/scheduling/guard-service-history";

describe("isIncidentCompanionShiftLog", () => {
  const incidentsByShiftId = new Map([
    ["s1", { category: "FullNoShow" as const }],
  ]);

  it("ломает дубль авто-лога инцидента", () => {
    expect(
      isIncidentCompanionShiftLog({
        shiftId: "s1",
        note: "Полный невыход: Осознанный невыход. Поставил перед фактом 29.07.",
        incidentsByShiftId,
      }),
    ).toBe(true);
    expect(
      isIncidentCompanionShiftLog({
        shiftId: "s1",
        note: "Полный невыход",
        incidentsByShiftId,
      }),
    ).toBe(true);
  });

  it("не трогает обычные записи журнала", () => {
    expect(
      isIncidentCompanionShiftLog({
        shiftId: "s1",
        note: "Позвонил диспетчеру, ждём замену",
        incidentsByShiftId,
      }),
    ).toBe(false);
    expect(
      isIncidentCompanionShiftLog({
        shiftId: "other",
        note: "Полный невыход: что-то",
        incidentsByShiftId,
      }),
    ).toBe(false);
  });
});
