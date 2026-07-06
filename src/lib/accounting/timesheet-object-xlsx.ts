import ExcelJS from "exceljs";
import { getDaysInMonth, getKhabarovskComponents } from "../format/display-date";
import {
  buildTimesheetApprovalBlocks,
  type TimesheetObjectApprovalSettings,
} from "./timesheet-object-approvals";
import { guardPositionLabels } from "../operations/status-labels";
import type { TimesheetRow } from "../scheduling/timesheet";
import type { GuardEmploymentType, GuardPosition } from "../scheduling/types";

export type TimesheetObjectWorkbookSheet = {
  objectName: string;
  objectAddress: string;
  rows: TimesheetRow[];
  approval: TimesheetObjectApprovalSettings;
};

type GuardDayCell = {
  hours: number;
  kind: "Reinforcement" | "RapidResponse" | "Regular";
};

const FILL_RED = "FFFF0000";
const FILL_YELLOW = "FFFFFF00";
const TABLE_BORDER = { style: "thin" as const };

export const TIMESHEET_WORKBOOK_TITLE = 'ТАБЕЛЬ УЧЕТА РАБОЧЕГО ВРЕМЕНИ ООО"ЧОО ВИТЯЗЬ"';

export async function buildTimesheetObjectWorkbook(
  sheets: TimesheetObjectWorkbookSheet[],
  year: number,
  monthIndex0: number,
  guardPositionByName: Map<string, string> = new Map(),
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const daysInMonth = getDaysInMonth(year, monthIndex0);

  for (const sheet of sheets) {
    const safeName = sheet.objectName.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Объект";
    const ws = workbook.addWorksheet(safeName);

    const totalCols = 3 + daysInMonth + 1;
    ws.columns = [
      { width: 5 }, // №
      { width: 24 }, // ФИО
      { width: 16 }, // должность
      ...Array.from({ length: daysInMonth }, () => ({ width: 4 })),
      { width: 12 }, // часов за месяц
    ];

    const lastColLetter = colLetter(totalCols);
    ws.mergeCells(`A1:${lastColLetter}1`);
    const title = ws.getCell("A1");
    title.value = TIMESHEET_WORKBOOK_TITLE;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center", vertical: "middle" };

    const infoRow = 2;
    const leftEndCol = Math.max(1, Math.floor(totalCols / 3));
    const centerEndCol = Math.max(leftEndCol + 1, Math.floor((2 * totalCols) / 3));

    ws.mergeCells(infoRow, 1, infoRow, leftEndCol);
    const periodCell = ws.getCell(infoRow, 1);
    periodCell.value = formatTimesheetPeriodLabel(year, monthIndex0);
    periodCell.font = { bold: true, size: 10 };
    periodCell.alignment = { horizontal: "left", vertical: "middle" };

    ws.mergeCells(infoRow, leftEndCol + 1, infoRow, centerEndCol);
    const addressCell = ws.getCell(infoRow, leftEndCol + 1);
    addressCell.value = sheet.objectAddress || "—";
    addressCell.font = { size: 10 };
    addressCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

    ws.mergeCells(infoRow, centerEndCol + 1, infoRow, totalCols);
    const objectCell = ws.getCell(infoRow, centerEndCol + 1);
    objectCell.value = sheet.objectName;
    objectCell.font = { size: 10 };
    objectCell.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    ws.getRow(infoRow).height = 24;

    const dayHeaderRow = 4;
    const headerRow = 5;

    const dayStartCol = 4;
    const dayEndCol = dayStartCol + daysInMonth - 1;
    ws.mergeCells(
      `${colLetter(dayStartCol)}${dayHeaderRow}:${colLetter(dayEndCol)}${dayHeaderRow}`,
    );
    const dayHeader = ws.getCell(`${colLetter(dayStartCol)}${dayHeaderRow}`);
    dayHeader.value = "Числа месяца";
    dayHeader.font = { bold: true, size: 10 };
    dayHeader.alignment = { horizontal: "center", vertical: "middle" };

    const head = ws.getRow(headerRow);
    head.height = 24;

    setHeaderCell(ws, headerRow, 1, "№\nп/п");
    setHeaderCell(ws, headerRow, 2, "ИМЯ, ФАМИЛИЯ");
    setHeaderCell(ws, headerRow, 3, "Профессия\nдолжность");

    for (let day = 1; day <= daysInMonth; day++) {
      setHeaderCell(ws, headerRow, dayStartCol + (day - 1), day);
    }
    setHeaderCell(ws, headerRow, dayEndCol + 1, "Часов\nмесяц");

    const byPost = groupTimesheetObjectRowsByPostAndGuard(sheet.rows, year, monthIndex0);
    const posts = Array.from(byPost.values()).sort((a, b) => a.postName.localeCompare(b.postName, "ru-RU"));

    const firstDataRow = headerRow + 1;
    let rowIndex = firstDataRow;

    const dayTotals = new Array<number>(daysInMonth).fill(0);
    let monthTotal = 0;

    for (const post of posts) {
      // Add post header
      const postRow = ws.getRow(rowIndex);
      ws.mergeCells(`A${rowIndex}:${colLetter(totalCols)}${rowIndex}`);
      const postCell = postRow.getCell(1);
      postCell.value = `Пост: ${post.postName}`;
      postCell.font = { bold: true, size: 10 };
      postCell.alignment = { horizontal: "left", vertical: "middle" };
      postCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAEAEA" } };
      
      for (let col = 1; col <= totalCols; col++) {
        applyTableBorder(postRow.getCell(col));
      }
      
      rowIndex++;

      const guards = Array.from(post.guards.keys()).sort((a, b) => a.localeCompare(b, "ru-RU"));

      for (let i = 0; i < guards.length; i++) {
        const guardName = guards[i]!;
        const guard = post.guards.get(guardName)!;
        const excelRow = ws.getRow(rowIndex);
        excelRow.getCell(1).value = i + 1;
        excelRow.getCell(2).value = guardName;
        excelRow.getCell(3).value = guardPositionByName.get(guardName) ?? "охранник";

        let rowTotal = 0;
        for (let d = 1; d <= daysInMonth; d++) {
          const cellInfo = guard.days.get(d);
          if (!cellInfo) continue;
          const c = excelRow.getCell(dayStartCol + (d - 1));
          c.value = normalizeHoursCellValue(cellInfo.hours);
          c.alignment = { horizontal: "center", vertical: "middle" };
          if (cellInfo.kind === "Reinforcement") {
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_RED } };
          } else if (cellInfo.kind === "RapidResponse") {
            c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_YELLOW } };
          }
          rowTotal = round2(rowTotal + cellInfo.hours);
          dayTotals[d - 1] = round2(dayTotals[d - 1]! + cellInfo.hours);
        }

        const totalCell = excelRow.getCell(dayEndCol + 1);
        totalCell.value = normalizeHoursCellValue(rowTotal);
        totalCell.alignment = { horizontal: "center", vertical: "middle" };

        for (let col = 1; col <= dayEndCol + 1; col++) {
          const c = excelRow.getCell(col);
          c.font = { size: 10 };
          c.alignment = c.alignment ?? { horizontal: "left", vertical: "middle" };
          applyTableBorder(c);
        }

        monthTotal = round2(monthTotal + rowTotal);
        rowIndex++;
      }
    }

    const totalsRowIndex = rowIndex + 1;
    const totalsRow = ws.getRow(totalsRowIndex);
    ws.mergeCells(`A${totalsRowIndex}:C${totalsRowIndex}`);
    const totalsLabel = ws.getCell(`A${totalsRowIndex}`);
    totalsLabel.value = "ИТОГО:";
    totalsLabel.font = { bold: true, size: 10 };
    totalsLabel.alignment = { horizontal: "right", vertical: "middle" };
    applyTableBorder(totalsLabel);

    for (let d = 1; d <= daysInMonth; d++) {
      const c = totalsRow.getCell(dayStartCol + (d - 1));
      c.value = normalizeHoursCellValue(dayTotals[d - 1]!);
      c.font = { bold: true, size: 10 };
      c.alignment = { horizontal: "center", vertical: "middle" };
      applyTableBorder(c);
    }

    const totalsMonthCell = totalsRow.getCell(dayEndCol + 1);
    totalsMonthCell.value = normalizeHoursCellValue(monthTotal);
    totalsMonthCell.font = { bold: true, size: 10 };
    totalsMonthCell.alignment = { horizontal: "center", vertical: "middle" };
    applyTableBorder(totalsMonthCell);

    for (let col = 1; col <= dayEndCol + 1; col++) {
      applyTableBorder(totalsRow.getCell(col));
    }

    const legendRowIndex = totalsRowIndex + 2;
    ws.getCell(legendRowIndex, 1).value = "Легенда:";
    ws.getCell(legendRowIndex, 1).font = { bold: true, size: 10 };

    const redCell = ws.getCell(legendRowIndex, dayStartCol);
    redCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_RED } };
    applyTableBorder(redCell);
    ws.getCell(legendRowIndex, dayStartCol + 1).value = "усиление";
    ws.getCell(legendRowIndex, dayStartCol + 1).font = { size: 10 };

    const yellowCell = ws.getCell(legendRowIndex, dayStartCol + 3);
    yellowCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL_YELLOW } };
    applyTableBorder(yellowCell);
    ws.getCell(legendRowIndex, dayStartCol + 4).value = "МП";
    ws.getCell(legendRowIndex, dayStartCol + 4).font = { size: 10 };

    appendTimesheetApprovalBlock(ws, legendRowIndex + 2, totalCols, sheet.approval);
    applyTimesheetWorksheetPageSetup(ws, totalCols);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function normalizeHoursCellValue(hours: number): number | "" {
  const h = round2(hours);
  return h > 0 ? h : "";
}

function formatTimesheetPeriodLabel(year: number, monthIndex0: number): string {
  const monthUpper = monthNameRu(year, monthIndex0).toLocaleUpperCase("ru-RU");
  return `${monthUpper} ${year} г.`;
}

function monthNameRu(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 15)).toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" });
}

export function buildTimesheetGuardPositionLabel(input: {
  position: GuardPosition;
  employmentType: GuardEmploymentType;
  personalCardAssignedOn: string | null | undefined;
}): string {
  const parts = [guardPositionLabels[input.position].toLocaleLowerCase("ru-RU")];
  if (input.personalCardAssignedOn) parts.push("ЛК");
  if (input.employmentType === "Employed") parts.push("ТУ");
  return parts.join(", ");
}

export function groupTimesheetObjectRowsByPostAndGuard(
  rows: TimesheetRow[],
  year: number,
  monthIndex0: number,
): Map<string, { postName: string; guards: Map<string, { days: Map<number, GuardDayCell> }> }> {
  const byPost = new Map<string, { postName: string; guards: Map<string, { days: Map<number, GuardDayCell> }> }>();

  for (const row of rows) {
    const day = dayOfMonthInKhabarovsk(row.startsAt);
    const kh = getKhabarovskComponents(new Date(row.startsAt));
    if (kh.year !== year || kh.month0 !== monthIndex0) continue;
    if (!day || day < 1) continue;

    const kind = row.reinforcementHours > 0 ? "Reinforcement" : row.rapidResponseHours > 0 ? "RapidResponse" : "Regular";
    const hours = round2(row.totalHours);
    if (hours <= 0) continue;

    const postKey = row.postId ?? "none";
    const postName = row.postName || "Без поста";
    const postBucket = byPost.get(postKey) ?? { postName, guards: new Map() };

    const guardName = row.guardName?.trim() || "—";
    const guardBucket = postBucket.guards.get(guardName) ?? { days: new Map<number, GuardDayCell>() };

    const existing = guardBucket.days.get(day);
    if (!existing) {
      guardBucket.days.set(day, { hours, kind });
    } else {
      guardBucket.days.set(day, {
        hours: round2(existing.hours + hours),
        kind: mergeKind(existing.kind, kind),
      });
    }

    postBucket.guards.set(guardName, guardBucket);
    byPost.set(postKey, postBucket);
  }

  return byPost;
}

export function groupTimesheetObjectRowsByGuard(
  rows: TimesheetRow[],
  year: number,
  monthIndex0: number,
): Map<string, { days: Map<number, GuardDayCell> }> {
  const byGuard = new Map<string, { days: Map<number, GuardDayCell> }>();
  for (const row of rows) {
    const day = dayOfMonthInKhabarovsk(row.startsAt);
    const kh = getKhabarovskComponents(new Date(row.startsAt));
    if (kh.year !== year || kh.month0 !== monthIndex0) continue;
    if (!day || day < 1) continue;

    const kind = row.reinforcementHours > 0 ? "Reinforcement" : row.rapidResponseHours > 0 ? "RapidResponse" : "Regular";
    const hours = round2(row.totalHours);
    if (hours <= 0) continue;

    const guardName = row.guardName?.trim() || "—";
    const bucket = byGuard.get(guardName) ?? { days: new Map<number, GuardDayCell>() };

    const existing = bucket.days.get(day);
    if (!existing) {
      bucket.days.set(day, { hours, kind });
    } else {
      bucket.days.set(day, {
        hours: round2(existing.hours + hours),
        kind: mergeKind(existing.kind, kind),
      });
    }

    byGuard.set(guardName, bucket);
  }
  return byGuard;
}

function mergeKind(
  a: GuardDayCell["kind"],
  b: GuardDayCell["kind"],
): GuardDayCell["kind"] {
  if (a === "Reinforcement" || b === "Reinforcement") return "Reinforcement";
  if (a === "RapidResponse" || b === "RapidResponse") return "RapidResponse";
  return "Regular";
}

function dayOfMonthInKhabarovsk(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return getKhabarovskComponents(d).date;
}

function setHeaderCell(ws: ExcelJS.Worksheet, rowIndex: number, colIndex: number, value: string | number): void {
  const cell = ws.getRow(rowIndex).getCell(colIndex);
  cell.value = value;
  cell.font = { bold: true, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  applyTableBorder(cell);
}

function applyTableBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: TABLE_BORDER,
    left: TABLE_BORDER,
    bottom: TABLE_BORDER,
    right: TABLE_BORDER,
  };
}

function appendTimesheetApprovalBlock(
  ws: ExcelJS.Worksheet,
  startRowIndex: number,
  totalCols: number,
  approval: TimesheetObjectApprovalSettings,
): void {
  const leftEndCol = 3;
  const sigStartCol = Math.max(leftEndCol + 1, totalCols - 5);
  let rowIndex = startRowIndex;
  const blocks = buildTimesheetApprovalBlocks(approval);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;

    if (i > 0) {
      rowIndex += 1;
    }

    ws.mergeCells(rowIndex, 1, rowIndex, leftEndCol);
    const headerCell = ws.getCell(rowIndex, 1);
    headerCell.value = block.header;
    headerCell.font = { bold: true, size: 10 };
    headerCell.alignment = { horizontal: "left", vertical: "middle" };

    ws.mergeCells(rowIndex, sigStartCol, rowIndex, totalCols);
    const sigCell = ws.getCell(rowIndex, sigStartCol);
    sigCell.value = block.signature;
    sigCell.font = { size: 10 };
    sigCell.alignment = { horizontal: "right", vertical: "middle" };

    rowIndex += 1;
    ws.mergeCells(rowIndex, 1, rowIndex, leftEndCol);
    const roleCell = ws.getCell(rowIndex, 1);
    roleCell.value = block.role;
    roleCell.font = { size: 10 };
    roleCell.alignment = { horizontal: "left", vertical: "middle" };

    rowIndex += 1;
  }
}

function applyTimesheetWorksheetPageSetup(ws: ExcelJS.Worksheet, totalCols: number): void {
  const lastRow = ws.lastRow?.number ?? 1;
  const lastColLetter = colLetter(totalCols);
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:${lastColLetter}${lastRow}`,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function colLetter(colIndex1: number): string {
  let n = colIndex1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

