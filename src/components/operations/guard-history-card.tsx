import type { CSSProperties } from "react";
import { ClipboardList } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";
import { formatDisplayDateTimeLocal } from "../../lib/format/display-date";
import type { GuardServiceHistoryEntry } from "../../lib/operations/guards-repository";
import { incidentCategoryLabels } from "../../lib/operations/status-labels";
import type { ShiftLog } from "../../lib/scheduling/types";

const incidentLevelLabels: Record<ShiftLog["incidentLevel"], string> = {
  None: "Без инцидента",
  Info: "Инфо",
  Warning: "Предупреждение",
  Critical: "Критично",
};

const kindTitle: Record<GuardServiceHistoryEntry["kind"], string> = {
  incident: "Происшествие",
  shift_log: "Запись журнала",
  replacement_duty: "Смена-замена",
};

type GuardHistoryCardProps = {
  entries: GuardServiceHistoryEntry[];
};

export function GuardHistoryCard({ entries }: GuardHistoryCardProps) {
  return (
    <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
        <ClipboardList className="size-4 text-accent-primary" />
        <h2 className="font-bold text-sm text-app-text uppercase tracking-wider">История</h2>
        <span className="ml-auto text-xs font-semibold text-app-muted tabular-nums">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="mt-4 text-sm text-app-muted">Происшествий, инцидентов и записей журнала пока нет.</p>
      ) : (
        <ol className="mt-4 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-button border border-app-border bg-app-surface px-3.5 py-3 text-sm shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span
                  className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border"
                  style={badgeStyle(entry.kind)}
                >
                  {kindTitle[entry.kind]}
                </span>
                <time className="text-xs font-medium text-app-muted tabular-nums">
                  {formatDisplayDateTimeLocal(entry.at)}
                </time>
              </div>
              <p className="mt-2 font-bold text-app-text">{entry.objectName}</p>
              <p className="text-xs text-app-muted">
                Смена {formatDisplayDateTimeLocal(entry.shiftStartsAt)} —{" "}
                {formatDisplayDateTimeLocal(entry.shiftEndsAt)}
              </p>
              {entry.kind === "incident" ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-app-muted">Категория: </span>
                    <span className="font-semibold text-app-text">
                      {incidentCategoryLabels[entry.category]}
                    </span>
                  </p>
                  {entry.workedUntilAt ? (
                    <p>
                      <span className="text-app-muted">Отработал до: </span>
                      <span className="font-semibold text-app-text">
                        {formatDisplayDateTimeLocal(entry.workedUntilAt)}
                      </span>
                    </p>
                  ) : null}
                  {entry.replacementGuardName ? (
                    <p>
                      <span className="text-app-muted">Замена: </span>
                      <span className="font-semibold text-accent-primary">{entry.replacementGuardName}</span>
                    </p>
                  ) : null}
                  {entry.comment ? (
                    <p className="text-app-text leading-snug">
                      <span className="text-app-muted">Комментарий: </span>
                      {entry.comment}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {entry.kind === "shift_log" ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-app-muted">Уровень: </span>
                    <span className="font-semibold" style={{ color: levelColor(entry.incidentLevel) }}>
                      {incidentLevelLabels[entry.incidentLevel]}
                    </span>
                  </p>
                  <p className="text-app-text leading-snug">{entry.note}</p>
                </div>
              ) : null}
              {entry.kind === "replacement_duty" ? (
                <div className="mt-2 space-y-1 text-sm">
                  <p>
                    <span className="text-app-muted">Вместо: </span>
                    <span className="font-semibold text-app-text">{entry.originalGuardName}</span>
                  </p>
                  <p>
                    <span className="text-app-muted">Причина: </span>
                    <span className="font-semibold text-app-text">
                      {incidentCategoryLabels[entry.category]}
                    </span>
                  </p>
                  {entry.comment ? (
                    <p className="text-app-text leading-snug">
                      <span className="text-app-muted">Комментарий: </span>
                      {entry.comment}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function badgeStyle(kind: GuardServiceHistoryEntry["kind"]): CSSProperties {
  if (kind === "incident") {
    return {
      borderColor: `${designTokens.color.accent.danger}33`,
      backgroundColor: `${designTokens.color.accent.danger}14`,
      color: designTokens.color.accent.danger,
    };
  }
  if (kind === "replacement_duty") {
    return {
      borderColor: `${designTokens.color.accent.primary}33`,
      backgroundColor: `${designTokens.color.accent.primary}14`,
      color: designTokens.color.accent.primary,
    };
  }
  return {
    borderColor: `${designTokens.color.accent.warning}33`,
    backgroundColor: `${designTokens.color.accent.warning}14`,
    color: designTokens.color.accent.warning,
  };
}

function levelColor(level: "Info" | "Warning" | "Critical"): string {
  if (level === "Critical") return designTokens.color.accent.danger;
  if (level === "Warning") return designTokens.color.accent.warning;
  return designTokens.color.textMuted;
}
