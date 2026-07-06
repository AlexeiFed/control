import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildTimesheetGuardPositionLabel,
  buildTimesheetObjectWorkbook,
  groupTimesheetObjectRowsByPostAndGuard,
  TIMESHEET_WORKBOOK_TITLE,
} from "../../src/lib/accounting/timesheet-object-xlsx";
import type { TimesheetRow } from "../../src/lib/scheduling/timesheet";

describe("buildTimesheetGuardPositionLabel", () => {
  it("добавляет ЛК и ТУ через запятую", () => {
    expect(
      buildTimesheetGuardPositionLabel({
        position: "Guard",
        employmentType: "Employed",
        personalCardAssignedOn: "2026-01-15",
      }),
    ).toBe("охранник, ЛК, ТУ");
    expect(
      buildTimesheetGuardPositionLabel({
        position: "ShiftLead",
        employmentType: "Unemployed",
        personalCardAssignedOn: null,
      }),
    ).toBe("старший смены");
    expect(
      buildTimesheetGuardPositionLabel({
        position: "Curator",
        employmentType: "Unemployed",
        personalCardAssignedOn: "2026-02-01",
      }),
    ).toBe("куратор, ЛК");
  });
});

describe("groupTimesheetObjectRowsByPostAndGuard", () => {
  const baseRow = (overrides: Partial<TimesheetRow>): TimesheetRow => ({
    guardName: "Волков Алексей",
    objectName: "Живописный сад",
    startsAt: "2026-04-30T14:00:00.000Z",
    endsAt: "2026-05-01T14:00:00.000Z",
    totalHours: 24,
    nightHours: 12,
    holidayHours: 0,
    incidentsCount: 0,
    attendanceIncident: null,
    incidentLogLines: [],
    regularHours: 24,
    reinforcementHours: 0,
    rapidResponseHours: 0,
    unworkedHours: 0,
    isNoShow: false,
    clientAmountCents: 0,
    guardAmountCents: 0,
    marginCents: 0,
    unpriced: false,
    ...overrides,
  });

  it("группирует смены по охраннику и дню месяца", () => {
    const grouped = groupTimesheetObjectRowsByPostAndGuard(
      [
        baseRow({}),
        baseRow({
          guardName: "Борисов Игорь",
          startsAt: "2026-05-02T14:00:00.000Z",
          endsAt: "2026-05-03T14:00:00.000Z",
          reinforcementHours: 24,
          regularHours: 0,
        }),
      ],
      2026,
      4,
    );

    expect(grouped.size).toBe(1);
    const postGroup = grouped.get("none")?.guards;
    expect(postGroup?.get("Волков Алексей")?.days.get(1)).toMatchObject({ hours: 24, kind: "Regular" });
    expect(postGroup?.get("Борисов Игорь")?.days.get(3)).toMatchObject({ hours: 24, kind: "Reinforcement" });
  });

  it("пропускает смены без отработанных часов", () => {
    const grouped = groupTimesheetObjectRowsByPostAndGuard(
      [
        baseRow({
          startsAt: "2026-05-04T14:00:00.000Z",
          endsAt: "2026-05-05T14:00:00.000Z",
          totalHours: 0,
          regularHours: 0,
          unworkedHours: 24,
          isNoShow: true,
          incidentsCount: 1,
          attendanceIncident: {
            recordedAt: "2026-05-04T14:00:00.000Z",
            description: "Невыход",
            unworkedHours: 24,
          },
        }),
      ],
      2026,
      4,
    );

    expect(grouped.size).toBe(0);
  });
});

describe("buildTimesheetObjectWorkbook", () => {
  const baseRow = (overrides: Partial<TimesheetRow>): TimesheetRow => ({
    guardName: "Волков Алексей",
    objectName: "Живописный сад",
    startsAt: "2026-04-30T14:00:00.000Z",
    endsAt: "2026-05-01T14:00:00.000Z",
    totalHours: 24,
    nightHours: 12,
    holidayHours: 0,
    incidentsCount: 0,
    attendanceIncident: null,
    incidentLogLines: [],
    regularHours: 24,
    reinforcementHours: 0,
    rapidResponseHours: 0,
    unworkedHours: 0,
    isNoShow: false,
    clientAmountCents: 0,
    guardAmountCents: 0,
    marginCents: 0,
    unpriced: false,
    ...overrides,
  });

  it("добавляет блоки согласования и утверждения под таблицей каждого объекта", async () => {
    const buffer = await buildTimesheetObjectWorkbook(
      [
        {
          objectName: "ООО СЗ ДАУП",
          objectAddress: "ул. Тестовая, 1",
          rows: [baseRow({ objectName: "ООО СЗ ДАУП" })],
          approval: {
            directorRole: 'Директор ООО СЗ "ДАУП"',
            directorName: "М.А.Плотников",
            siteManagerEnabled: false,
          },
        },
        {
          objectName: "ИП СЛОБОДЕНЮК",
          objectAddress: "",
          rows: [baseRow({ objectName: "ИП СЛОБОДЕНЮК", startsAt: "2026-05-02T14:00:00.000Z", endsAt: "2026-05-03T14:00:00.000Z" })],
          approval: {
            directorRole: "Директор",
            directorName: "",
            siteManagerEnabled: true,
          },
        },
      ],
      2026,
      4,
    );

    expect(buffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets).toHaveLength(2);

    function sheetValues(ws: ExcelJS.Worksheet): string[] {
      const values: string[] = [];
      ws.eachRow((row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (typeof cell.value === "string") values.push(cell.value);
        });
      });
      return values;
    }

    const daupValues = sheetValues(workbook.worksheets[0]!);
    expect(daupValues).not.toContain("Начальник участка");
    expect(daupValues).toContain('Директор ООО СЗ "ДАУП"');
    expect(daupValues).toContain("______________/М.А.Плотников/");

    const ipValues = sheetValues(workbook.worksheets[1]!);
    expect(ipValues).toContain("Начальник участка");
    expect(ipValues).toContain("Директор");
    expect(ipValues).toContain("______________/______________/");

    for (const ws of workbook.worksheets) {
      const values = sheetValues(ws);
      expect(values).toContain("СОГЛАСОВАНО");
      expect(values).toContain('Генеральный директор ООО ЧОО "Витязь"');
      expect(values).toContain("__________/В.В.Ильин/");
      expect(values).toContain("УТВЕРЖДАЮ:");
    }
  });

  it("формирует заголовок и строку периода/адреса/объекта", async () => {
    const buffer = await buildTimesheetObjectWorkbook(
      [
        {
          objectName: "ИП СЛОБОДЕНЮК",
          objectAddress: "ул Муравьева-Амурского 3",
          rows: [baseRow({ objectName: "ИП СЛОБОДЕНЮК" })],
          approval: {
            directorRole: "Директор",
            directorName: "",
            siteManagerEnabled: false,
          },
        },
      ],
      2026,
      5,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const ws = workbook.worksheets[0]!;

    expect(ws.getCell("A1").value).toBe(TIMESHEET_WORKBOOK_TITLE);
    expect(String(ws.getCell("A2").value)).toContain("ИЮНЬ 2026");
    expect(ws.getCell("A2").value).not.toContain("ИП СЛОБОДЕНЮК");

    const row2Values: string[] = [];
    ws.getRow(2).eachCell({ includeEmpty: false }, (cell) => {
      if (typeof cell.value === "string") row2Values.push(cell.value);
    });
    expect(row2Values).toContain("ул Муравьева-Амурского 3");
    expect(row2Values).toContain("ИП СЛОБОДЕНЮК");
  });

  it("настраивает альбомную ориентацию и масштаб по ширине страницы", async () => {
    const buffer = await buildTimesheetObjectWorkbook(
      [
        {
          objectName: "ИП СЛОБОДЕНЮК",
          objectAddress: "ул Муравьева-Амурского 3",
          rows: [baseRow({ objectName: "ИП СЛОБОДЕНЮК" })],
          approval: {
            directorRole: "Директор",
            directorName: "",
            siteManagerEnabled: false,
          },
        },
      ],
      2026,
      5,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const pageSetup = workbook.worksheets[0]?.pageSetup;

    expect(pageSetup?.orientation).toBe("landscape");
    expect(pageSetup?.fitToPage).toBe(true);
    expect(pageSetup?.fitToWidth).toBe(1);
    expect(pageSetup?.fitToHeight).toBe(0);
    expect(pageSetup?.printArea).toMatch(/^A1:/);
  });
});
