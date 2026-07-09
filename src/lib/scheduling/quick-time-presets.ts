import {
  addHoursToHm,
  defaultSutkiShiftInterval,
  normalizeOperationalAnchorTime,
  tailPresetBeforeAnchor,
} from "./operational-day-timeline";

/** Чипы быстрого выбора времени в модалке назначения смены. */
export type QuickTimePreset = {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
};

function shortHm(hm: string): string {
  return hm.slice(0, 2);
}

export function buildQuickTimePresets(anchorTime?: string): ReadonlyArray<QuickTimePreset> {
  const anchor = normalizeOperationalAnchorTime(anchorTime);
  const dayEnd = addHoursToHm(anchor, 12);
  const tail = tailPresetBeforeAnchor(anchor);
  const sutki = defaultSutkiShiftInterval(anchor);
  const nightBeforeAnchor = addHoursToHm(anchor, -1);

  return [
    {
      id: "day",
      label: `День ${shortHm(anchor)}–${shortHm(dayEnd)}`,
      startTime: anchor,
      endTime: dayEnd,
    },
    {
      id: "night",
      label: `Ночь ${shortHm(dayEnd)}–${shortHm(anchor)}`,
      startTime: dayEnd,
      endTime: anchor,
    },
    {
      id: "night-before-anchor",
      label: `Ночь ${shortHm(nightBeforeAnchor)}–${shortHm(anchor)}`,
      startTime: nightBeforeAnchor,
      endTime: anchor,
    },
    {
      id: "sutki",
      label: `Сутки ${shortHm(sutki.startTime)}–${shortHm(sutki.endTime)}`,
      startTime: sutki.startTime,
      endTime: sutki.endTime,
    },
    {
      id: "tail",
      label: `Достаивание ${shortHm(tail.startTime)}–${shortHm(tail.endTime)}`,
      startTime: tail.startTime,
      endTime: tail.endTime,
    },
  ];
}

/** Пресеты для якоря 08:00 — обратная совместимость. */
export const QUICK_TIME_PRESETS = buildQuickTimePresets();
