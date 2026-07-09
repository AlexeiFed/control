"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "../ui/button";
import type { PayrollHalf } from "../../lib/payroll/advance-period";
import { halfPeriodLabelRu } from "../../lib/payroll/advance-period";

type Props = {
  filters: {
    guardId?: string;
    objectId?: string;
    month?: string;
    week?: string;
    q?: string;
  };
  monthContext?: { year: number; monthIndex0: number };
};

function parseMonthKey(value: string | null | undefined): { year: number; monthIndex0: number } | null {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [yearStr, monthStr] = value.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, monthIndex0: month - 1 };
}

export function PayrollExportButton({ filters, monthContext }: Props) {
  const [open, setOpen] = useState(false);
  const searchParams = useSearchParams();
  const monthFromUrl = searchParams.get("month") ?? filters.month ?? "";
  const resolvedMonth = parseMonthKey(monthFromUrl) ?? monthContext ?? null;

  function download(half: PayrollHalf) {
    if (!monthFromUrl) return;
    const params = new URLSearchParams();
    if (filters.guardId) params.set("guardId", filters.guardId);
    if (filters.objectId) params.set("objectId", filters.objectId);
    params.set("month", monthFromUrl);
    if (filters.week) params.set("week", filters.week);
    if (filters.q) params.set("q", filters.q);
    params.set("periodHalf", half);
    window.location.href = `/api/accounting/export/payroll-statement?${params.toString()}`;
    setOpen(false);
  }

  const canExport = !!monthFromUrl && !filters.week;

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!canExport}
        title={canExport ? undefined : "Выберите месяц (без недели) для ведомости"}
      >
        <FileSpreadsheet className="size-4" />
        Зарплата
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payroll-export-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-5 shadow-glow"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="payroll-export-title" className="text-lg font-semibold">
              Ведомость за период
            </h2>
            <p className="mt-2 text-sm text-app-muted">
              Выберите полупериод выплаты. Будет сформирован Excel-файл по образцу заказчика.
            </p>
            <div className="mt-4 grid gap-2">
              {resolvedMonth ? (
                (["first", "second"] as const).map((half) => (
                  <Button
                    key={half}
                    type="button"
                    variant="secondary"
                    className="min-h-[2.75rem] justify-center"
                    onClick={() => download(half)}
                  >
                    {halfPeriodLabelRu(half, resolvedMonth.year, resolvedMonth.monthIndex0)}
                  </Button>
                ))
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={() => download("first")}>
                    с 1 по 15
                  </Button>
                  <Button type="button" variant="secondary" onClick={() => download("second")}>
                    с 16 по конец месяца
                  </Button>
                </>
              )}
            </div>
            <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setOpen(false)}>
              Отмена
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
