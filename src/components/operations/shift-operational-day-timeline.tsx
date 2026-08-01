"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";
import {
  DEFAULT_OPERATIONAL_DAY_START_TIME,
  OPERATIONAL_CYCLE_MINUTES,
  TIMELINE_SNAP_MINUTES,
  buildOperationalTimelineTicks,
  clipIntervalToOperationalCycle,
  durationHoursLabel,
  durationMinutesFromOffsets,
  formatOperationalDayNightLabels,
  formatOffsetHm,
  formatOffsetLabel,
  hmPairToOffsets,
  normalizeOperationalAnchorTime,
  offsetsToHmPair,
  snapOffset,
  type OperationalTimelineSegment,
} from "../../lib/scheduling/operational-day-timeline";

export type ShiftOperationalDayTimelineProps = {
  shiftDateIso: string;
  operationalDayStartTime?: string;
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  occupiedIntervals?: ReadonlyArray<{ startsAt: Date; endsAt: Date }>;
  disabled?: boolean;
  /** Контент справа от подписи длительности (например, тип смены). */
  headerTrailing?: ReactNode;
};

type ActiveThumb = "start" | "end" | null;

type OffsetPair = { startOffset: number; endOffset: number };

const DAY_END_OFFSET = 12 * 60;
const MIN_GAP = TIMELINE_SNAP_MINUTES;

function pct(offset: number): string {
  return `${(offset / OPERATIONAL_CYCLE_MINUTES) * 100}%`;
}

export function ShiftOperationalDayTimeline({
  shiftDateIso,
  operationalDayStartTime = DEFAULT_OPERATIONAL_DAY_START_TIME,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  occupiedIntervals = [],
  disabled = false,
  headerTrailing,
}: ShiftOperationalDayTimelineProps) {
  const anchorTime = normalizeOperationalAnchorTime(operationalDayStartTime);
  const ticks = useMemo(() => buildOperationalTimelineTicks(anchorTime), [anchorTime]);
  const dayNightLabels = useMemo(() => formatOperationalDayNightLabels(anchorTime), [anchorTime]);
  const trackRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<OffsetPair>({ startOffset: 0, endOffset: MIN_GAP });
  const activeThumbRef = useRef<ActiveThumb>(null);
  const [activeThumb, setActiveThumb] = useState<ActiveThumb>(null);
  const [displayOffsets, setDisplayOffsets] = useState<OffsetPair>({ startOffset: 0, endOffset: MIN_GAP });
  const labelId = useId();

  const committedOffsets = useMemo(
    () => hmPairToOffsets(shiftDateIso, startTime, endTime, anchorTime),
    [shiftDateIso, startTime, endTime, anchorTime],
  );

  const isDragging = activeThumb !== null;
  const offsets = isDragging ? displayOffsets : committedOffsets;

  useEffect(() => {
    if (isDragging) return;
    draftRef.current = committedOffsets;
    setDisplayOffsets(committedOffsets);
  }, [committedOffsets, isDragging]);

  const occupiedSegments = useMemo((): OperationalTimelineSegment[] => {
    const out: OperationalTimelineSegment[] = [];
    for (const interval of occupiedIntervals) {
      const clipped = clipIntervalToOperationalCycle(shiftDateIso, interval.startsAt, interval.endsAt, anchorTime);
      if (clipped) out.push(clipped);
    }
    return out;
  }, [occupiedIntervals, shiftDateIso, anchorTime]);

  const durationMinutes = durationMinutesFromOffsets(offsets.startOffset, offsets.endOffset);

  const commitOffsets = useCallback(
    (startOffset: number, endOffset: number) => {
      const pair = offsetsToHmPair(shiftDateIso, startOffset, endOffset, anchorTime);
      onStartTimeChange(pair.startTime);
      onEndTimeChange(pair.endTime);
    },
    [shiftDateIso, anchorTime, onStartTimeChange, onEndTimeChange],
  );

  const commitHmPair = useCallback(
    (nextStartTime: string, nextEndTime: string) => {
      if (!nextStartTime || !nextEndTime) return;
      const next = hmPairToOffsets(shiftDateIso, nextStartTime, nextEndTime, anchorTime);
      commitOffsets(next.startOffset, next.endOffset);
    },
    [shiftDateIso, anchorTime, commitOffsets],
  );

  const startHm = formatOffsetHm(offsets.startOffset, anchorTime);
  const endHm = formatOffsetHm(offsets.endOffset, anchorTime);
  const startLabel = formatOffsetLabel(offsets.startOffset, shiftDateIso, anchorTime);
  const endLabel = formatOffsetLabel(offsets.endOffset, shiftDateIso, anchorTime);
  const startIsNextCalendarDay = startLabel.includes("+1");
  const endIsNextCalendarDay = endLabel.includes("+1");

  const offsetFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return snapOffset(ratio * OPERATIONAL_CYCLE_MINUTES);
  }, []);

  const applyThumbOffset = useCallback((thumb: ActiveThumb, rawOffset: number) => {
    if (!thumb) return;
    const current = draftRef.current;
    const next: OffsetPair =
      thumb === "start"
        ? {
            startOffset: snapOffset(Math.min(rawOffset, current.endOffset - MIN_GAP)),
            endOffset: current.endOffset,
          }
        : {
            startOffset: current.startOffset,
            endOffset: snapOffset(Math.max(rawOffset, current.startOffset + MIN_GAP)),
          };
    draftRef.current = next;
    setDisplayOffsets(next);
  }, []);

  const finishDrag = useCallback(() => {
    const thumb = activeThumbRef.current;
    if (!thumb) return;
    activeThumbRef.current = null;
    setActiveThumb(null);
    commitOffsets(draftRef.current.startOffset, draftRef.current.endOffset);
  }, [commitOffsets]);

  useEffect(() => {
    activeThumbRef.current = activeThumb;
  }, [activeThumb]);

  useEffect(() => {
    if (!activeThumb || disabled) return;

    function onMove(e: PointerEvent) {
      applyThumbOffset(activeThumbRef.current, offsetFromClientX(e.clientX));
    }
    function onUp() {
      finishDrag();
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [activeThumb, applyThumbOffset, disabled, finishDrag, offsetFromClientX]);

  function handleTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const target = e.target as HTMLElement;
    if (target.dataset.thumb) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const offset = offsetFromClientX(e.clientX);
    const distStart = Math.abs(offset - offsets.startOffset);
    const distEnd = Math.abs(offset - offsets.endOffset);
    const thumb: ActiveThumb = distStart <= distEnd ? "start" : "end";
    applyThumbOffset(thumb, offset);
    setActiveThumb(thumb);
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">
          Период смены
        </span>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums"
            style={{
              color: designTokens.color.accent.primary,
              backgroundColor: `${designTokens.color.accent.primary}14`,
              border: `1px solid ${designTokens.color.accent.primary}33`,
            }}
          >
            {durationHoursLabel(durationMinutes)}
          </span>
          {headerTrailing}
        </div>
      </div>

      <div
        className="rounded-card border p-4"
        style={{
          borderColor: designTokens.color.border,
          background: `linear-gradient(180deg, ${designTokens.color.surface} 0%, ${designTokens.color.surfaceElevated} 100%)`,
          boxShadow: designTokens.shadow.glow,
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-app-muted">
          <span className="inline-flex items-center gap-1">
            <Sun className="size-3" style={{ color: designTokens.color.shift.dayFrom }} />
            {dayNightLabels.dayLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <Moon className="size-3" style={{ color: designTokens.color.shift.nightFrom }} />
            {dayNightLabels.nightLabel}
          </span>
        </div>

        <div
          ref={trackRef}
          role="group"
          aria-labelledby={labelId}
          className={`relative h-14 select-none rounded-button touch-none ${disabled ? "opacity-50" : "cursor-pointer"}`}
          onPointerDown={handleTrackPointerDown}
        >
          <div
            className="absolute inset-x-0 top-1/2 h-10 -translate-y-1/2 overflow-hidden rounded-full border"
            style={{ borderColor: designTokens.color.border }}
          >
            <div
              className="absolute inset-y-0 left-0"
              style={{
                width: pct(DAY_END_OFFSET),
                background: `linear-gradient(90deg, ${designTokens.color.shift.dayFrom}30, ${designTokens.color.shift.dayTo}22)`,
              }}
            />
            <div
              className="absolute inset-y-0"
              style={{
                left: pct(DAY_END_OFFSET),
                right: 0,
                background: `linear-gradient(90deg, ${designTokens.color.shift.nightFrom}28, ${designTokens.color.shift.nightTo}22)`,
              }}
            />

            {occupiedSegments.map((seg, i) => (
              <div
                key={`occ-${i}`}
                className="absolute inset-y-1 rounded-sm"
                style={{
                  left: pct(seg.startOffset),
                  width: pct(seg.endOffset - seg.startOffset),
                  backgroundColor: `${designTokens.color.accent.danger}55`,
                  borderInline: `1px solid ${designTokens.color.accent.danger}88`,
                }}
                title="Занято другой сменой"
              />
            ))}

            <div
              className="absolute inset-y-1 rounded-full will-change-[left,width]"
              style={{
                left: pct(offsets.startOffset),
                width: pct(offsets.endOffset - offsets.startOffset),
                background: `linear-gradient(90deg, ${designTokens.color.accent.primary}dd, ${designTokens.color.accent.secondary}cc)`,
                boxShadow: `0 0 0 1px ${designTokens.color.accent.primary}55, 0 8px 20px ${designTokens.color.accent.primary}33`,
                transition: isDragging ? "none" : "left 120ms ease, width 120ms ease",
              }}
            />
          </div>

          {ticks.map((tick) => (
            <div
              key={tick.offset}
              className="pointer-events-none absolute top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2"
              style={{ left: pct(tick.offset) }}
            >
              <div
                className="h-10 w-px"
                style={{ backgroundColor: `${designTokens.color.textMuted}44` }}
              />
              <span className="absolute left-1/2 top-full mt-1 -translate-x-1/2 text-[9px] tabular-nums text-app-muted">
                {tick.label}
                {tick.offset === OPERATIONAL_CYCLE_MINUTES ? "⁺¹" : ""}
              </span>
            </div>
          ))}

          {(["start", "end"] as const).map((thumb) => {
            const offset = thumb === "start" ? offsets.startOffset : offsets.endOffset;
            const isActive = activeThumb === thumb;
            return (
              <button
                key={thumb}
                type="button"
                data-thumb={thumb}
                disabled={disabled}
                aria-label={thumb === "start" ? "Начало смены" : "Конец смены"}
                className={`absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:cursor-not-allowed will-change-[left,transform] ${
                  isActive ? "scale-110" : "scale-100"
                } ${isDragging ? "" : "transition-[left,transform] duration-100"}`}
                style={{
                  left: pct(offset),
                  width: "1.15rem",
                  height: "1.15rem",
                  borderColor: designTokens.color.accent.primary,
                  boxShadow: isActive
                    ? `0 0 0 4px ${designTokens.color.accent.primary}22, 0 6px 16px rgb(15 23 42 / 0.18)`
                    : `0 4px 12px rgb(15 23 42 / 0.14)`,
                }}
                onPointerDown={(e) => {
                  if (disabled) return;
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  draftRef.current = isDragging ? displayOffsets : committedOffsets;
                  setActiveThumb(thumb);
                }}
              />
            );
          })}
        </div>

        <p id={labelId} className="sr-only">
          Выбор периода смены на операционных сутках с {anchorTime} до {anchorTime} следующего дня
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <label
            className="rounded-button border px-3 py-2"
            style={{
              borderColor: `${designTokens.color.accent.primary}44`,
              backgroundColor: `${designTokens.color.accent.primary}08`,
            }}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Начало</span>
              {startIsNextCalendarDay ? (
                <span className="text-[10px] font-semibold tabular-nums text-app-muted">+1</span>
              ) : null}
            </span>
            <input
              type="time"
              name="startTime"
              step={TIMELINE_SNAP_MINUTES * 60}
              value={startHm}
              disabled={disabled || isDragging}
              aria-label="Начало смены, ввод вручную"
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                commitHmPair(value, endHm);
              }}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-lg font-semibold tabular-nums text-app-text outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-70 [color-scheme:light]"
            />
          </label>
          <label
            className="rounded-button border px-3 py-2"
            style={{
              borderColor: `${designTokens.color.accent.secondary}44`,
              backgroundColor: `${designTokens.color.accent.secondary}08`,
            }}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Конец</span>
              {endIsNextCalendarDay ? (
                <span className="text-[10px] font-semibold tabular-nums text-app-muted">+1</span>
              ) : null}
            </span>
            <input
              type="time"
              name="endTime"
              step={TIMELINE_SNAP_MINUTES * 60}
              value={endHm}
              disabled={disabled || isDragging}
              aria-label="Конец смены, ввод вручную"
              onChange={(e) => {
                const value = e.target.value;
                if (!value) return;
                commitHmPair(startHm, value);
              }}
              className="mt-0.5 w-full border-0 bg-transparent p-0 text-lg font-semibold tabular-nums text-app-text outline-none focus:ring-0 disabled:cursor-not-allowed disabled:opacity-70 [color-scheme:light]"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
