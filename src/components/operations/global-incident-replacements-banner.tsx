"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, EyeOff, X } from "lucide-react";
import { incidentCategoryLabels } from "../../lib/operations/status-labels";
import type { IncidentCategory } from "../../lib/scheduling/types";
import { designTokens } from "../../lib/design-tokens";
import { pluralizeRu } from "../../lib/format/pluralize-ru";
import { toast } from "../../store/toast-store";

type PendingItem = {
  shiftId: string;
  objectName: string;
  shiftDateKey: string;
  guardName: string;
  category: IncidentCategory;
  comment: string;
};

export const INCIDENT_REPLACEMENTS_REFRESH_EVENT = "incident-replacements:refresh";

export type IncidentReplacementsRefreshDetail = {
  hiddenShiftId?: string;
};

export function dispatchIncidentReplacementsRefresh(detail?: IncidentReplacementsRefreshDetail): void {
  window.dispatchEvent(
    new CustomEvent<IncidentReplacementsRefreshDetail>(INCIDENT_REPLACEMENTS_REFRESH_EVENT, { detail }),
  );
}

type GlobalIncidentReplacementsBannerProps = {
  items?: PendingItem[] | null;
  canDismiss?: boolean;
  dismissed?: boolean;
  onDismiss?: () => void;
};

export function GlobalIncidentReplacementsBanner({
  items: controlledItems,
  canDismiss = false,
  dismissed = false,
  onDismiss,
}: GlobalIncidentReplacementsBannerProps) {
  const [internalItems, setInternalItems] = useState<PendingItem[] | null>(controlledItems ?? null);
  const [expanded, setExpanded] = useState(false);
  const [hidingShiftId, setHidingShiftId] = useState<string | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const controlled = controlledItems !== undefined;
  const items = controlled ? controlledItems : internalItems;

  useLayoutEffect(() => {
    const el = bannerRef.current;
    if (!items?.length || !el || dismissed) {
      document.documentElement.style.setProperty("--incident-banner-offset", "0px");
      return;
    }
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--incident-banner-offset", `${Math.ceil(h + 16)}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--incident-banner-offset", "0px");
    };
  }, [items, expanded, dismissed]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduler/pending-incident-replacements", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 403) {
        setInternalItems([]);
        return;
      }
      if (!res.ok) {
        return;
      }
      const body = (await res.json()) as { ok?: boolean; items?: PendingItem[] };
      if (body.ok && Array.isArray(body.items)) setInternalItems(body.items);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (controlled) return;
    void load();
    const id = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(id);
  }, [controlled, load]);

  const hideIncidentAlert = useCallback(
    async (shiftId: string) => {
      setHidingShiftId(shiftId);
      try {
        const res = await fetch("/api/scheduler/dismiss-incident-alert", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shiftId }),
        });
        const body = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !body.ok) {
          toast({
            title: "Не удалось скрыть",
            message: body.error ?? "Ошибка сервера",
            variant: "error",
            durationMs: 6500,
          });
          return;
        }
        if (!controlled) {
          setInternalItems((prev) => prev?.filter((item) => item.shiftId !== shiftId) ?? []);
        }
        dispatchIncidentReplacementsRefresh({ hiddenShiftId: shiftId });
      } catch {
        toast({
          title: "Не удалось скрыть",
          message: "Сетевая ошибка",
          variant: "error",
          durationMs: 6500,
        });
      } finally {
        setHidingShiftId(null);
      }
    },
    [controlled],
  );

  useEffect(() => {
    if (controlled) return;
    function onFocus() {
      void load();
    }
    function onIncidentReplacementsRefresh() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(INCIDENT_REPLACEMENTS_REFRESH_EVENT, onIncidentReplacementsRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(INCIDENT_REPLACEMENTS_REFRESH_EVENT, onIncidentReplacementsRefresh);
    };
  }, [controlled, load]);

  if (items === null || items.length === 0 || dismissed) return null;

  const countLabel = `${items.length} ${pluralizeRu(items.length, "инцидент", "инцидента", "инцидентов")}`;

  return (
    <div
      ref={bannerRef}
      className="pointer-events-auto fixed left-1/2 top-4 z-[110] w-[min(calc(100vw-1.5rem),52rem)] -translate-x-1/2 overflow-hidden rounded-card border text-xs shadow-glow transition-all duration-300"
      style={{
        backgroundColor: designTokens.color.surface,
        borderColor: designTokens.color.accent.danger,
        color: designTokens.color.text,
        boxShadow: designTokens.shadow.glow,
      }}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        aria-label="Закрыть"
        onClick={() => {
          document.documentElement.style.setProperty("--incident-banner-offset", "0px");
          onDismiss?.();
        }}
        className="absolute right-2 top-2 rounded p-1 text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
      >
        <X className="size-4" aria-hidden />
      </button>

      <div
        className="flex cursor-pointer items-center justify-between gap-2 p-3 pr-10 select-none"
        onClick={() => setExpanded((value) => !value)}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="font-semibold text-sm" style={{ color: designTokens.color.accent.danger }}>
            Требуется замена по инциденту
          </span>
          <span
            className="rounded px-1.5 py-0.5 font-medium"
            style={{
              backgroundColor: "rgba(185, 28, 28, 0.15)",
              color: designTokens.color.accent.danger,
            }}
          >
            {countLabel}
          </span>
        </div>
        <button
          type="button"
          className="flex shrink-0 items-center gap-1 font-semibold text-accent-primary hover:underline"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {expanded ? (
            <>
              Свернуть <ChevronUp className="size-4" aria-hidden />
            </>
          ) : (
            <>
              Развернуть <ChevronDown className="size-4" aria-hidden />
            </>
          )}
        </button>
      </div>

      {expanded ? (
        <ul className="max-h-[min(60vh,28rem)] list-none space-y-2 overflow-y-auto border-t border-app-border/60 bg-app-surface p-3 pt-2">
          {items.map((item) => (
            <li key={item.shiftId} className="flex items-start justify-between gap-3 leading-snug">
              <span className="min-w-0">
                <span className="font-medium">{item.objectName}</span>, {item.shiftDateKey}:{" "}
                {incidentCategoryLabels[item.category]}
                {item.guardName ? ` — ${item.guardName}` : ""}
                {item.comment ? ` — ${item.comment}` : ""}. Назначьте замену в графике.
              </span>
              {canDismiss ? (
                <button
                  type="button"
                  disabled={hidingShiftId === item.shiftId}
                  title="Скрыть из уведомлений (инцидент останется в графике)"
                  aria-label="Скрыть инцидент из уведомлений"
                  onClick={(event) => {
                    event.stopPropagation();
                    void hideIncidentAlert(item.shiftId);
                  }}
                  className="inline-flex shrink-0 items-center gap-1 rounded-button border border-app-border bg-app-elevated px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-app-muted transition hover:border-accent-primary hover:text-accent-primary disabled:opacity-50"
                >
                  <EyeOff className="size-3.5" aria-hidden />
                  {hidingShiftId === item.shiftId ? "…" : "Скрыть"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
