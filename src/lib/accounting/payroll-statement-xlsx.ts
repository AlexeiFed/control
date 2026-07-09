import ExcelJS from "exceljs";
import type { PayrollHalf } from "../payroll/advance-period";
import {
  buildPayrollStatementSubtitle,
  formatPayrollStatementFooter,
  type PayrollStatementSheet,
} from "./payroll-statement";

const TABLE_HEADERS = [
  "№ п/п",
  "ФИО",
  "Общая сумма з/п",
  "Аванс",
  "Штраф",
  "Итого к выдаче",
  "Подпись (получил лично)",
] as const;

export async function buildPayrollStatementWorkbook(
  sheets: PayrollStatementSheet[],
  year: number,
  monthIndex0: number,
  half: PayrollHalf,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const safeName = sheet.objectName.replace(/[\\/*?:[\]]/g, " ").slice(0, 31) || "Объект";
    const ws = workbook.addWorksheet(safeName);

    ws.columns = [
      { width: 6 },
      { width: 28 },
      { width: 14 },
      { width: 10 },
      { width: 8 },
      { width: 14 },
      { width: 22 },
    ];

    ws.mergeCells("A1:G1");
    const titleCell = ws.getCell("A1");
    titleCell.value = "Ведомость";
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };

    ws.mergeCells("A2:G2");
    const subtitleCell = ws.getCell("A2");
    subtitleCell.value = buildPayrollStatementSubtitle(
      sheet.objectName,
      sheet.objectAddress,
      year,
      monthIndex0,
      half,
    );
    subtitleCell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    subtitleCell.font = { size: 11 };

    const headerRowIndex = 4;
    const headerRow = ws.getRow(headerRowIndex);
    TABLE_HEADERS.forEach((label, index) => {
      const cell = headerRow.getCell(index + 1);
      cell.value = label;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      applyTableBorder(cell);
    });
    headerRow.height = 28;

    sheet.rows.forEach((row, index) => {
      const excelRow = ws.getRow(headerRowIndex + 1 + index);
      const values: Array<string | number | null> = [
        index + 1,
        row.guardName,
        row.totalSalaryRub > 0 ? row.totalSalaryRub : "",
        row.advanceRub > 0 ? row.advanceRub : "",
        row.fineCount > 0 ? row.fineCount : "",
        row.toPayRub != null && row.toPayRub > 0 ? row.toPayRub : "",
        "",
      ];
      values.forEach((value, colIndex) => {
        const cell = excelRow.getCell(colIndex + 1);
        cell.value = value;
        cell.font = { size: 10 };
        if (colIndex === 0 || colIndex === 4) {
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else if (colIndex >= 2 && colIndex <= 5) {
          cell.alignment = { horizontal: "right", vertical: "middle" };
        } else {
          cell.alignment = { horizontal: "left", vertical: "middle" };
        }
        applyTableBorder(cell);
      });
    });

    const footerRowIndex = headerRowIndex + sheet.rows.length + 2;
    ws.mergeCells(`F${footerRowIndex}:G${footerRowIndex}`);
    const footerCell = ws.getCell(`F${footerRowIndex}`);
    footerCell.value = formatPayrollStatementFooter(year, monthIndex0);
    footerCell.alignment = { horizontal: "right", vertical: "middle" };
    footerCell.font = { size: 11 };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function applyTableBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}
