"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Info } from "lucide-react";
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
  onDateSelect: (dateIso: string) => void;
};

function shiftStartsAt(shift: GuardShiftHistoryRow): Date {
  const v = shift.startsAt;
  return v instanceof Date ? v : new Date(v as unknown as string);
}

export function GuardShiftCalendarTable({
  history,
  assignedObjects,
  selectedDate,
  onDateSelect,
}: GuardShiftCalendarTableProps) {

  // Инициализируем месяц и год на основе выбранной даты
  const [selectedYear, selectedMonth0] = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDate);
    if (m) {
      return [parseInt(m[1], 10), parseInt(m[2], 10) - 1];
    }
    const nowComp = getKhabarovskComponents(new Date());
    return [nowComp.year, nowComp.month0];
  })();

  const [currentPeriod, setCurrentPeriod] = useState({
    year: selectedYear,
    month0: selectedMonth0,
  });

  const { year, month0 } = currentPeriod;
  const daysInMonth = getDaysInMonth(year, month0);

  // Получаем смены за выбранный месяц
  const monthShifts = history.filter((shift) => {
    const comp = getKhabarovskComponents(shiftStartsAt(shift));
    return comp.year === year && comp.month0 === month0;
  });

  // Собираем все уникальные объекты, на которых были смены в этом месяце,
  // плюс привязанные к охраннику объекты
  const monthObjectMap = new Map<string, string>();
  assignedObjects.forEach((obj) => monthObjectMap.set(obj.id, obj.name));
  monthShifts.forEach((shift) => monthObjectMap.set(shift.objectId, shift.objectName));

  const monthObjects = Array.from(monthObjectMap.entries()).map(([id, name]) => ({
    id,
    name,
  }));

  // Переключение месяцев
  const handlePrevMonth = () => {
    setCurrentPeriod((prev) => {
      let m = prev.month0 - 1;
      let y = prev.year;
      if (m < 0) {
        m = 11;
        y -= 1;
      }
      return { year: y, month0: m };
    });
  };

  const handleNextMonth = () => {
    setCurrentPeriod((prev) => {
      let m = prev.month0 + 1;
      let y = prev.year;
      if (m > 11) {
        m = 0;
        y += 1;
      }
      return { year: y, month0: m };
    });
  };

  // Переключение на сегодняшний месяц
  const handleCurrentMonth = () => {
    const nowComp = getKhabarovskComponents(new Date());
    setCurrentPeriod({ year: nowComp.year, month0: nowComp.month0 });
    
    onDateSelect(toDateIsoKhabarovsk(new Date()));
  };

  // Проверка дня недели на выходной
  const getDayInfo = (day: number) => {
    // 12:00 в Хабаровске для безопасного определения дня недели
    const date = new Date(Date.UTC(year, month0, day, 12 - 10));
    const dayOfWeek = date.getUTCDay(); // 0=Вс, 1=Пн, ...
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const weekdaysRu = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    return {
      weekdayLabel: weekdaysRu[dayOfWeek],
      isWeekend,
    };
  };

  // Обработка клика по дню
  const handleDayClick = (day: number) => {
    const dayStr = String(day).padStart(2, "0");
    const monthStr = String(month0 + 1).padStart(2, "0");
    onDateSelect(`${year}-${monthStr}-${dayStr}`);
  };

  return (
    <div className="rounded-card border border-app-border bg-app-elevated p-3 shadow-glow sm:p-5">
      <div className="mb-3 flex flex-col gap-3 border-b border-app-border pb-3 sm:mb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4 sm:pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="size-5 shrink-0 text-accent-primary" />
          <h2 className="text-base font-bold text-app-text sm:text-lg">Таблица смен по объектам</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handlePrevMonth}
            className="flex size-8 items-center justify-center rounded-button border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-bg"
            title="Предыдущий месяц"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="min-w-[8.5rem] flex-1 text-center text-sm font-semibold capitalize text-app-text sm:min-w-[140px] sm:flex-none">
            {formatMonthYearLongRu(year, month0)}
          </span>
          <button
            onClick={handleNextMonth}
            className="flex size-8 items-center justify-center rounded-button border border-app-border bg-app-surface text-app-text transition-colors hover:bg-app-bg"
            title="Следующий месяц"
          >
            <ChevronRight className="size-4" />
          </button>
          <button
            onClick={handleCurrentMonth}
            className="w-full rounded-button border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-text transition-colors hover:bg-app-bg sm:ml-2 sm:w-auto"
          >
            <span className="sm:hidden">Сегодня</span>
            <span className="hidden sm:inline">Текущий месяц</span>
          </button>
        </div>
      </div>

      <div className="app-h-scroll rounded-button border border-app-border bg-app-surface">
        <table className="w-max min-w-full table-fixed border-collapse text-left text-sm">
          <thead>
            <tr className="h-11 border-b border-app-border bg-app-elevated sm:h-12">
              <th className="schedule-sticky-col z-10 w-28 min-w-[7rem] border-r border-app-border px-2 font-semibold text-[10px] uppercase tracking-wider text-app-muted sm:w-48 sm:min-w-[12rem] sm:px-3 sm:text-xs">
                Объект
              </th>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                const { weekdayLabel, isWeekend } = getDayInfo(day);
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
                    <div className="text-[10px] uppercase text-app-muted font-bold leading-tight">
                      {weekdayLabel}
                    </div>
                    <div
                      className={`text-xs mt-0.5 rounded-full mx-auto flex size-6 items-center justify-center font-bold ${
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
                // Проверяем, назначен ли объект охраннику в профиле
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
                          <span className="text-[9px] text-app-muted font-normal">Внештатно</span>
                        )}
                      </div>
                    </td>
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                      const dayStr = String(day).padStart(2, "0");
                      const monthStr = String(month0 + 1).padStart(2, "0");
                      const dateIso = `${year}-${monthStr}-${dayStr}`;

                      // Находим смены на этот день на этом объекте
                      const dayShiftsForObj = monthShifts.filter((shift) => {
                        const comp = getKhabarovskComponents(shiftStartsAt(shift));
                        return comp.date === day && shift.objectId === obj.id;
                      });

                      const isCurrentSelected = dateIso === selectedDate;

                      if (dayShiftsForObj.length > 0) {
                        // Если смен несколько, отображаем суммарно или берем первую
                        const primaryShift = dayShiftsForObj[0];
                        const totalHours = dayShiftsForObj.reduce((sum, s) => {
                          const h = calculateShiftHours({
                            startsAt: shiftStartsAt(s),
                            endsAt: s.endsAt instanceof Date ? s.endsAt : new Date(s.endsAt as unknown as string),
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

                        // Получаем цвета из дизайн-токенов
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
                            const ends =
                              s.endsAt instanceof Date ? s.endsAt : new Date(s.endsAt as unknown as string);
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
                          <div className="mx-auto size-1.5 rounded-full bg-app-border opacity-40 group-hover:opacity-100" />
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={daysInMonth + 1} className="py-8 text-center text-xs text-app-muted">
                  Нет смен и закрепленных объектов в этом месяце.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Легенда типов смен */}
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
