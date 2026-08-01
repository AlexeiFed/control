import ExcelJS from "exceljs";
import { pickDominantShiftKind, shiftExportFillArgb } from "./schedule-export-shift-style";
import {
  computeScheduleExportRowHeights,
  formatScheduleExportCellText,
  type ScheduleExportTable,
} from "./schedule-export-table";

function applyTableBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function excelColumnLetter(colIndex1: number): string {
  let n = colIndex1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function buildScheduleExportWorkbook(table: ScheduleExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("График смен");

  const colCount = 1 + table.dayColumns.length;
  const lastCol = excelColumnLetter(colCount);

  const [titleLine1, titleLine2 = ""] = table.title.split("\n");
  ws.mergeCells(`A1:${lastCol}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = titleLine1;
  titleCell.font = { bold: true, size: 13 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`A2:${lastCol}2`);
  const subtitleCell = ws.getCell("A2");
  subtitleCell.value = titleLine2;
  subtitleCell.font = { bold: true, size: 12 };
  subtitleCell.alignment = { horizontal: "center", vertical: "middle" };

  const headerRow = ws.getRow(4);
  headerRow.getCell(1).value = "Охранник";
  headerRow.getCell(1).font = { bold: true };
  applyTableBorder(headerRow.getCell(1));

  table.dayColumns.forEach((col, index) => {
    const cell = headerRow.getCell(index + 2);
    cell.value = col.header;
    cell.font = { bold: true };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyTableBorder(cell);
  });

  headerRow.height = 28;

  const rowHeights = computeScheduleExportRowHeights(table);

  table.guards.forEach((guard, rowIndex) => {
    const row = ws.getRow(5 + rowIndex);
    const nameCell = row.getCell(1);
    nameCell.value = guard.displayName;
    applyTableBorder(nameCell);

    table.dayColumns.forEach((col, colIndex) => {
      const entries = table.cells[guard.guardId]?.[col.dateIso] ?? [];
      const cell = row.getCell(colIndex + 2);
      cell.value = formatScheduleExportCellText(entries);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (entries.length > 0) {
        const dominant = pickDominantShiftKind(entries);
        const isNoShow = entries.every((entry) => entry.isNoShow);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: shiftExportFillArgb(dominant, isNoShow && dominant === "Regular") },
        };
      }
      applyTableBorder(cell);
    });
    row.height = rowHeights[rowIndex] ?? 42;
  });

  ws.getColumn(1).width = 28;
  for (let i = 2; i <= table.dayColumns.length + 1; i++) {
    ws.getColumn(i).width = 10;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
