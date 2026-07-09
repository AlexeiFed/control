"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { CalendarRange, Download, FileSpreadsheet, Loader2, Users, X } from "lucide-react";
import { Button } from "../ui/button";
import type { PayrollTuPeriod } from "../../lib/accounting/payroll-tu";
import { PAYROLL_TU_PERIODS, payrollTuPeriodLabelRu } from "../../lib/accounting/payroll-tu";

type Props = {
  filters: {
    guardId?: string;
    objectId?: string;
    month?: string;
    week?: string;
    q?: string;
  };
};

type PreviewResponse = {
  firstHalfTotalRub: number;
  monthTotalRub: number;
  secondHalfTotalRub: number;
  peopleCount: number;
  error?: string;
};

const PERIOD_HINTS: Record<PayrollTuPeriod, string> = {
  first: "Аванс · 1–15 число",
  second: "Вторая половина месяца",
  month: "Полный табель за месяц",
};

function parseMonthKey(value: string): { year: number; monthIndex0: number } | null {
  if (!/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, monthIndex0: month - 1 };
}

function formatMonthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 15)).toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatRub(value: number): string {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function previewAmountForPeriod(preview: PreviewResponse, period: PayrollTuPeriod): number {
  if (period === "first") return preview.firstHalfTotalRub;
  if (period === "second") return preview.secondHalfTotalRub;
  return preview.monthTotalRub;
}

export function PayrollTuExportButton({ filters }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const monthFromUrl = searchParams.get("month") ?? filters.month ?? "";
  const canExport = !!monthFromUrl && !filters.week;
  const monthContext = parseMonthKey(monthFromUrl);

  async function openDialog() {
    if (!canExport) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const params = new URLSearchParams();
      params.set("month", monthFromUrl);
      const response = await fetch(`/api/accounting/export/payroll-tu/preview?${params.toString()}`);
      const body = (await response.json()) as PreviewResponse;
      if (!response.ok) {
        setError(body.error ?? "Не удалось загрузить данные");
        return;
      }
      setPreview(body);
    } catch {
      setError("Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }

  function download(period: PayrollTuPeriod) {
    if (!monthFromUrl) return;
    const params = new URLSearchParams();
    params.set("month", monthFromUrl);
    params.set("period", period);
    window.location.href = `/api/accounting/export/payroll-tu?${params.toString()}`;
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => void openDialog()}
        disabled={!canExport}
        title={canExport ? undefined : "Выберите месяц (без недели) для выгрузки «Зарплата ТУ»"}
      >
        <FileSpreadsheet className="size-4" />
        Зарплата ТУ
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 p-4 backdrop-blur-[2px] sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payroll-tu-export-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-card border border-app-border bg-app-surface shadow-glow"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="border-b border-app-border bg-gradient-to-br from-accent-primary/[0.08] via-app-surface to-app-surface px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-accent-primary">
                    Бухгалтерия
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-button border border-accent-primary/20 bg-accent-primary/10 text-accent-primary">
                      <FileSpreadsheet className="size-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h2 id="payroll-tu-export-title" className="text-lg font-semibold leading-tight">
                        Зарплата ТУ
                      </h2>
                      {monthContext ? (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-app-muted capitalize">
                          <CalendarRange className="size-3.5 shrink-0" aria-hidden />
                          {formatMonthLabel(monthContext.year, monthContext.monthIndex0)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-button border border-app-border bg-app-surface text-app-muted transition hover:border-accent-primary/30 hover:text-app-text"
                  aria-label="Закрыть"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-3 text-sm text-app-muted">
                Выберите период — сформируем Excel с часами из табеля и начислениями из БД.
              </p>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-app-border bg-app-elevated/60 px-6 py-10 text-sm text-app-muted">
                  <Loader2 className="size-6 animate-spin text-accent-primary" aria-hidden />
                  Считаем суммы за месяц…
                </div>
              ) : error ? (
                <div className="rounded-card border border-accent-danger/30 bg-accent-danger/5 px-4 py-3 text-sm text-accent-danger">
                  {error}
                </div>
              ) : preview && monthContext ? (
                <>
                  <div className="grid gap-2.5">
                    {PAYROLL_TU_PERIODS.map((period) => {
                      const amount = previewAmountForPeriod(preview, period);
                      const isMonth = period === "month";
                      return (
                        <button
                          key={period}
                          type="button"
                          onClick={() => download(period)}
                          className={[
                            "group flex w-full items-center justify-between gap-4 rounded-button border px-4 py-3.5 text-left transition",
                            isMonth
                              ? "border-accent-primary/35 bg-accent-primary/[0.06] hover:border-accent-primary/55 hover:bg-accent-primary/10"
                              : "border-app-border bg-app-elevated/50 hover:border-accent-primary/40 hover:bg-accent-primary/5",
                          ].join(" ")}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-app-text">
                              {payrollTuPeriodLabelRu(period, monthContext.year, monthContext.monthIndex0)}
                            </div>
                            <div className="mt-0.5 text-xs text-app-muted">{PERIOD_HINTS[period]}</div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <div className="text-right">
                              <div
                                className={[
                                  "text-base font-bold tabular-nums",
                                  isMonth ? "text-accent-primary" : "text-app-text",
                                ].join(" ")}
                              >
                                {formatRub(amount)} ₽
                              </div>
                              <div className="text-[10px] uppercase tracking-wide text-app-muted">Excel</div>
                            </div>
                            <span className="inline-flex size-8 items-center justify-center rounded-button border border-app-border bg-app-surface text-app-muted transition group-hover:border-accent-primary/30 group-hover:text-accent-primary">
                              <Download className="size-4" aria-hidden />
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex items-center gap-2 rounded-button border border-app-border bg-app-bg px-3 py-2 text-xs text-app-muted">
                    <Users className="size-3.5 shrink-0 text-accent-primary" aria-hidden />
                    <span>
                      Сотрудников: <span className="font-semibold text-app-text">{preview.peopleCount}</span> — офис и
                      охранники (только ТУ)
                    </span>
                  </div>
                </>
              ) : null}

              <Button type="button" variant="ghost" className="mt-4 w-full" onClick={() => setOpen(false)}>
                Отмена
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
