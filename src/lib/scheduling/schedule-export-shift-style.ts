import { designTokens } from "../design-tokens";
import type { ShiftKind } from "./types";

export type ScheduleExportShiftColors = {
  fill: string;
  border: string;
  text: string;
  borderWidth: number;
};

/** Цвета ячейки смены — те же токены, что в графике на экране. */
export function resolveShiftExportColors(
  shiftKind: ShiftKind,
  isNoShow: boolean,
): ScheduleExportShiftColors {
  if (isNoShow && shiftKind === "Regular") {
    return {
      fill: designTokens.color.surfaceElevated,
      border: designTokens.color.border,
      text: designTokens.color.text,
      borderWidth: 1,
    };
  }

  if (shiftKind === "Regular") {
    return {
      fill: designTokens.color.shift.regularCellBg,
      border: designTokens.color.border,
      text: designTokens.color.text,
      borderWidth: 1,
    };
  }

  if (shiftKind === "Reinforcement") {
    return {
      fill: designTokens.color.shift.reinforcementCellBg,
      border: designTokens.color.accent.danger,
      text: designTokens.color.shiftKind.Reinforcement.text,
      borderWidth: 2,
    };
  }

  if (shiftKind === "RapidResponse") {
    return {
      fill: designTokens.color.shift.mobilePostCellBg,
      border: designTokens.color.accent.warning,
      text: designTokens.color.shiftKind.RapidResponse.text,
      borderWidth: 2,
    };
  }

  const lead = designTokens.color.shiftKind.ShiftLead;
  return {
    fill: lead.bg,
    border: lead.border,
    text: lead.text,
    borderWidth: 2,
  };
}

const EXPORT_KIND_PRIORITY: Record<ShiftKind, number> = {
  Reinforcement: 4,
  RapidResponse: 3,
  ShiftLead: 2,
  Regular: 1,
};

/** Для Excel: одна заливка на ячейку — берём самый «яркий» тип смены. */
export function pickDominantShiftKind(
  kinds: ReadonlyArray<{ shiftKind: ShiftKind; isNoShow: boolean }>,
): ShiftKind {
  let best: ShiftKind = "Regular";
  let bestScore = 0;
  for (const entry of kinds) {
    const score = EXPORT_KIND_PRIORITY[entry.shiftKind] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = entry.shiftKind;
    }
  }
  return best;
}

/** Excel ARGB из hex/rgba токена (для заливки ячеек). */
export function shiftExportFillArgb(shiftKind: ShiftKind, isNoShow: boolean): string {
  const { fill } = resolveShiftExportColors(shiftKind, isNoShow);
  if (fill.startsWith("rgba(")) {
    const match = fill.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (match) {
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const a = Number(match[4]);
      const base = { r: 255, g: 255, b: 255 };
      const blend = (c: number) => Math.round(base.r * (1 - a) + c * a);
      const rr = blend(r).toString(16).padStart(2, "0");
      const gg = blend(g).toString(16).padStart(2, "0");
      const bb = blend(b).toString(16).padStart(2, "0");
      return `FF${rr}${gg}${bb}`.toUpperCase();
    }
  }
  const hex = fill.replace("#", "");
  return hex.length === 6 ? `FF${hex.toUpperCase()}` : "FFFFFFFF";
}
