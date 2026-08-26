"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import {
  formatCompactTimeRangeLocal,
  formatDisplayDateTimeLocal,
  formatDisplayDateFromIso,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";
import { filterShiftLogs } from "../../lib/scheduling/shift-log-filters";
import type { ShiftLog } from "../../lib/scheduling/types";
import { MultiSelectFilter } from "./multi-select-filter";
import { Button, ButtonLink } from "../ui/button";

type ToggleAccountedResult =
  | { ok: true; accountedAt: string | null }
  | { ok: false; error: string };

type DeleteLogResult = { ok: true } | { ok: false; error: string };

type ShiftLogPanelProps = {
  logs: ShiftLog[];
  currentRole: Role;
  toggleAccountedAction: (input: {
    logId: string;
    accounted: boolean;
  }) => Promise<ToggleAccountedResult>;
  deleteLogAction: (input: { logId: string }) => Promise<DeleteLogResult>;
};

const incidentLevelLabels: Record<ShiftLog["incidentLevel"], string> = {
  None: "Без инцидента",
  Info: "Инфо",
  Warning: "Предупреждение",
  Critical: "Критично",
};

function formatMonthKeyRu(monthKey: string): string {
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return monthKey;
  const label = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** 12 месяцев текущего года (Хабаровск), янв → дек. */
function buildYearMonthKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);
}

function toAccountedDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ShiftLogPanel({
  logs,
  currentRole,
  toggleAccountedAction,
  deleteLogAction,
}: ShiftLogPanelProps) {
  const currentMonthKey = useMemo(() => toDateIsoKhabarovsk(new Date()).slice(0, 7), []);
  const [monthKeys, setMonthKeys] = useState<string[]>([currentMonthKey]);
  const [objectNames, setObjectNames] = useState<string[]>([]);
  const [guardQuery, setGuardQuery] = useState("");
  const [level, setLevel] = useState<ShiftLog["incidentLevel"] | "">("");
  const [textQuery, setTextQuery] = useState("");
  const [items, setItems] = useState(logs);
  const [accountedById, setAccountedById] = useState<Record<string, string | null>>({});
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const canWriteLogs =
    hasPermission(currentRole, "schedule:write") &&
    (currentRole === "Administrator" || currentRole === "Planner");
  const objectOptions = useMemo(() => {
    return Array.from(new Set(items.map((log) => log.objectName).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b, "ru-RU"),
    );
  }, [items]);
  const monthOptions = useMemo(() => {
    const year = Number(currentMonthKey.slice(0, 4));
    return buildYearMonthKeys(Number.isFinite(year) ? year : new Date().getFullYear());
  }, [currentMonthKey]);

  useEffect(() => {
    setItems(logs);
  }, [logs]);

  useEffect(() => {
    const next: Record<string, string | null> = {};
    for (const log of items) {
      next[log.id] = log.accountedAt ? new Date(log.accountedAt).toISOString() : null;
    }
    setAccountedById(next);
  }, [items]);

  const filteredLogs = useMemo(
    () => filterShiftLogs(items, { monthKeys, objectNames, guardQuery, level, textQuery }),
    [items, monthKeys, objectNames, guardQuery, level, textQuery],
  );

  const onToggleAccounted = (logId: string, nextAccounted: boolean) => {
    if (!canWriteLogs || isPending) return;
    const previous = accountedById[logId] ?? null;
    setErrorMessage(null);
    setAccountedById((prev) => ({
      ...prev,
      [logId]: nextAccounted ? previous ?? new Date().toISOString() : null,
    }));
    setPendingLogId(logId);
    startTransition(async () => {
      const result = await toggleAccountedAction({ logId, accounted: nextAccounted });
      if (!result.ok) {
        setAccountedById((prev) => ({ ...prev, [logId]: previous }));
        setErrorMessage(result.error);
      } else {
        setAccountedById((prev) => ({ ...prev, [logId]: result.accountedAt }));
      }
      setPendingLogId(null);
    });
  };

  const onDelete = (log: ShiftLog) => {
    if (!canWriteLogs || isPending) return;
    const ok = window.confirm("Удалить запись журнала? Это действие нельзя отменить.");
    if (!ok) return;
    const previous = items;
    setErrorMessage(null);
    setItems((prev) => prev.filter((item) => item.id !== log.id));
    setPendingLogId(log.id);
    startTransition(async () => {
      const result = await deleteLogAction({ logId: log.id });
      if (!result.ok) {
        setItems(previous);
        setErrorMessage(result.error);
      }
      setPendingLogId(null);
    });
  };

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-accent-primary">Журнал охраны</p>
          <h1 className="mt-3 text-3xl font-semibold">Журнал смен</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-app-muted">
            {canWriteLogs ? "Роль может добавлять записи" : "Роль только просматривает записи"}
          </span>
          <ButtonLink href="/dashboard" variant="secondary" className="w-full md:w-auto">
            На панель
          </ButtonLink>
        </div>
      </div>

      {canWriteLogs ? (
        <p className="mt-4 rounded-card border border-app-border bg-app-elevated px-4 py-3 text-sm text-app-muted">
          Записи добавляются прямо из попапа смены в графике, чтобы не искать нужную смену в длинном списке.
        </p>
      ) : null}

      {errorMessage ? (
        <p className="mt-4 rounded-card border border-accent-danger/40 bg-accent-danger/10 px-4 py-3 text-sm text-accent-danger">
          {errorMessage}
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-3 overflow-visible rounded-card border border-app-border bg-app-elevated p-4 sm:grid-cols-2 xl:grid-cols-5">
        <MultiSelectFilter
          label="Месяц"
          options={monthOptions.map((key) => ({ value: key, label: formatMonthKeyRu(key) }))}
          values={monthKeys}
          onChange={setMonthKeys}
          emptyLabel="Все месяцы"
          selectedCountLabel={(count) => `${count} мес.`}
        />
        <MultiSelectFilter
          label="Объект"
          options={objectOptions.map((name) => ({ value: name, label: name }))}
          values={objectNames}
          onChange={setObjectNames}
          emptyLabel="Все объекты"
          selectedCountLabel={(count) => `${count} объект.`}
        />
        <label className="relative z-0 grid min-w-0 gap-1 text-sm">
          <span className="text-app-muted">Охранник</span>
          <input
            value={guardQuery}
            onChange={(event) => setGuardQuery(event.target.value)}
            className="min-w-0 rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text outline-none focus:border-accent-primary"
            placeholder="Фамилия или имя"
          />
        </label>
        <label className="relative z-0 grid min-w-0 gap-1 text-sm">
          <span className="text-app-muted">Уровень</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as ShiftLog["incidentLevel"] | "")}
            className="min-w-0 rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text"
          >
            <option value="">Все записи</option>
            <option value="None">{incidentLevelLabels.None}</option>
            <option value="Info">{incidentLevelLabels.Info}</option>
            <option value="Warning">{incidentLevelLabels.Warning}</option>
            <option value="Critical">{incidentLevelLabels.Critical}</option>
          </select>
        </label>
        <label className="relative z-0 grid min-w-0 gap-1 text-sm sm:col-span-2 xl:col-span-1">
          <span className="text-app-muted">Текст</span>
          <input
            value={textQuery}
            onChange={(event) => setTextQuery(event.target.value)}
            className="min-w-0 rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text outline-none focus:border-accent-primary"
            placeholder="Поиск по записи"
          />
        </label>
      </div>

      <div className="mt-6 grid gap-3">
        {filteredLogs.length === 0 ? (
          <div className="rounded-card border border-app-border bg-app-elevated p-4 text-sm text-app-muted">
            Записей по выбранным фильтрам нет.
          </div>
        ) : null}
        {filteredLogs.map((log) => {
          const accountedAt = toAccountedDate(accountedById[log.id]);
          const isAccounted = Boolean(accountedAt);
          const busy = pendingLogId === log.id;
          return (
            <article key={log.id} className="rounded-card border border-app-border bg-app-elevated p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{incidentLevelLabels[log.incidentLevel]}</span>
                    {log.authorName ? (
                      <span className="border-l border-app-border pl-2 text-sm text-app-muted">
                        {log.authorName}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-app-muted">
                    {log.objectName ? <span>{log.objectName}</span> : null}
                    {log.guardName ? <span>{log.guardName}</span> : null}
                    {log.shiftStartsAt && log.shiftEndsAt ? (
                      <span>
                        Смена: {formatDisplayDateFromIso(toDateIsoKhabarovsk(log.shiftStartsAt))} ·{" "}
                        {formatCompactTimeRangeLocal(log.shiftStartsAt, log.shiftEndsAt)}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm text-app-muted">{log.note}</p>
                </div>

                <div className="flex shrink-0 flex-col items-start gap-3 md:items-end">
                  <div className="text-left text-sm text-app-muted md:text-right">
                    <div className="text-[10px] uppercase tracking-wider text-app-muted/80">Дата записи</div>
                    <time dateTime={log.createdAt instanceof Date ? log.createdAt.toISOString() : undefined}>
                      {formatDisplayDateTimeLocal(log.createdAt)}
                    </time>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-button border px-3 py-2 text-sm ${
                        isAccounted
                          ? "border-accent-success/40 bg-accent-success/10 text-accent-success"
                          : "border-app-border bg-app-surface text-app-muted"
                      } ${!canWriteLogs || busy ? "opacity-70" : ""}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={isAccounted}
                        disabled={!canWriteLogs || busy}
                        onChange={(event) => onToggleAccounted(log.id, event.target.checked)}
                      />
                      <span
                        className={`flex size-4 shrink-0 items-center justify-center rounded border ${
                          isAccounted
                            ? "border-accent-success bg-accent-success text-white"
                            : "border-app-border bg-app-surface"
                        }`}
                        aria-hidden
                      >
                        {isAccounted ? <Check className="size-3" strokeWidth={3} /> : null}
                      </span>
                      <span className="font-medium">Учтено</span>
                      {isAccounted && accountedAt ? (
                        <span className="text-xs">{formatDisplayDateTimeLocal(accountedAt)}</span>
                      ) : null}
                    </label>

                    {canWriteLogs ? (
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={busy}
                        aria-label="Удалить запись"
                        onClick={() => onDelete(log)}
                      >
                        <Trash2 className="size-4" />
                        Удалить
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
