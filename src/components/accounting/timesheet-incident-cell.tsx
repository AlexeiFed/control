"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AttendanceIncidentLine } from "../../lib/scheduling/timesheet";
import { designTokens } from "../../lib/design-tokens";
import { formatDisplayDateLocal } from "../../lib/format/display-date";

type TimesheetIncidentCellProps = {
  count: number;
  lines: ReadonlyArray<AttendanceIncidentLine>;
};

type PopoverCoords = {
  left: number;
  width: number;
  top?: number;
  bottom?: number;
};

function formatUnworkedHours(hours: number): string {
  const rounded = Math.round(hours * 100) / 100;
  return `${rounded} ч`;
}

function measurePopoverCoords(trigger: HTMLElement, lineCount: number): PopoverCoords {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(352, window.innerWidth - 24);
  const left = Math.min(Math.max(12, rect.right - width), window.innerWidth - width - 12);
  const estimatedHeight = Math.min(40 + lineCount * 28, 220);
  const spaceBelow = window.innerHeight - rect.bottom;
  const openAbove = spaceBelow < estimatedHeight + 12 && rect.top > estimatedHeight + 12;

  if (openAbove) {
    return {
      left,
      width,
      bottom: window.innerHeight - rect.top + 6,
    };
  }

  return {
    left,
    width,
    top: rect.bottom + 6,
  };
}

export function TimesheetIncidentCell({ count, lines }: TimesheetIncidentCellProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords | null>(null);
  const closeTimer = useRef<number | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const clearClose = useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 200);
  }, [clearClose]);

  const hasPopover = lines.length > 0;

  const updateCoords = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    setCoords(measurePopoverCoords(trigger, lines.length));
  }, [lines.length]);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    updateCoords();
    window.addEventListener("scroll", updateCoords, true);
    window.addEventListener("resize", updateCoords);
    return () => {
      window.removeEventListener("scroll", updateCoords, true);
      window.removeEventListener("resize", updateCoords);
    };
  }, [open, updateCoords]);

  const popover =
    open && hasPopover && coords && typeof document !== "undefined"
      ? createPortal(
          <div
            className="rounded-card border p-2 text-left text-[11px] font-normal normal-case shadow-glow"
            style={{
              position: "fixed",
              left: coords.left,
              width: coords.width,
              top: coords.top,
              bottom: coords.bottom,
              zIndex: 80,
              backgroundColor: designTokens.color.surfaceElevated,
              borderColor: designTokens.color.border,
              color: designTokens.color.text,
              boxShadow: designTokens.shadow.glow,
            }}
            onMouseEnter={clearClose}
            onMouseLeave={scheduleClose}
          >
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-app-muted">
              Инциденты посещаемости
            </span>
            <ul className="m-0 max-h-48 list-none space-y-1.5 overflow-y-auto p-0">
              {lines.map((line, idx) => {
                const d = new Date(line.recordedAt);
                const when = Number.isNaN(d.getTime()) ? line.recordedAt : formatDisplayDateLocal(d);
                return (
                  <li key={`${line.recordedAt}-${idx}`} className="leading-snug">
                    <span className="text-app-muted">{when}</span>
                    <span className="text-app-text">
                      {" "}
                      — {line.description} (не отработано {formatUnworkedHours(line.unworkedHours)})
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex justify-center tabular-nums ${hasPopover ? "cursor-pointer underline decoration-dotted underline-offset-2 sm:cursor-help sm:no-underline" : ""}`}
        onMouseEnter={() => {
          if (!hasPopover) return;
          clearClose();
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
        onClick={() => {
          if (!hasPopover) return;
          clearClose();
          setOpen((current) => !current);
        }}
      >
        {count}
      </span>
      {popover}
    </>
  );
}
