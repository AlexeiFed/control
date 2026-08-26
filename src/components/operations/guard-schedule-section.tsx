"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Info, Loader2 } from "lucide-react";
import { listGuardMonthShiftsAction } from "../../app/guards/actions";
import { GuardShiftCalendarTable } from "./guard-shift-calendar-table";
import { designTokens } from "../../lib/design-tokens";
import {
  formatDisplayDateFromIso,
  formatDisplayDateTimeLocal,
  getKhabarovskComponents,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";
import type { GuardShiftHistoryRow } from "../../lib/operations/guards-repository";
import type { IncidentCategory, ShiftKind } from "../../lib/scheduling/types";
import { shiftKindLabels, incidentCategoryLabels } from "../../lib/operations/status-labels";

type GuardScheduleSectionProps = {
  guardId: string;
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

function periodFromDateIso(dateIso: string): { year: number; month0: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateIso);
  if (m) return { year: parseInt(m[1], 10), month0: parseInt(m[2], 10) - 1 };
  const now = getKhabarovskComponents(new Date());
  return { year: now.year, month0: now.month0 };
}

export function GuardScheduleSection({
  guardId,
  assignedObjects,
  initialDate,
}: GuardScheduleSectionProps) {
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const initialPeriod = periodFromDateIso(initialDate);
  const [viewPeriod, setViewPeriod] = useState(initialPeriod);
  const [history, setHistory] = useState<GuardShiftHistoryRow[]>([]);
  const [isLoadingMonth, setIsLoadingMonth] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchEpochRef = useRef(0);
  const cacheRef = useRef<Map<string, GuardShiftHistoryRow[]>>(new Map());

  useEffect(() => {
    cacheRef.current.clear();
  }, [guardId]);

  useEffect(() => {
    setSelectedDate(initialDate);
    setViewPeriod(periodFromDateIso(initialDate));
  }, [initialDate]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("date") === selectedDate) return;
    url.searchParams.set("date", selectedDate);
    window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
  }, [selectedDate, guardId]);

  useEffect(() => {
    const cacheKey = `${guardId}:${viewPeriod.year}-${viewPeriod.month0}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setHistory(cached);
      setIsLoadingMonth(false);
      setLoadError(null);
      return;
    }

    const epoch = ++fetchEpochRef.current;
    setIsLoadingMonth(true);
    setLoadError(null);

    void (async () => {
      const result = await listGuardMonthShiftsAction(guardId, viewPeriod.year, viewPeriod.month0);
      if (epoch !== fetchEpochRef.current) return;
      if (!result.ok) {
        setHistory([]);
        setLoadError(result.error);
        setIsLoadingMonth(false);
        return;
      }
      const mapped: GuardShiftHistoryRow[] = result.shifts.map((row) => ({
        id: row.id,
        objectId: row.objectId,
        objectName: row.objectName,
        startsAt: new Date(row.startsAt),
        endsAt: new Date(row.endsAt),
        shiftKind: row.shiftKind as ShiftKind,
        isNoShow: row.isNoShow,
        incidentCategory: (row.incidentCategory as IncidentCategory | null) ?? null,
        incidentRecordedAt: row.incidentRecordedAt ? new Date(row.incidentRecordedAt) : null,
      }));
      cacheRef.current.set(cacheKey, mapped);
      setHistory(mapped);
      setIsLoadingMonth(false);
    })();
  }, [guardId, viewPeriod.year, viewPeriod.month0]);

  const shiftsForDate = useMemo(
    () => history.filter((shift) => toDateIsoKhabarovsk(shiftStartsAt(shift)) === selectedDate),
    [history, selectedDate],
  );

  return (
    <div className="grid items-stretch gap-3 sm:gap-4 lg:grid-cols-3">
      <div className="relative min-w-0 lg:col-span-2">
        <GuardShiftCalendarTable
          history={history}
          assignedObjects={assignedObjects}
          selectedDate={selectedDate}
          viewYear={viewPeriod.year}
          viewMonth0={viewPeriod.month0}
          isLoading={isLoadingMonth}
          onPeriodChange={setViewPeriod}
          onDateSelect={setSelectedDate}
        />
        {loadError ? (
          <p className="mt-2 text-xs font-medium text-accent-danger">{loadError}</p>
        ) : null}
      </div>
      <div className="lg:col-span-1">
        <article className="flex h-full flex-col justify-between rounded-card border border-app-border bg-app-elevated p-3 shadow-glow sm:p-5">
          <div>
            <h2 className="mb-3 flex items-center gap-2 border-b border-app-border/40 pb-3 text-sm font-bold text-app-text">
              <Calendar className="size-4 text-accent-primary" />
              <span className="min-w-0">Смены за {formatDisplayDateFromIso(selectedDate)}</span>
              {isLoadingMonth ? (
                <Loader2 className="ml-auto size-4 shrink-0 animate-spin text-accent-primary" />
              ) : null}
            </h2>
            <ul className="max-h-[240px] space-y-2 overflow-y-auto pr-1 text-sm sm:max-h-[300px] sm:space-y-3">
              {isLoadingMonth ? (
                <li className="py-4 text-center text-app-muted">Загрузка смен…</li>
              ) : shiftsForDate.length > 0 ? (
                shiftsForDate.map((shift) => {
                  const hasIncident = shift.isNoShow || shift.incidentRecordedAt != null;
                  const incidentLabel = shift.incidentCategory
                    ? incidentCategoryLabels[shift.incidentCategory]
                    : shift.isNoShow
                      ? "Невыход"
                      : hasIncident
                        ? "Инцидент"
                        : null;
                  return (
                    <li
                      key={shift.id}
                      className="rounded-button border border-app-border bg-app-surface px-3.5 py-3 shadow-sm"
                      style={
                        hasIncident
                          ? { borderColor: designTokens.color.accent.danger }
                          : shift.shiftKind === "Reinforcement"
                            ? { borderColor: designTokens.color.accent.danger }
                            : undefined
                      }
                    >
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-app-text">{shift.objectName}</span>
                        <span
                          className="rounded-full px-2 py-0.5 text-xs font-bold"
                          style={
                            hasIncident
                              ? {
                                  backgroundColor: "rgba(185, 28, 28, 0.12)",
                                  color: designTokens.color.accent.danger,
                                }
                              : shift.shiftKind === "Reinforcement"
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
                          {hasIncident && incidentLabel ? incidentLabel : shiftKindLabels[shift.shiftKind]}
                        </span>
                      </div>
                      <div className="text-xs font-medium text-app-muted">
                        {formatDisplayDateTimeLocal(shiftStartsAt(shift))} —{" "}
                        {formatDisplayDateTimeLocal(shiftEndsAt(shift))}
                      </div>
                      {hasIncident && !shift.isNoShow && shift.incidentCategory ? (
                        <p
                          className="mt-1 text-[11px] font-semibold"
                          style={{ color: designTokens.color.accent.danger }}
                        >
                          {shiftKindLabels[shift.shiftKind]} · инцидент
                        </p>
                      ) : null}
                    </li>
                  );
                })
              ) : (
                <li className="py-4 text-center text-app-muted">В выбранную дату смен нет.</li>
              )}
            </ul>
          </div>
          <div className="mt-3 flex items-center gap-1 border-t border-app-border/30 pt-3 text-[10px] text-app-muted sm:mt-4">
            <Info className="size-3 shrink-0" />
            <span className="sm:hidden">Нажмите на день в таблице выше.</span>
            <span className="hidden sm:inline">
              Нажмите на любой день в таблице смен слева, чтобы посмотреть лог.
            </span>
          </div>
        </article>
      </div>
    </div>
  );
}
