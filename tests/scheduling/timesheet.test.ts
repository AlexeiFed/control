import { describe, expect, it } from "vitest";
import { buildTimesheetRows, exportTimesheetCsv } from "../../src/lib/scheduling/timesheet";
import { createSchedulerGuard, createSchedulerShift } from "../../src/lib/scheduling/types";

const guards = [createSchedulerGuard({ id: "g1", name: "Ivan", status: "Active" })];
const objects = [{ id: "o1", name: "Office", address: "CBD", status: "Active" as const, operationalDayStartTime: "08:00" }];
const shifts = [
  createSchedulerShift({
    id: "s1",
    guardId: "g1",
    objectId: "o1",
    startsAt: new Date("2026-05-01T20:00:00+10:00"),
    endsAt: new Date("2026-05-02T08:00:00+10:00"),
  }),
];

describe("timesheet", () => {
  it("empty shifts yield no rows (no demo fallback at build layer)", () => {
    expect(
      buildTimesheetRows({
        guards,
        objects,
        shifts: [],
        holidayDates: new Set(),
      }),
    ).toEqual([]);
  });

  it("builds payroll rows using calculated hours", () => {
    expect(
      buildTimesheetRows({
        guards,
        objects,
        shifts,
        holidayDates: new Set(["2026-05-02"]),
      }),
    ).toEqual([
      expect.objectContaining({
        guardName: "Ivan",
        objectName: "Office",
        totalHours: 12,
        nightHours: 12,
        holidayHours: 8,
        incidentsCount: 0,
        attendanceIncident: null,
        incidentLogLines: [],
        regularHours: 4,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours: 0,
        isNoShow: false,
        clientAmountCents: 0,
        guardAmountCents: 0,
        marginCents: 0,
        unpriced: true,
      }),
    ]);
  });

  it("no-show: нулевые отработанные часы, не отработано = длина смены", () => {
    const noShowShift = createSchedulerShift({
      id: "ns1",
      guardId: "g1",
      objectId: "o1",
      startsAt: new Date("2026-05-01T08:00:00+10:00"),
      endsAt: new Date("2026-05-01T20:00:00+10:00"),
    });
    expect(
      buildTimesheetRows({
        guards,
        objects,
        shifts: [{ ...noShowShift, isNoShow: true }],
        holidayDates: new Set(),
      }),
    ).toEqual([
      expect.objectContaining({
        guardName: "Ivan",
        totalHours: 0,
        nightHours: 0,
        holidayHours: 0,
        regularHours: 0,
        reinforcementHours: 0,
        unworkedHours: 12,
        isNoShow: true,
        incidentsCount: 1,
        attendanceIncident: expect.objectContaining({
          description: "Невыход",
          unworkedHours: 12,
        }),
        incidentLogLines: [],
      }),
    ]);
  });

  it("считает инцидент посещаемости только для полного невыхода и частичной отработки", () => {
    const fullNoShow = createSchedulerShift({
      id: "ns1",
      guardId: "g1",
      objectId: "o1",
      startsAt: new Date("2026-05-12T08:00:00+10:00"),
      endsAt: new Date("2026-05-12T20:00:00+10:00"),
    });
    const partial = createSchedulerShift({
      id: "p1",
      guardId: "g1",
      objectId: "o1",
      startsAt: new Date("2026-05-13T08:00:00+10:00"),
      endsAt: new Date("2026-05-13T20:00:00+10:00"),
    });
    const rows = buildTimesheetRows({
      guards,
      objects,
      shifts: [
        {
          ...fullNoShow,
          isNoShow: true,
          incidentCategory: "FullNoShow",
          incidentComment: "по семейным",
          incidentRecordedAt: new Date("2026-05-12T13:22:00+10:00"),
        },
        {
          ...partial,
          isNoShow: true,
          incidentCategory: "LeftWork",
          incidentComment: "",
          incidentWorkedUntilAt: new Date("2026-05-13T15:00:00+10:00"),
          incidentRecordedAt: new Date("2026-05-13T16:48:00+10:00"),
        },
      ],
      holidayDates: new Set(),
    });

    expect(rows[0]?.incidentsCount).toBe(1);
    expect(rows[0]?.attendanceIncident).toEqual(
      expect.objectContaining({
        recordedAt: fullNoShow.startsAt.toISOString(),
        description: "Полный невыход: по семейным",
        unworkedHours: 12,
      }),
    );
    expect(rows[1]?.attendanceIncident).toEqual(
      expect.objectContaining({
        description: "Ушёл с работы",
        unworkedHours: 5,
      }),
    );
    expect(rows[1]?.totalHours).toBe(7);
    expect(rows[1]?.regularHours).toBe(7);
    expect(rows[1]?.reinforcementHours).toBe(0);
  });

  it("невыход без формальной категории попадает в инциденты по дате смены", () => {
    const noShowShift = createSchedulerShift({
      id: "ns2",
      guardId: "g1",
      objectId: "o1",
      startsAt: new Date("2026-05-16T08:00:00+10:00"),
      endsAt: new Date("2026-05-16T20:00:00+10:00"),
    });
    const rows = buildTimesheetRows({
      guards,
      objects,
      shifts: [{ ...noShowShift, isNoShow: true }],
      holidayDates: new Set(),
    });
    expect(rows[0]?.incidentsCount).toBe(1);
    expect(rows[0]?.attendanceIncident).toEqual({
      recordedAt: noShowShift.startsAt.toISOString(),
      description: "Невыход",
      unworkedHours: 12,
    });
  });

  it("exports CSV for payroll", () => {
    const csv = exportTimesheetCsv([
      {
        guardName: "Ivan",
        objectName: "Office",
        startsAt: "2026-05-01T10:00:00.000Z",
        endsAt: "2026-05-01T22:00:00.000Z",
        totalHours: 12,
        nightHours: 12,
        holidayHours: 8,
        incidentsCount: 2,
        attendanceIncident: null,
        regularHours: 12,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours: 0,
        isNoShow: false,
        clientAmountCents: 60000,
        guardAmountCents: 30000,
        marginCents: 30000,
        unpriced: false,
        incidentLogLines: [],
      },
    ]);

    expect(csv).toContain(
      "охранник,объект,начало смены,конец смены,всего часов,не отработано ч,обычных ч (усил),усиление ч,ночных часов,праздничных часов,инциденты,клиент коп,сотрудник коп,маржа коп,нет ставки",
    );
    expect(csv).toContain(
      "Ivan,Office,2026-05-01T10:00:00.000Z,2026-05-01T22:00:00.000Z,12,0,12,0,12,8,2,60000,30000,30000,нет",
    );
  });
});
