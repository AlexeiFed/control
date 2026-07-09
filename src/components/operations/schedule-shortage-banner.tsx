"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";
import {
  computeScheduleShortages,
  type WeekDayRef,
} from "../../lib/scheduling/schedule-shortage";
import type { ExpectedShifts } from "../../lib/scheduling/object-shift-templates";
import type { Shift } from "../../lib/scheduling/types";

type Props = {
  objects: ReadonlyArray<{ id: string; name: string }>;
  shifts: ReadonlyArray<Shift>;
  expectedShiftsByObjectDay: Record<string, Record<string, ExpectedShifts>>;
  weekDays: ReadonlyArray<WeekDayRef>;
  weekStartIso: string;
  tableObjectId?: string;
};

function pluralObjects(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "объект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "объекта";
  return "объектов";
}

export function ScheduleShortageBanner({
  objects,
  shifts,
  expectedShiftsByObjectDay,
  weekDays,
  weekStartIso,
  tableObjectId = "",
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const shortages = useMemo(
    () => computeScheduleShortages(objects, shifts, expectedShiftsByObjectDay, weekDays),
    [objects, shifts, expectedShiftsByObjectDay, weekDays],
  );

  if (shortages.length === 0) return null;

  const totalHoursShort = shortages.reduce((s, o) => s + o.totalHoursShort, 0);

  return (
    <div
      className="relative z-20"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      onFocusCapture={() => setExpanded(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setExpanded(false);
      }}
    >
      <div
        role="status"
        aria-live="polite"
        className="flex cursor-default items-center gap-2 rounded-button border px-3 py-2 text-sm transition-shadow"
        style={{
          backgroundColor: "rgba(185, 28, 28, 0.1)",
          borderColor: designTokens.color.accent.danger,
          color: designTokens.color.text,
          boxShadow: expanded ? designTokens.shadow.glow : undefined,
        }}
      >
        <AlertTriangle
          className="size-4 shrink-0"
          style={{ color: designTokens.color.accent.danger }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 leading-snug">
          <span className="font-semibold" style={{ color: designTokens.color.accent.danger }}>
            График не полностью составлен
          </span>
          <span className="text-app-muted">
            {" "}
            — {shortages.length} {pluralObjects(shortages.length)}
            {totalHoursShort > 0 ? (
              <>
                , <span className="tabular-nums font-medium text-app-text">−{totalHoursShort} ч</span> по основным
              </>
            ) : null}
          </span>
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-app-muted transition-transform ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </div>

      <div
        className={`absolute left-0 right-0 top-full z-30 pt-1 transition-all duration-150 ${
          expanded
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-1 opacity-0"
        }`}
      >
        <div
          className="max-h-[min(50vh,20rem)] overflow-y-auto rounded-card border px-3 py-2 text-xs shadow-glow"
          style={{
            backgroundColor: designTokens.color.surface,
            borderColor: designTokens.color.accent.danger,
          }}
        >
          <ul className="list-none space-y-3 p-0">
            {shortages.map((obj) => (
              <li key={obj.objectId}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    href={`/scheduler?week=${weekStartIso}&objectId=${encodeURIComponent(obj.objectId)}`}
                    className="font-semibold text-accent-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {obj.objectName}
                  </Link>
                  {obj.totalHoursShort > 0 ? (
                    <span
                      className="tabular-nums font-semibold"
                      style={{ color: designTokens.color.accent.danger }}
                    >
                      −{obj.totalHoursShort} ч за 2 нед.
                    </span>
                  ) : null}
                </div>
                <ul className="mt-1.5 list-none space-y-1 border-l-2 pl-2.5" style={{ borderColor: `${designTokens.color.accent.danger}44` }}>
                  {obj.days.map((day) => (
                    <li key={day.dateIso} className="leading-snug text-app-text">
                      <span className="font-medium">{day.dayLabel}</span>
                      <span className="text-app-muted">
                        {day.hoursShort > 0 ? (
                          <>
                            {" "}
                            — недобор{" "}
                            <span className="tabular-nums font-semibold" style={{ color: designTokens.color.accent.danger }}>
                              {day.hoursShort} ч
                            </span>
                            <span className="text-app-muted">
                              {" "}
                              (факт {day.regularDayHours}/{day.expectedHoursRegular} ч)
                            </span>
                          </>
                        ) : null}
                        {day.reinforcementShort > 0 ? (
                          <>
                            {day.hoursShort > 0 ? "; " : " — "}
                            усиление −{day.reinforcementShort} ч
                          </>
                        ) : null}
                        {day.rapidResponseShort > 0 ? (
                          <>
                            {day.hoursShort > 0 || day.reinforcementShort > 0 ? "; " : " — "}
                            МП −{day.rapidResponseShort} ч
                          </>
                        ) : null}
                        {day.shiftLeadShort > 0 ? (
                          <>
                            {day.hoursShort > 0 || day.reinforcementShort > 0 || day.rapidResponseShort > 0
                              ? "; "
                              : " — "}
                            СтМ −{day.shiftLeadShort} ч
                          </>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {tableObjectId ? (
            <p className="mt-2 border-t border-app-border pt-2 text-[10px] text-app-muted">
              Показаны объекты по текущему фильтру. Сбросьте фильтр, чтобы увидеть все недоборы.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
