"use client";

import { useEffect, useMemo, useState } from "react";
import { FileImage, FileSpreadsheet, Send, Download } from "lucide-react";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { toast } from "../../store/toast-store";
import { getDaysInMonth } from "../../lib/format/display-date";
import type { Shift } from "../../lib/scheduling/types";
import {
  buildDefaultMonthExportPeriods,
  createCustomExportPeriodFromIso,
  formatExportPeriodLabel,
  type ScheduleExportPeriod,
} from "../../lib/scheduling/schedule-export-periods";
import { prepareScheduleExportTable } from "../../lib/scheduling/schedule-export-prepare";
import { renderScheduleExportJpg } from "../../lib/scheduling/schedule-export-jpg";
import {
  deliverExportFile,
  getMaxDeliveryToastMessage,
} from "../../lib/scheduling/schedule-export-share";
import type { ScheduleGridGuardRow } from "./object-month-schedule-grid";

export type ScheduleExportFormat = "jpg" | "xlsx";

type ScheduleExportDialogProps = {
  open: boolean;
  format: ScheduleExportFormat;
  objectId: string;
  objectName: string;
  viewYear: number;
  viewMonth0: number;
  monthLabel: string;
  guardsForGrid: ScheduleGridGuardRow[];
  monthShifts: Shift[];
  operationalDayStartTime: string;
  onClose: () => void;
};

function slugifyFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function toDateInputValue(year: number, monthIndex0: number, day: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function ScheduleExportDialog({
  open,
  format,
  objectId,
  objectName,
  viewYear,
  viewMonth0,
  monthLabel,
  guardsForGrid,
  monthShifts,
  operationalDayStartTime,
  onClose,
}: ScheduleExportDialogProps) {
  const defaultPeriods = useMemo(
    () => buildDefaultMonthExportPeriods(viewYear, viewMonth0),
    [viewYear, viewMonth0],
  );
  const monthEndDay = getDaysInMonth(viewYear, viewMonth0);
  const defaultStartDate = toDateInputValue(viewYear, viewMonth0, 1);
  const defaultEndDate = toDateInputValue(viewYear, viewMonth0, monthEndDay);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(defaultPeriods.map((p) => p.id)));
  const [customStartDate, setCustomStartDate] = useState(defaultStartDate);
  const [customEndDate, setCustomEndDate] = useState(defaultEndDate);
  const [customPeriods, setCustomPeriods] = useState<ScheduleExportPeriod[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(defaultPeriods.map((p) => p.id)));
    setCustomStartDate(defaultStartDate);
    setCustomEndDate(defaultEndDate);
    setCustomPeriods([]);
  }, [open, defaultPeriods, defaultStartDate, defaultEndDate]);

  if (!open) return null;

  const allPresetPeriods = defaultPeriods;
  const selectedPeriods: ScheduleExportPeriod[] = [
    ...allPresetPeriods.filter((p) => selectedIds.has(p.id)),
    ...customPeriods,
  ];

  function togglePeriod(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function addCustomPeriod() {
    if (!customStartDate || !customEndDate) {
      toast({ title: "Укажите даты", message: "Выберите начало и конец периода", variant: "error" });
      return;
    }
    if (customStartDate > customEndDate) {
      toast({ title: "Некорректный период", message: "Дата начала не может быть позже даты конца", variant: "error" });
      return;
    }
    const period = createCustomExportPeriodFromIso(customStartDate, customEndDate);
    setCustomPeriods((prev) => {
      if (prev.some((p) => p.id === period.id)) return prev;
      return [...prev, period];
    });
    setSelectedIds((prev) => new Set(prev).add(period.id));
  }

  function removeCustomPeriod(id: string) {
    setCustomPeriods((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  async function runExport(mode: "download" | "max") {
    if (!selectedPeriods.length) {
      toast({ title: "Выберите период", message: "Отметьте хотя бы один период", variant: "warning" });
      return;
    }

    setBusy(true);
    try {
      const table = await prepareScheduleExportTable({
        objectId,
        objectName,
        year: viewYear,
        monthIndex0: viewMonth0,
        periods: selectedPeriods,
        guards: guardsForGrid.map((g) => ({ guardId: g.guardId, displayName: g.displayName })),
        monthShifts,
        operationalDayStartTime,
      });

      const periodSlug = selectedPeriods.map((p) => p.id).join("_");
      const baseName = `grafik-${slugifyFilename(objectName)}-${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}-${periodSlug}`;

      let maxDeliveryMessage: string | undefined;

      if (format === "jpg") {
        const blob = renderScheduleExportJpg(table);
        const result = await deliverExportFile(blob, `${baseName}.jpg`, table.title, mode);
        if (result) maxDeliveryMessage = getMaxDeliveryToastMessage(result);
      } else {
        const { buildScheduleExportWorkbook } = await import("../../lib/scheduling/schedule-export-xlsx");
        const buffer = await buildScheduleExportWorkbook(table);
        const blob = new Blob([new Uint8Array(buffer)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        });
        const result = await deliverExportFile(blob, `${baseName}.xlsx`, table.title, mode);
        if (result) maxDeliveryMessage = getMaxDeliveryToastMessage(result);
      }

      toast({
        title: mode === "download" ? "Файл сформирован" : "Отправка в MAX",
        message: mode === "download" ? "Скачивание началось" : (maxDeliveryMessage ?? "Откройте MAX"),
        variant: "success",
      });
      onClose();
    } catch (err) {
      toast({
        title: "Ошибка экспорта",
        message: err instanceof Error ? err.message : "Не удалось сформировать файл",
        variant: "error",
        durationMs: 6500,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="schedule-export-title"
      onClick={() => !busy && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-card border border-app-border bg-app-surface p-5 shadow-glow"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {format === "jpg" ? (
            <FileImage className="size-5 text-accent-primary" aria-hidden />
          ) : (
            <FileSpreadsheet className="size-5 text-accent-primary" aria-hidden />
          )}
          <h2 id="schedule-export-title" className="text-lg font-semibold">
            Экспорт {format === "jpg" ? "JPG" : "Excel"} — {monthLabel}
          </h2>
        </div>
        <p className="mt-2 text-sm text-app-muted">
          Недели пн–вс. Можно выбрать несколько или задать свой диапазон дат (в т.ч. через границу месяца).
        </p>

        <div className="mt-4 grid gap-2">
          {allPresetPeriods.map((period) => (
            <label
              key={period.id}
              className="flex cursor-pointer items-center gap-3 rounded-button border border-app-border bg-app-elevated/50 px-3 py-2.5 text-sm hover:border-accent-primary/40"
            >
              <Checkbox
                checked={selectedIds.has(period.id)}
                onCheckedChange={() => togglePeriod(period.id)}
                disabled={busy}
              />
              <span>{formatExportPeriodLabel(period, viewYear, viewMonth0)}</span>
            </label>
          ))}
        </div>

        {customPeriods.length > 0 ? (
          <div className="mt-3 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-app-muted">Свои периоды</p>
            {customPeriods.map((period) => (
              <div
                key={period.id}
                className="flex items-center justify-between gap-2 rounded-button border border-app-border bg-app-elevated/40 px-3 py-2 text-sm"
              >
                <span>{formatExportPeriodLabel(period, viewYear, viewMonth0)}</span>
                <button
                  type="button"
                  className="text-xs text-accent-danger hover:underline"
                  onClick={() => removeCustomPeriod(period.id)}
                  disabled={busy}
                >
                  убрать
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-4 rounded-button border border-dashed border-app-border p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-app-muted">Свой период</p>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="h-9 rounded-button border border-app-border bg-app-bg px-2 text-sm"
              disabled={busy}
            />
            <span className="text-center text-app-muted">—</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="h-9 rounded-button border border-app-border bg-app-bg px-2 text-sm"
              disabled={busy}
            />
            <Button type="button" variant="secondary" size="sm" onClick={addCustomPeriod} disabled={busy}>
              Добавить
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={() => void runExport("download")} disabled={busy}>
            <Download className="size-4" />
            Скачать
          </Button>
          <Button
            type="button"
            className="border-accent-secondary bg-accent-secondary text-white hover:opacity-90"
            onClick={() => void runExport("max")}
            disabled={busy}
          >
            <Send className="size-4" />
            Отправить в MAX
          </Button>
        </div>
        <Button type="button" variant="ghost" className="mt-3 w-full" onClick={onClose} disabled={busy}>
          Отмена
        </Button>
      </div>
    </div>
  );
}
