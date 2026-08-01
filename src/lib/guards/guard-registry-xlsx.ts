import ExcelJS from "exceljs";
import {
  buildGuardRegistryExportRows,
  GUARD_REGISTRY_EXPORT_HEADERS,
} from "./guard-registry-export";
import type { GuardListRow } from "../operations/guards-repository";

const TITLE = "Реестр охранников";

/** Ширины синхронизированы с `GUARD_REGISTRY_EXPORT_HEADERS` (28 колонок). */
const COLUMN_WIDTHS = [
  6, // № п/п
  18, // Фамилия
  14, // Имя
  14, // Отчество
  14, // Дата рождения
  16, // Телефон
  16, // Контактный телефон
  16, // Должность
  12, // Удостоверение
  8, // Разряд
  14, // Удостоверение до
  16, // Трудоустройство
  16, // Дата оф. трудоустройства
  14, // Медкомиссия
  16, // Периодическая проверка
  14, // Личная карточка
  8, // Стажёр
  14, // Стажировка до
  8, // Авто
  12, // Размер формы
  8, // Рост
  10, // Форма выдана
  14, // Дата выдачи формы
  12, // Состояние формы
  20, // Примечание к форме
  28, // Объекты
  14, // Статус
  14, // Дата увольнения
] as const;

const OBJECTS_COL_INDEX = GUARD_REGISTRY_EXPORT_HEADERS.indexOf("Объекты");

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

function applyTableBorder(cell: ExcelJS.Cell): void {
  cell.border = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

export async function buildGuardRegistryWorkbook(guards: readonly GuardListRow[]): Promise<Buffer> {
  if (COLUMN_WIDTHS.length !== GUARD_REGISTRY_EXPORT_HEADERS.length) {
    throw new Error(
      `COLUMN_WIDTHS (${COLUMN_WIDTHS.length}) !== headers (${GUARD_REGISTRY_EXPORT_HEADERS.length})`,
    );
  }

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Реестр");

  ws.columns = COLUMN_WIDTHS.map((width) => ({ width }));

  const lastColLetter = excelColumnLetter(GUARD_REGISTRY_EXPORT_HEADERS.length);
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
        cell.alignment = {
          horizontal: "left",
          vertical: "middle",
          wrapText: colIndex === OBJECTS_COL_INDEX,
        };
      }
      applyTableBorder(cell);
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
