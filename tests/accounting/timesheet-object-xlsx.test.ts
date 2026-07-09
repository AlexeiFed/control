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
    await workbook.xlsx.load(buffer as any);
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
    await workbook.xlsx.load(buffer as any);
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

  it("центрирует название поста без префикса и добавляет итог по каждому посту", async () => {
    const buffer = await buildTimesheetObjectWorkbook(
      [
        {
          objectName: "Живописный сад",
          objectAddress: "ул. Бубенина 5",
          rows: [
            baseRow({
              objectName: "Живописный сад",
              guardName: "Волкова Мария",
              postId: "post-1",
              postName: "пост 1",
              startsAt: "2026-06-30T23:00:00.000Z",
              endsAt: "2026-07-01T11:00:00.000Z",
              totalHours: 12,
              regularHours: 12,
            }),
            baseRow({
              objectName: "Живописный сад",
              guardName: "Иванов Сергей",
              postId: "post-1",
              postName: "пост 1",
              startsAt: "2026-06-30T23:00:00.000Z",
              endsAt: "2026-07-01T23:00:00.000Z",
              totalHours: 24,
              regularHours: 24,
            }),
            baseRow({
              objectName: "Живописный сад",
              guardName: "Борисов Андрей",
              postId: "post-2",
              postName: "пост 2",
              startsAt: "2026-06-30T23:00:00.000Z",
              endsAt: "2026-07-01T23:00:00.000Z",
              totalHours: 24,
              regularHours: 24,
            }),
          ],
          approval: {
            directorRole: "Директор",
            directorName: "",
            siteManagerEnabled: false,
          },
        },
      ],
      2026,
      6,
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const ws = workbook.worksheets[0]!;

    const strings: string[] = [];
    ws.eachRow((row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (typeof cell.value === "string") strings.push(cell.value);
      });
    });
    expect(strings).toContain("пост 1");
    expect(strings).toContain("пост 2");
    expect(strings).not.toContain("Пост: пост 1");

    let post1HeaderRow = 0;
    ws.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "пост 1") post1HeaderRow = rowNumber;
    });
    expect(post1HeaderRow).toBeGreaterThan(0);
    expect(ws.getRow(post1HeaderRow).getCell(1).alignment?.horizontal).toBe("center");

    const post1SubtotalRow = post1HeaderRow + 3;
    expect(ws.getRow(post1SubtotalRow).getCell(4).value).toBe(36);
    expect(ws.getRow(post1SubtotalRow).getCell(35).value).toBe(36);

    let post2HeaderRow = 0;
    ws.eachRow((row, rowNumber) => {
      if (row.getCell(1).value === "пост 2") post2HeaderRow = rowNumber;
    });
    const post2SubtotalRow = post2HeaderRow + 2;
    expect(ws.getRow(post2SubtotalRow).getCell(4).value).toBe(24);
    expect(ws.getRow(post2SubtotalRow).getCell(35).value).toBe(24);
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
    await workbook.xlsx.load(buffer as any);
    const pageSetup = workbook.worksheets[0]?.pageSetup;

    expect(pageSetup?.orientation).toBe("landscape");
    expect(pageSetup?.fitToPage).toBe(true);
    expect(pageSetup?.fitToWidth).toBe(1);
    expect(pageSetup?.fitToHeight).toBe(0);
    expect(pageSetup?.printArea).toMatch(/^A1:/);
  });
});
