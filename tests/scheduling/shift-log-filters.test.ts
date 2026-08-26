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
  it("filters by objects, guard name, level and text", () => {
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
      objectNames: ["Живописный сад"],
      guardQuery: "ким",
      level: "Warning",
      textQuery: "опозд",
    });

    expect(result.map((log) => log.id)).toEqual(["log-3"]);
  });

  it("searches guard across objects when guard query is set", () => {
    const logs: ShiftLog[] = [
      baseLog,
      {
        ...baseLog,
        id: "log-pavlyuk",
        objectName: "ООО СЗ СК + и",
        guardName: "Павлюк Виктор",
        note: "Проверка",
      },
    ];
    expect(
      filterShiftLogs(logs, { objectNames: ["ООО СЗ ДАУП"], guardQuery: "павлюк" }).map((l) => l.id),
    ).toEqual(["log-pavlyuk"]);
  });

  it("filters by multiple months of shift date", () => {
    const logs: ShiftLog[] = [
      baseLog,
      {
        ...baseLog,
        id: "log-june",
        createdAt: new Date("2026-07-03T22:11:00+10:00"),
        shiftStartsAt: new Date("2026-06-01T08:00:00+10:00"),
        shiftEndsAt: new Date("2026-06-01T20:00:00+10:00"),
      },
      {
        ...baseLog,
        id: "log-july",
        createdAt: new Date("2026-07-10T10:00:00+10:00"),
        shiftStartsAt: new Date("2026-07-02T08:00:00+10:00"),
        shiftEndsAt: new Date("2026-07-02T20:00:00+10:00"),
      },
    ];
    expect(filterShiftLogs(logs, { monthKeys: ["2026-05"] }).map((l) => l.id)).toEqual(["log-1"]);
    expect(filterShiftLogs(logs, { monthKeys: ["2026-06", "2026-07"] }).map((l) => l.id)).toEqual([
      "log-june",
      "log-july",
    ]);
  });

  it("filters by multiple objects when guard query is empty", () => {
    const logs: ShiftLog[] = [
      baseLog,
      {
        ...baseLog,
        id: "log-2",
        objectName: "Склад Север",
      },
      {
        ...baseLog,
        id: "log-3",
        objectName: "База Юг",
      },
    ];
    expect(
      filterShiftLogs(logs, { objectNames: ["Живописный сад", "База Юг"] }).map((l) => l.id),
    ).toEqual(["log-1", "log-3"]);
  });
});
