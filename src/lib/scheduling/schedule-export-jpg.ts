import { designTokens } from "../design-tokens";
import { resolveShiftExportColors } from "./schedule-export-shift-style";
import {
  computeScheduleExportRowHeights,
  formatScheduleExportEntryDisplayText,
  type ScheduleExportCellEntry,
  type ScheduleExportTable,
} from "./schedule-export-table";

const PADDING = 24;
const TITLE_HEIGHT = 52;
const HEADER_HEIGHT = 44;
const ROW_HEIGHT = 52; // fallback; per-row heights from computeScheduleExportRowHeights
const NAME_COL_WIDTH = 180;
const DAY_COL_WIDTH = 72;
const FONT = "13px system-ui, -apple-system, Segoe UI, sans-serif";
const FONT_BOLD = "600 13px system-ui, -apple-system, Segoe UI, sans-serif";
const TITLE_FONT = "700 16px system-ui, -apple-system, Segoe UI, sans-serif";

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const part of text.split("\n")) {
    const words = part.split(" ");
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

function drawShiftBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  entry: ScheduleExportCellEntry,
  strokeOuter: boolean,
  displayText?: string,
) {
  const colors = resolveShiftExportColors(entry.shiftKind, entry.isNoShow);

  ctx.fillStyle = colors.fill;
  ctx.fillRect(x, y, width, height);

  ctx.strokeStyle = colors.border;
  ctx.lineWidth = colors.borderWidth;
  const inset = colors.borderWidth / 2;
  ctx.strokeRect(x + inset, y + inset, width - colors.borderWidth, height - colors.borderWidth);

  if (strokeOuter) {
    ctx.strokeStyle = designTokens.color.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  }

  ctx.fillStyle = colors.text;
  ctx.font = FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const text = displayText ?? entry.text;
  const lines = text.split("\n").slice(0, 6);
  const lineHeight = lines.length > 1 ? 14 : 13;
  const blockHeight = lines.length * lineHeight;
  const textTop = y + Math.max(2, (height - blockHeight) / 2);

  for (const [index, line] of lines.entries()) {
    const ty = textTop + index * lineHeight;
    const tcx = x + width / 2;
    ctx.fillText(line, tcx, ty);
    if (entry.isNoShow) {
      const tw = ctx.measureText(line).width;
      ctx.beginPath();
      ctx.strokeStyle = colors.text;
      ctx.lineWidth = 1;
      ctx.moveTo(tcx - tw / 2, ty + 7);
      ctx.lineTo(tcx + tw / 2, ty + 7);
      ctx.stroke();
    }
  }
}

function drawDayCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rowHeight: number,
  entries: ScheduleExportCellEntry[],
) {
  if (entries.length === 0) {
    ctx.fillStyle = designTokens.color.surface;
    ctx.fillRect(x, y, DAY_COL_WIDTH, rowHeight);
    ctx.strokeStyle = designTokens.color.border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, DAY_COL_WIDTH - 1, rowHeight - 1);
    return;
  }

  const multi = entries.length > 1;

  if (!multi) {
    drawShiftBlock(ctx, x, y, DAY_COL_WIDTH, rowHeight, entries[0]!, true);
    return;
  }

  const sliceHeight = rowHeight / entries.length;
  entries.forEach((entry, index) => {
    const subY = y + index * sliceHeight;
    drawShiftBlock(
      ctx,
      x,
      subY,
      DAY_COL_WIDTH,
      sliceHeight,
      entry,
      index === entries.length - 1,
      formatScheduleExportEntryDisplayText(entry, true),
    );
  });
}

export function renderScheduleExportJpg(table: ScheduleExportTable): Blob {
  const rowHeights = computeScheduleExportRowHeights(table);
  const bodyHeight = rowHeights.reduce((sum, h) => sum + h, 0);
  const width = PADDING * 2 + NAME_COL_WIDTH + table.dayColumns.length * DAY_COL_WIDTH;
  const height = PADDING * 2 + TITLE_HEIGHT + HEADER_HEIGHT + bodyHeight + 8;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  const context = ctx;

  ctx.fillStyle = designTokens.color.surface;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = designTokens.color.text;
  ctx.font = TITLE_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const titleLines = table.title.split("\n");
  titleLines.forEach((line, i) => {
    ctx.fillText(line, width / 2, PADDING + i * 20);
  });

  const gridTop = PADDING + TITLE_HEIGHT;
  let x = PADDING;
  let y = gridTop;

  ctx.strokeStyle = designTokens.color.border;
  ctx.lineWidth = 1;

  function strokeCell(cx: number, cy: number, cw: number, ch: number) {
    context.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
  }

  ctx.fillStyle = designTokens.color.surfaceElevated;
  ctx.fillRect(x, y, NAME_COL_WIDTH, HEADER_HEIGHT);
  strokeCell(x, y, NAME_COL_WIDTH, HEADER_HEIGHT);
  ctx.fillStyle = designTokens.color.text;
  ctx.font = FONT_BOLD;
  ctx.textAlign = "left";
  ctx.fillText("Охранник", x + 8, y + 10);
  x += NAME_COL_WIDTH;

  for (const col of table.dayColumns) {
    ctx.fillStyle = designTokens.color.surfaceElevated;
    ctx.fillRect(x, y, DAY_COL_WIDTH, HEADER_HEIGHT);
    strokeCell(x, y, DAY_COL_WIDTH, HEADER_HEIGHT);
    ctx.fillStyle = designTokens.color.text;
    ctx.textAlign = "center";
    col.header.split("\n").forEach((line, lineIndex) => {
      ctx.fillText(line, x + DAY_COL_WIDTH / 2, y + 8 + lineIndex * 16);
    });
    x += DAY_COL_WIDTH;
  }

  y += HEADER_HEIGHT;

  table.guards.forEach((guard, guardIndex) => {
    const rowHeight = rowHeights[guardIndex] ?? ROW_HEIGHT;
    x = PADDING;
    ctx.fillStyle = designTokens.color.surface;
    ctx.fillRect(x, y, NAME_COL_WIDTH, rowHeight);
    strokeCell(x, y, NAME_COL_WIDTH, rowHeight);
    ctx.fillStyle = designTokens.color.text;
    ctx.font = FONT;
    ctx.textAlign = "left";
    const nameLines = wrapText(ctx, guard.displayName, NAME_COL_WIDTH - 12);
    nameLines.slice(0, 2).forEach((line, i) => {
      ctx.fillText(line, x + 8, y + 8 + i * 16);
    });
    x += NAME_COL_WIDTH;

    for (const col of table.dayColumns) {
      const entries = table.cells[guard.guardId]?.[col.dateIso] ?? [];
      drawDayCell(ctx, x, y, rowHeight, entries);
      x += DAY_COL_WIDTH;
    }

    y += rowHeight;
  });

  const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
  const binary = atob(dataUrl.split(",")[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}
