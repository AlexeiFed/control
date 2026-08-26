"use client";

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Calendar, Info, Loader2 } from "lucide-react";
import type { GuardShiftHistoryRow } from "../../lib/operations/guards-repository";
import { designTokens } from "../../lib/design-tokens";
import {
  getKhabarovskComponents,
  getDaysInMonth,
  formatMonthYearLongRu,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";
import { calculateShiftHours } from "../../lib/scheduling/hour-calculator";
import { shiftKindLabels, incidentCategoryLabels } from "../../lib/operations/status-labels";

type GuardShiftCalendarTableProps = {
  history: GuardShiftHistoryRow[];
  assignedObjects: Array<{ id: string; name: string }>;
  selectedDate: string;
  viewYear: number;
  viewMonth0: number;
  isLoading?: boolean;
  onPeriodChange: (period: { year: number; month0: number }) => void;
  onDateSelect: (dateIso: string) => void;
};

function shiftStartsAt(shift: GuardShiftHistoryRow): Date {
  const v = shift.startsAt;
  return v instanceof Date ? v : new Date(v as unknown as string);
}

function shiftEndsAt(shift: GuardShiftHistoryRow): Date {
  const v = shift.endsAt;
  return v instanceof Date ? v : new Date(v as unknown as string);
}

function cellKey(objectId: string, day: number): string {
  return `${objectId}:${day}`;
}

export function GuardShiftCalendarTable({
  history,
  assignedObjects,
  selectedDate,
  viewYear: year,
  viewMonth0: month0,
  isLoading = false,
  onPeriodChange,
  onDateSelect,
}: GuardShiftCalendarTableProps) {
  const daysInMonth = getDaysInMonth(year, month0);

  const { monthObjects, shiftsByCell } = useMemo(() => {
    const monthObjectMap = new Map<string, string>();
    assignedObjects.forEach((obj) => monthObjectMap.set(obj.id, obj.name));

    const byCell = new Map<string, GuardShiftHistoryRow[]>();
    for (const shift of history) {
      const comp = getKhabarovskComponents(shiftStartsAt(shift));
      if (comp.year !== year || comp.month0 !== month0) continue;
      monthObjectMap.set(shift.objectId, shift.objectName);
      const key = cellKey(shift.objectId, comp.date);
      const list = byCell.get(key);
      if (list) list.push(shift);
      else byCell.set(key, [shift]);
    }

    return {
      monthObjects: Array.from(monthObjectMap.entries()).map(([id, name]) => ({ id, name })),
      shiftsByCell: byCell,
    };
  }, [history, assignedObjects, year, month0]);

  const dayInfos = useMemo(
    () =>
      Array.from({ length: daysInMonth }, (_, i) => {
        const day = i + 1;
        const date = new Date(Date.UTC(year, month0, day, 12 - 10));
        const dayOfWeek = date.getUTCDay();
        const weekdaysRu = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
        return {
          day,
          weekdayLabel: weekdaysRu[dayOfWeek],
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        };
      }),
    [year, month0, daysInMonth],
  );

  const handlePrevMonth = () => {
    if (isLoading) return;
    let m = month0 - 1;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    onPeriodChange({ year: y, month0: m });
  };

  const handleNextMonth = () => {
    if (isLoading) return;
    let m = month0 + 1;
    let y = year;
    if (m > 11) {
      m = 0;
      y += 1;
    }
    onPeriodChange({ year: y, month0: m });
  };

  const handleCurrentMonth = () => {
    if (isLoading) return;
    const nowComp = getKhabarovskComponents(new Date());
    onPeriodChange({ year: nowComp.year, month0: nowComp.month0 });
    onDateSelect(toDateIsoKhabarovsk(new Date()));
  };

  const handleDayClick = (day: number) => {
    const dayStr = String(day).padStart(2, "0");
    const monthStr = String(month0 + 1).padStart(2, "0");
    onDateSelect(`${year}-${monthStr}-${dayStr}`);
  };

  const navBtnClass =
    "flex size-8 items-center justify-center rounded-button border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-bg disabled:cursor-wait disabled:opacity-50";

  return (
    <div className="rounded-card border border-app-border bg-app-elevated p-3 shadow-glow sm:p-5">
      <div className="mb-3 flex flex-col gap-3 border-b border-app-border pb-3 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="size-5 shrink-0 text-accent-primary" />
          <h2 className="text-base font-bold text-app-text sm:text-lg">Таблица смен по объектам</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrevMonth}
            disabled={isLoading}
            className={navBtnClass}
            title="Предыдущий месяц"
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="flex min-w-[8.5rem] flex-1 items-center justify-center gap-1.5 text-center text-sm font-semibold capitalize text-app-text sm:min-w-[140px] sm:flex-none">
            {isLoading ? <Loader2 className="size-3.5 animate-spin text-accent-primary" /> : null}
            {formatMonthYearLongRu(year, month0)}
          </span>
          <button
            type="button"
            onClick={handleNextMonth}
            disabled={isLoading}
            className={navBtnClass}
            title="Следующий месяц"
            aria-label="Следующий месяц"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            type="button"
            onClick={handleCurrentMonth}
            disabled={isLoading}
            className="w-full rounded-button border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-text transition-colors hover:bg-app-bg disabled:cursor-wait disabled:opacity-50 sm:ml-2 sm:w-auto"
          >
            <span className="sm:hidden">Сегодня</span>
            <span className="hidden sm:inline">Текущий месяц</span>
          </button>
        </div>
      </div>

      <div className="relative">
        {isLoading ? (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-button bg-app-surface/70 backdrop-blur-[1px]"
            aria-busy="true"
            aria-live="polite"
          >
            <Loader2 className="size-6 animate-spin text-accent-primary" />
            <span className="text-xs font-semibold text-app-muted">Загрузка смен…</span>
          </div>
        ) : null}

        <div className={`app-h-scroll rounded-button border border-app-border bg-app-surface ${isLoading ? "pointer-events-none opacity-60" : ""}`}>
          <table className="w-max min-w-full table-fixed border-collapse text-left text-sm">
            <thead>
              <tr className="h-11 border-b border-app-border bg-app-elevated sm:h-12">
                <th className="schedule-sticky-col z-10 w-28 min-w-[7rem] border-r border-app-border px-2 text-[10px] font-semibold uppercase tracking-wider text-app-muted sm:w-48 sm:min-w-[12rem] sm:px-3 sm:text-xs">
                  Объект
                </th>
                {dayInfos.map(({ day, weekdayLabel, isWeekend }) => {
                  const dayStr = String(day).padStart(2, "0");
                  const monthStr = String(month0 + 1).padStart(2, "0");
                  const dateIso = `${year}-${monthStr}-${dayStr}`;
                  const isCurrentSelected = dateIso === selectedDate;

                  return (
                    <th
                      key={day}
                      onClick={() => handleDayClick(day)}
                      className={`w-9 min-w-[2.25rem] cursor-pointer select-none border-r border-app-border p-0.5 text-center font-medium transition-colors hover:bg-app-bg sm:w-10 sm:min-w-[2.5rem] sm:p-1 ${
                        isCurrentSelected ? "bg-accent-primary/15" : ""
                      }`}
                    >
                      <div className="text-[10px] font-bold uppercase leading-tight text-app-muted">
                        {weekdayLabel}
                      </div>
                      <div
                        className={`mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full text-xs font-bold ${
                          isCurrentSelected
                            ? "bg-accent-primary text-white"
                            : isWeekend
                              ? "text-accent-danger"
                              : "text-app-text"
                        }`}
                      >
                        {day}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {monthObjects.length > 0 ? (
                monthObjects.map((obj) => {
                  const isAssigned = assignedObjects.some((ao) => ao.id === obj.id);

                  return (
                    <tr key={obj.id} className="h-10 border-b border-app-border hover:bg-app-elevated/40 sm:h-11">
                      <td
                        className="schedule-sticky-col z-10 truncate border-r border-app-border bg-app-surface px-2 text-xs font-medium text-app-text sm:px-3"
                        title={obj.name}
                      >
                        <div className="flex flex-col">
                          <span className="truncate">{obj.name}</span>
                          {!isAssigned && (
                            <span className="text-[9px] font-normal text-app-muted">Внештатно</span>
                          )}
                        </div>
                      </td>
                      {dayInfos.map(({ day }) => {
                        const dayStr = String(day).padStart(2, "0");
                        const monthStr = String(month0 + 1).padStart(2, "0");
                        const dateIso = `${year}-${monthStr}-${dayStr}`;
                        const dayShiftsForObj = shiftsByCell.get(cellKey(obj.id, day)) ?? [];
                        const isCurrentSelected = dateIso === selectedDate;

                        if (dayShiftsForObj.length > 0) {
                          const primaryShift = dayShiftsForObj[0];
                          const totalHours = dayShiftsForObj.reduce((sum, s) => {
                            const h = calculateShiftHours({
                              startsAt: shiftStartsAt(s),
                              endsAt: shiftEndsAt(s),
                            });
                            return sum + h.totalHours;
                          }, 0);

                          const hasIncident = dayShiftsForObj.some(
                            (s) => s.isNoShow || s.incidentRecordedAt != null,
                          );
                          const primaryIncident = dayShiftsForObj.find(
                            (s) => s.isNoShow || s.incidentRecordedAt != null,
                          );
                          const incidentLabel = primaryIncident?.isNoShow
                            ? primaryIncident.incidentCategory
                              ? incidentCategoryLabels[primaryIncident.incidentCategory]
                              : "Невыход"
                            : primaryIncident?.incidentCategory
                              ? incidentCategoryLabels[primaryIncident.incidentCategory]
                              : "Инцидент";

                          const tokenColors = hasIncident
                            ? {
                                bg: "rgba(185, 28, 28, 0.18)",
                                text: designTokens.color.accent.danger,
                                border: designTokens.color.accent.danger,
                              }
                            : designTokens.color.shiftKind[primaryShift.shiftKind] ||
                              designTokens.color.shiftKind.Regular;

                          const tooltipText = dayShiftsForObj
                            .map((s) => {
                              const starts = shiftStartsAt(s);
                              const ends = shiftEndsAt(s);
                              const h = calculateShiftHours({ startsAt: starts, endsAt: ends });
                              const startStr = starts.toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Asia/Vladivostok",
                              });
                              const endStr = ends.toLocaleTimeString("ru-RU", {
                                hour: "2-digit",
                                minute: "2-digit",
                                timeZone: "Asia/Vladivostok",
                              });
                              const incidentPart =
                                s.isNoShow || s.incidentRecordedAt
                                  ? ` · ${
                                      s.incidentCategory
                                        ? incidentCategoryLabels[s.incidentCategory]
                                        : s.isNoShow
                                          ? "Невыход"
                                          : "Инцидент"
                                    }`
                                  : "";
                              return `${shiftKindLabels[s.shiftKind]}: ${startStr} - ${endStr} (${h.totalHours} ч)${incidentPart}`;
                            })
                            .join("\n");

                          return (
                            <td
                              key={day}
                              onClick={() => handleDayClick(day)}
                              className={`cursor-pointer select-none border-r border-app-border p-0.5 text-center transition-all hover:opacity-85 sm:p-1 ${
                                isCurrentSelected ? "bg-accent-primary/10" : ""
                              }`}
                              title={`${obj.name}\n${dateIso}\n${tooltipText}`}
                            >
                              <div
                                className="mx-auto flex min-h-6 flex-col items-center justify-center gap-0.5 rounded-button px-0.5 py-0.5 text-[10px] font-bold shadow-sm transition-transform hover:scale-105 sm:min-h-7 sm:text-[11px]"
                                style={{
                                  backgroundColor: tokenColors.bg,
                                  color: tokenColors.text,
                                  border: `1px solid ${tokenColors.border}`,
                                }}
                              >
                                <span className="leading-none">{totalHours}ч</span>
                                {hasIncident ? (
                                  <span className="text-[7px] font-bold uppercase leading-none tracking-wide sm:text-[8px]">
                                    {incidentLabel === "Полный невыход" ? "Невыход" : incidentLabel}
                                  </span>
                                ) : null}
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td
                            key={day}
                            onClick={() => handleDayClick(day)}
                            className={`cursor-pointer border-r border-app-border p-0.5 text-center transition-colors hover:bg-app-bg sm:p-1 ${
                              isCurrentSelected ? "bg-accent-primary/10" : ""
                            }`}
                            title={`${obj.name}\n${dateIso}\nНет смен`}
                          >
                            <div className="mx-auto size-1.5 rounded-full bg-app-border opacity-40" />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={daysInMonth + 1} className="py-8 text-center text-xs text-app-muted">
                    {isLoading ? "Загрузка…" : "Нет смен и закрепленных объектов в этом месяце."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-app-border/40 pt-3 text-[10px] text-app-muted sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start sm:gap-4 sm:text-xs">
        <div className="flex items-center gap-1.5">
          <Info className="size-3.5 text-app-muted" />
          <span className="font-semibold">Легенда:</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="size-3 rounded border"
            style={{
              backgroundColor: designTokens.color.shiftKind.Regular.bg,
              borderColor: designTokens.color.shiftKind.Regular.border,
            }}
          />
          <span>Обычная смен ({shiftKindLabels.Regular})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="size-3 rounded border"
            style={{
              backgroundColor: designTokens.color.shiftKind.Reinforcement.bg,
              borderColor: designTokens.color.shiftKind.Reinforcement.border,
            }}
          />
          <span>Усиление ({shiftKindLabels.Reinforcement})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="size-3 rounded border"
            style={{
              backgroundColor: designTokens.color.shiftKind.RapidResponse.bg,
              borderColor: designTokens.color.shiftKind.RapidResponse.border,
            }}
          />
          <span>ГБР ({shiftKindLabels.RapidResponse})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div
            className="size-3 rounded border"
            style={{
              backgroundColor: "rgba(185, 28, 28, 0.18)",
              borderColor: designTokens.color.accent.danger,
            }}
          />
          <span>Невыход / инцидент</span>
        </div>
      </div>
    </div>
  );
}
