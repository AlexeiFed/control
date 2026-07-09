"use client";

import { useMemo, useState } from "react";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import { formatCompactTimeRangeLocal, formatDisplayDateTimeLocal, formatDisplayDateFromIso, toDateIsoKhabarovsk } from "../../lib/format/display-date";
import { filterShiftLogs } from "../../lib/scheduling/shift-log-filters";
import type { ShiftLog } from "../../lib/scheduling/types";

type ShiftLogPanelProps = {
  logs: ShiftLog[];
  currentRole: Role;
};

const incidentLevelLabels: Record<ShiftLog["incidentLevel"], string> = {
  None: "Без инцидента",
  Info: "Инфо",
  Warning: "Предупреждение",
  Critical: "Критично",
};

export function ShiftLogPanel({
  logs,
  currentRole,
}: ShiftLogPanelProps) {
  const [objectName, setObjectName] = useState("");
  const [guardQuery, setGuardQuery] = useState("");
  const [level, setLevel] = useState<ShiftLog["incidentLevel"] | "">("");
  const [textQuery, setTextQuery] = useState("");
  const canWriteLogs =
    hasPermission(currentRole, "schedule:write") &&
    (currentRole === "Administrator" || currentRole === "Planner");
  const objectOptions = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.objectName).filter(Boolean) as string[])).sort((a, b) =>
      a.localeCompare(b, "ru-RU"),
    );
  }, [logs]);
  const filteredLogs = useMemo(
    () => filterShiftLogs(logs, { objectName, guardQuery, level, textQuery }),
    [logs, objectName, guardQuery, level, textQuery],
  );

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-accent-primary">Журнал охраны</p>
          <h1 className="mt-3 text-3xl font-semibold">Журнал смен</h1>
        </div>
        <span className="text-sm text-app-muted">
          {canWriteLogs ? "Роль может добавлять записи" : "Роль только просматривает записи"}
        </span>
      </div>

      {canWriteLogs ? (
        <p className="mt-4 rounded-card border border-app-border bg-app-elevated px-4 py-3 text-sm text-app-muted">
          Записи добавляются прямо из попапа смены в графике, чтобы не искать нужную смену в длинном списке.
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 rounded-card border border-app-border bg-app-elevated p-4 md:grid-cols-4">
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Объект</span>
          <select
            value={objectName}
            onChange={(event) => setObjectName(event.target.value)}
            className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text"
          >
            <option value="">Все объекты</option>
            {objectOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Охранник</span>
          <input
            value={guardQuery}
            onChange={(event) => setGuardQuery(event.target.value)}
            className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text outline-none focus:border-accent-primary"
            placeholder="Фамилия или имя"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Уровень</span>
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value as ShiftLog["incidentLevel"] | "")}
            className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text"
          >
            <option value="">Все записи</option>
            <option value="None">{incidentLevelLabels.None}</option>
            <option value="Info">{incidentLevelLabels.Info}</option>
            <option value="Warning">{incidentLevelLabels.Warning}</option>
            <option value="Critical">{incidentLevelLabels.Critical}</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-app-muted">Текст</span>
          <input
            value={textQuery}
            onChange={(event) => setTextQuery(event.target.value)}
            className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-app-text outline-none focus:border-accent-primary"
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
        {filteredLogs.map((log) => (
          <article key={log.id} className="rounded-card border border-app-border bg-app-elevated p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{incidentLevelLabels[log.incidentLevel]}</span>
                {log.authorName ? (
                  <span className="text-sm text-app-muted border-l border-app-border pl-2">
                    {log.authorName}
                  </span>
                ) : null}
              </div>
              <time className="text-sm text-app-muted">{formatDisplayDateTimeLocal(log.createdAt)}</time>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-app-muted">
              {log.objectName ? <span>{log.objectName}</span> : null}
              {log.guardName ? <span>{log.guardName}</span> : null}
              {log.shiftStartsAt && log.shiftEndsAt ? (
                <span>
                  {formatDisplayDateFromIso(toDateIsoKhabarovsk(log.shiftStartsAt))} ·{" "}
                  {formatCompactTimeRangeLocal(log.shiftStartsAt, log.shiftEndsAt)}
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-app-muted">{log.note}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
