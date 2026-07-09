import ExcelJS from "exceljs";
import {
  buildGuardRegistryExportRows,
  GUARD_REGISTRY_EXPORT_HEADERS,
} from "./guard-registry-export";
import type { GuardListRow } from "../operations/guards-repository";

const TITLE = "Реестр охранников";

const COLUMN_WIDTHS = [
  6, 18, 14, 14, 14, 16, 16, 16, 12, 8, 14, 16, 16, 14, 16, 14, 8, 14, 8, 12, 8, 28, 14, 14,
] as const;

function applyTableBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

export async function buildGuardRegistryWorkbook(guards: readonly GuardListRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Реестр");

  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const lastColLetter = String.fromCharCode(64 + GUARD_REGISTRY_EXPORT_HEADERS.length);
  ws.mergeCells(`A1:${lastColLetter}1`);
  const titleCell = ws.getCell("A1");
  titleCell.value = TITLE;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const headerRowIndex = 3;
  const headerRow = ws.getRow(headerRowIndex);
  GUARD_REGISTRY_EXPORT_HEADERS.forEach((label, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    applyTableBorder(cell);
  });
  headerRow.height = 36;

  const rows = buildGuardRegistryExportRows(guards);
  rows.forEach((row, rowIndex) => {
    const excelRow = ws.getRow(headerRowIndex + 1 + rowIndex);
    row.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      cell.value = value === "" ? null : value;
      cell.font = { size: 10 };
      if (colIndex === 0 || colIndex >= row.length - 1) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle", wrapText: colIndex === 21 };
      }
      applyTableBorder(cell);
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
