"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar, Info } from "lucide-react";
import { GuardShiftCalendarTable } from "./guard-shift-calendar-table";
import { designTokens } from "../../lib/design-tokens";
import {
  formatDisplayDateFromIso,
  formatDisplayDateTimeLocal,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";
import type { GuardShiftHistoryRow } from "../../lib/operations/guards-repository";
import { shiftKindLabels } from "../../lib/operations/status-labels";

type GuardScheduleSectionProps = {
  guardId: string;
  history: GuardShiftHistoryRow[];
  assignedObjects: Array<{ id: string; name: string }>;
  initialDate: string;
};

function shiftStartsAt(shift: GuardShiftHistoryRow): Date {
  const v = shift.startsAt;
  return v instanceof Date ? v : new Date(v as unknown as string);
}

function shiftEndsAt(shift: GuardShiftHistoryRow): Date {
  const v = shift.endsAt;
  return v instanceof Date ? v : new Date(v as unknown as string);
}

export function GuardScheduleSection({
  guardId,
  history,
  assignedObjects,
  initialDate,
}: GuardScheduleSectionProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);

  useEffect(() => {
    setSelectedDate(initialDate);
  }, [initialDate]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("date") === selectedDate) return;
    url.searchParams.set("date", selectedDate);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedDate, guardId]);

  const shiftsForDate = useMemo(
    () => history.filter((shift) => toDateIsoKhabarovsk(shiftStartsAt(shift)) === selectedDate),
    [history, selectedDate],
  );

  return (
    <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-3">
      <div className="min-w-0 lg:col-span-2">
        <GuardShiftCalendarTable
          history={history}
          assignedObjects={assignedObjects}
          selectedDate={selectedDate}
          onDateSelect={setSelectedDate}
        />
      </div>
      <div className="lg:col-span-1">
        <article className="flex h-full flex-col justify-between rounded-card border border-app-border bg-app-elevated p-3 shadow-glow sm:p-5">
          <div>
            <h2 className="mb-3 flex items-center gap-2 border-b border-app-border/40 pb-3 text-sm font-bold text-app-text">
              <Calendar className="size-4 text-accent-primary" />
              <span className="min-w-0">Смены за {formatDisplayDateFromIso(selectedDate)}</span>
            </h2>
            <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1 text-sm sm:max-h-[300px] sm:space-y-3">
              {shiftsForDate.length > 0 ? (
                shiftsForDate.map((shift) => (
                  <li
                    key={shift.id}
                    className="rounded-button border border-app-border bg-app-surface px-3.5 py-3 shadow-sm"
                    style={
                      shift.shiftKind === "Reinforcement"
                        ? { borderColor: designTokens.color.accent.danger }
                        : undefined
                    }
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-app-text">{shift.objectName}</span>
                      <span
                        className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={
                          shift.shiftKind === "Reinforcement"
                            ? {
                                backgroundColor: "rgba(185, 28, 28, 0.1)",
                                color: designTokens.color.accent.danger,
                              }
                            : {
                                backgroundColor: "rgba(71, 85, 105, 0.1)",
                                color: designTokens.color.textMuted,
                              }
                        }
                      >
                        {shiftKindLabels[shift.shiftKind]}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-app-muted">
                      {formatDisplayDateTimeLocal(shiftStartsAt(shift))} —{" "}
                      {formatDisplayDateTimeLocal(shiftEndsAt(shift))}
                    </div>
                  </li>
                ))
              ) : (
                <li className="text-app-muted py-4 text-center">В выбранную дату смен нет.</li>
              )}
            </ul>
          </div>
          <div className="mt-3 flex items-center gap-1 border-t border-app-border/30 pt-3 text-[10px] text-app-muted sm:mt-4">
            <Info className="size-3 shrink-0" />
            <span className="sm:hidden">Нажмите на день в таблице выше.</span>
            <span className="hidden sm:inline">Нажмите на любой день в таблице смен слева, чтобы посмотреть лог.</span>
          </div>
        </article>
      </div>
    </div>
  );
}
