"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "../ui/button";

type Props = {
  filters: {
    guardId?: string;
    objectId?: string;
    month?: string;
    week?: string;
    q?: string;
  };
  objectOptions: Array<{ id: string; name: string }>;
};

export function TimesheetXlsxExportButton({ filters, objectOptions }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const searchParams = useSearchParams();

  const monthFromUrl = searchParams.get("month") ?? filters.month ?? "";
  const canExport = !!monthFromUrl && !filters.week;

  const allIds = useMemo(() => objectOptions.map((o) => o.id), [objectOptions]);
  const allSelected = selected.size > 0 && selected.size === allIds.length;
  const noneSelected = selected.size === 0;

  function openDialog() {
    if (!canExport) return;
    const initial = new Set<string>();
    if (filters.objectId) {
      initial.add(filters.objectId);
    } else {
      for (const id of allIds) initial.add(id);
    }
    setSelected(initial);
    setOpen(true);
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(allIds));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function download() {
    if (!monthFromUrl) return;
    if (selected.size === 0) return;

    const params = new URLSearchParams();
    if (filters.guardId) params.set("guardId", filters.guardId);
    params.set("month", monthFromUrl);
    if (filters.q) params.set("q", filters.q);

    // Если выбрано всё — не шлём objectIds (короче URL).
    if (selected.size !== allIds.length) {
      params.set("objectIds", Array.from(selected.values()).join(","));
    }

    window.location.href = `/api/accounting/export/timesheet-xlsx?${params.toString()}`;
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        onClick={openDialog}
        disabled={!canExport || objectOptions.length === 0}
        title={canExport ? undefined : "Выберите месяц (без недели) для Excel-табеля"}
      >
        <FileSpreadsheet className="size-4" />
        Табель
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="timesheet-xlsx-export-title"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-5 shadow-glow"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 id="timesheet-xlsx-export-title" className="text-lg font-semibold">
              Табель (Excel)
            </h2>
            <p className="mt-2 text-sm text-app-muted">
              Выберите объекты. В Excel будет отдельная вкладка на каждый объект. Красный — усиление, жёлтый — МП.
            </p>

            <div className="mt-4 rounded-card border border-app-border bg-app-bg p-3">
              <label className="flex select-none items-center gap-2 text-sm">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                <span className="font-medium">Выбрать все</span>
              </label>
              <div className="mt-3 max-h-56 space-y-2 overflow-auto pr-1">
                {objectOptions.map((o) => (
                  <label key={o.id} className="flex select-none items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(o.id)}
                      onChange={() => toggleOne(o.id)}
                    />
                    <span className="truncate">{o.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="button" onClick={download} disabled={noneSelected}>
                Скачать
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

