import { describe, expect, it } from "vitest";
import { filterShiftLogs } from "../../src/lib/scheduling/shift-log-filters";
import type { ShiftLog } from "../../src/lib/scheduling/types";

const baseLog: ShiftLog = {
  id: "log-1",
  shiftId: "shift-1",
  authorUserId: "user-1",
  authorName: "Админ",
  createdAt: new Date("2026-05-12T10:00:00+10:00"),
  note: "Проверка поста",
  incidentLevel: "Info",
  objectName: "Живописный сад",
  guardName: "Петров Иван",
  shiftStartsAt: new Date("2026-05-12T08:00:00+10:00"),
  shiftEndsAt: new Date("2026-05-12T20:00:00+10:00"),
};

describe("shift log filters", () => {
  it("filters by object, guard name, level and text", () => {
    const logs: ShiftLog[] = [
      baseLog,
      {
        ...baseLog,
        id: "log-2",
        note: "Невыход на работу",
        incidentLevel: "Warning",
        objectName: "Склад Север",
        guardName: "Волкова Мария",
      },
      {
        ...baseLog,
        id: "log-3",
        note: "Опоздание на смену",
        incidentLevel: "Warning",
        objectName: "Живописный сад",
        guardName: "Ким Олег",
      },
    ];

    const result = filterShiftLogs(logs, {
      objectName: "Живописный сад",
      guardQuery: "ким",
      level: "Warning",
      textQuery: "опозд",
    });

    expect(result.map((log) => log.id)).toEqual(["log-3"]);
  });
});
