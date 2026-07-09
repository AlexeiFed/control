import ExcelJS from "exceljs";
import { getDaysInMonth } from "../format/display-date";
import { designTokens } from "../design-tokens";
import { halfPeriodShortRu } from "../payroll/advance-period";
import type { PayrollTuData, PayrollTuPeriod, PayrollTuRow } from "./payroll-tu";
import {
  collectPayrollTuDaySegments,
  isPayrollTuEmploymentNoteLabel,
  isPayrollTuSickNoteLabel,
  isPayrollTuVacationNoteLabel,
  slicePayrollTuDataForPeriod,
} from "./payroll-tu";

const TABLE_BORDER = { style: "thin" as const };

type WorkbookLayout = {
  dayFrom: number;
  dayTo: number;
  showFirstHalfSalary: boolean;
  showSecondHalfSalary: boolean;
};

export async function buildPayrollTuWorkbook(
  data: PayrollTuData,
  period: PayrollTuPeriod = "month",
): Promise<Buffer> {
  const sliced = slicePayrollTuDataForPeriod(data, period);
  const layout = layoutForPeriod(period, sliced.year, sliced.monthIndex0);
  const visibleDays = layout.dayTo - layout.dayFrom + 1;

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Зарплата ТУ");

  const dayStartCol = 2;
  const countCol = dayStartCol + visibleDays;
  let nextCol = countCol + 1;
  const firstHalfCol = layout.showFirstHalfSalary ? nextCol++ : -1;
  const secondHalfCol = layout.showSecondHalfSalary ? nextCol++ : -1;
  const totalHoursCol = nextCol;
  const lastCol = totalHoursCol;

  ws.columns = [
    { width: 28 },
    ...Array.from({ length: visibleDays }, () => ({ width: 4 })),
    { width: 11 },
    ...(layout.showFirstHalfSalary ? [{ width: 11 }] : []),
    ...(layout.showSecondHalfSalary ? [{ width: 11 }] : []),
    { width: 12 },
  ];

  const lastColLetter = colLetter(lastCol);
  ws.mergeCells(`A1:${lastColLetter}1`);
  const title = ws.getCell("A1");
  title.value = "ЗАРПЛАТА ТУ";
  title.font = { bold: true, size: 14 };
  title.alignment = { horizontal: "center", vertical: "middle" };

  ws.mergeCells(`A2:${lastColLetter}2`);
  const monthTitle = ws.getCell("A2");
  monthTitle.value = monthNameUpperRu(sliced.year, sliced.monthIndex0);
  monthTitle.font = { bold: true, size: 12 };
  monthTitle.alignment = { horizontal: "center", vertical: "middle" };

  const headerRowIndex = 4;
  const header = ws.getRow(headerRowIndex);
  setHeaderCell(header, 1, "ФИО");
  for (let day = layout.dayFrom; day <= layout.dayTo; day++) {
    setHeaderCell(header, dayStartCol + (day - layout.dayFrom), day);
  }
  setHeaderCell(header, countCol, "Количество");
  if (firstHalfCol > 0) {
    setHeaderCell(header, firstHalfCol, halfPeriodShortRu("first", sliced.year, sliced.monthIndex0));
  }
  if (secondHalfCol > 0) {
    setHeaderCell(header, secondHalfCol, halfPeriodShortRu("second", sliced.year, sliced.monthIndex0));
  }
  setHeaderCell(header, totalHoursCol, "Итого часов");
  header.height = 22;

  const sectionCols = {
    dayStartCol,
    dayFrom: layout.dayFrom,
    dayTo: layout.dayTo,
    countCol,
    firstHalfCol,
    secondHalfCol,
    totalHoursCol,
  };

  let rowIndex = headerRowIndex + 1;
  rowIndex = writeSection(ws, rowIndex, "Офис", sliced.officeRows, sectionCols);
  rowIndex = writeSection(ws, rowIndex, "Охранники", sliced.guardRows, sectionCols);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function layoutForPeriod(period: PayrollTuPeriod, year: number, monthIndex0: number): WorkbookLayout {
  const daysInMonth = getDaysInMonth(year, monthIndex0);
  if (period === "first") {
    return { dayFrom: 1, dayTo: 15, showFirstHalfSalary: true, showSecondHalfSalary: false };
  }
  if (period === "second") {
    return { dayFrom: 16, dayTo: daysInMonth, showFirstHalfSalary: false, showSecondHalfSalary: true };
  }
  return { dayFrom: 1, dayTo: daysInMonth, showFirstHalfSalary: true, showSecondHalfSalary: true };
}

function writeSection(
  ws: ExcelJS.Worksheet,
  rowIndex: number,
  sectionLabel: string,
  rows: PayrollTuRow[],
  cols: {
    dayStartCol: number;
    dayFrom: number;
    dayTo: number;
    countCol: number;
    firstHalfCol: number;
    secondHalfCol: number;
    totalHoursCol: number;
  },
): number {
  const sectionRow = ws.getRow(rowIndex);
  sectionRow.getCell(1).value = sectionLabel;
  sectionRow.getCell(1).font = { bold: true, size: 11 };
  rowIndex += 1;

  for (const person of rows) {
    const excelRow = ws.getRow(rowIndex);
    excelRow.getCell(1).value = person.name;
    excelRow.getCell(1).font = { size: 10 };
    excelRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };

    const segments = collectPayrollTuDaySegments(person, cols.dayFrom, cols.dayTo);
    for (const segment of segments) {
      if (segment.kind === "hours") {
        const col = cols.dayStartCol + (segment.day - cols.dayFrom);
        const cell = excelRow.getCell(col);
        cell.value = normalizeHoursCellValue(segment.hours);
        cell.font = { size: 10 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        applyTableBorder(cell);
        continue;
      }

      const fromCol = cols.dayStartCol + (segment.fromDay - cols.dayFrom);
      const toCol = cols.dayStartCol + (segment.toDay - cols.dayFrom);
      const mergeSpan = toCol - fromCol + 1;
      if (fromCol < toCol) {
        ws.mergeCells(excelRow.number, fromCol, excelRow.number, toCol);
      }
      const cell = excelRow.getCell(fromCol);
      cell.value = segment.label;
      applyNoteCellStyle(cell, segment.label, mergeSpan);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: noteFillArgb(segment.label) },
      };
      for (let col = fromCol; col <= toCol; col++) {
        applyTableBorder(excelRow.getCell(col));
      }
    }

    for (let day = cols.dayFrom; day <= cols.dayTo; day++) {
      const col = cols.dayStartCol + (day - cols.dayFrom);
      applyTableBorder(excelRow.getCell(col));
    }

    setSummaryCell(excelRow, cols.countCol, person.workDaysCount > 0 ? person.workDaysCount : "");
    if (cols.firstHalfCol > 0) {
      setSummaryCell(
        excelRow,
        cols.firstHalfCol,
        person.salaryFirstHalfRub > 0 ? person.salaryFirstHalfRub : "",
      );
    }
    if (cols.secondHalfCol > 0) {
      setSummaryCell(
        excelRow,
        cols.secondHalfCol,
        person.salarySecondHalfRub > 0 ? person.salarySecondHalfRub : "",
      );
    }
    setSummaryCell(excelRow, cols.totalHoursCol, person.totalHours > 0 ? person.totalHours : "");

    applyTableBorder(excelRow.getCell(1));

    rowIndex += 1;
  }

  return rowIndex;
}

function setSummaryCell(row: ExcelJS.Row, col: number, value: number | ""): void {
  const cell = row.getCell(col);
  cell.value = value;
  cell.font = { size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  applyTableBorder(cell);
}

function setHeaderCell(row: ExcelJS.Row, col: number, value: string | number): void {
  const cell = row.getCell(col);
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

function normalizeHoursCellValue(hours: number): number | "" {
  const rounded = Math.round(hours * 100) / 100;
  return rounded > 0 ? rounded : "";
}

function applyNoteCellStyle(cell: ExcelJS.Cell, label: string, mergeSpan: number): void {
  const employment = isPayrollTuEmploymentNoteLabel(label);
  const narrowEmployment = employment && mergeSpan < 5;
  cell.font = {
    size: narrowEmployment ? 8 : 9,
    italic: true,
    color: { argb: noteTextArgb(label) },
  };
  cell.alignment = {
    horizontal: "center",
    vertical: "middle",
    // В узкой одной ячейке wrapText даёт вертикальные буквы в Excel на Windows.
    wrapText: employment ? mergeSpan < 6 : true,
    shrinkToFit: narrowEmployment,
  };
}

function noteFillArgb(label: string): string {
  if (isPayrollTuSickNoteLabel(label)) return "FFFDE8E8";
  if (isPayrollTuVacationNoteLabel(label)) return "FFFEF3C7";
  return "FFF1F5F9";
}

function noteTextArgb(label: string): string {
  if (isPayrollTuSickNoteLabel(label)) return hexToArgb(designTokens.color.status.sick);
  if (isPayrollTuVacationNoteLabel(label)) return hexToArgb(designTokens.color.status.vacation);
  return hexToArgb(designTokens.color.textMuted);
}

function hexToArgb(hex: string): string {
  const normalized = hex.replace("#", "");
  return `FF${normalized.toUpperCase()}`;
}

function monthNameUpperRu(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 15))
    .toLocaleDateString("ru-RU", { month: "long", year: "numeric", timeZone: "UTC" })
    .toLocaleUpperCase("ru-RU");
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
