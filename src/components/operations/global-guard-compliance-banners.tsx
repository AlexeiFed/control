/**
 * Назначение: Объединенный баннер периодических проверок и медкомиссий охранников.
 * Описание: Показывает общую свернутую строку предупреждений, которая может быть развернута
 * в 1 строку (2 колонки) со списком охранников, у которых истекают сроки документов.
 */

"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";
import { GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT } from "../../lib/guards/compliance-reminders-refresh";
import { complianceReminderBannerFingerprint } from "../../lib/guards/periodic-check";

type ReminderItem = {
  guardId: string;
  guardName: string;
  reminderKind?: "expiry" | "personal_card";
  passedOn?: string;
  passedOnDisplay: string;
  expiryIso?: string;
  expiryDisplay: string;
};

const DISMISS_STORAGE_KEY = "guard-compliance-banners-dismiss";

type GlobalGuardComplianceBannersProps = {
  periodicItems?: ReminderItem[] | null;
  medicalItems?: ReminderItem[] | null;
  incidentBannerVisible?: boolean;
};

export function GlobalGuardComplianceBanners({
  periodicItems: controlledPeriodic,
  medicalItems: controlledMedical,
  incidentBannerVisible = false,
}: GlobalGuardComplianceBannersProps = {}) {
  const [internalPeriodic, setInternalPeriodic] = useState<ReminderItem[] | null>(
    controlledPeriodic ?? null,
  );
  const [internalMedical, setInternalMedical] = useState<ReminderItem[] | null>(
    controlledMedical ?? null,
  );
  const controlled = controlledPeriodic !== undefined || controlledMedical !== undefined;
  const periodicItems = controlledPeriodic !== undefined ? controlledPeriodic : internalPeriodic;
  const medicalItems = controlledMedical !== undefined ? controlledMedical : internalMedical;
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  
  const bannerRef = useRef<HTMLDivElement | null>(null);

  // Синхронизация высоты для сдвига контента страниц
  useLayoutEffect(() => {
    const el = bannerRef.current;
    const hasData = (periodicItems?.length || 0) > 0 || (medicalItems?.length || 0) > 0;
    if (!hasData || !el || dismissed) {
      document.documentElement.style.setProperty("--compliance-banner-offset", "0px");
      return;
    }
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty("--compliance-banner-offset", `${Math.ceil(h + 16)}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--compliance-banner-offset", "0px");
    };
  }, [periodicItems, medicalItems, dismissed, expanded]);

  const load = useCallback(async () => {
    try {
      const [periodicRes, medicalRes] = await Promise.all([
        fetch("/api/guards/periodic-check-reminders", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/guards/medical-commission-reminders", { credentials: "same-origin", cache: "no-store" })
      ]);

      let loadedPeriodic: ReminderItem[] = [];
      let loadedMedical: ReminderItem[] = [];

      if (periodicRes.ok && periodicRes.status !== 403) {
        const body = await periodicRes.json();
        if (body.ok && Array.isArray(body.items)) {
          loadedPeriodic = body.items;
        }
      }

      if (medicalRes.ok && medicalRes.status !== 403) {
        const body = await medicalRes.json();
        if (body.ok && Array.isArray(body.items)) {
          loadedMedical = body.items;
        }
      }

      setInternalPeriodic(loadedPeriodic);
      setInternalMedical(loadedMedical);

      const totalItems = [...loadedPeriodic, ...loadedMedical];
      if (totalItems.length > 0) {
        const fp = complianceReminderBannerFingerprint(
          totalItems.map(it => ({
            guardId: it.guardId,
            passedOn: it.passedOn,
            expiryIso: it.expiryIso,
            reminderKind: it.reminderKind
          }))
        );
        setDismissed(sessionStorage.getItem(DISMISS_STORAGE_KEY) === fp);
      } else {
        setDismissed(false);
      }
    } catch (e) {
      console.error("Ошибка загрузки напоминаний комплаенса:", e);
    }
  }, []);

  function dismissBanner() {
    const totalItems = [...(periodicItems || []), ...(medicalItems || [])];
    if (totalItems.length === 0) return;
    const fp = complianceReminderBannerFingerprint(
      totalItems.map(it => ({
        guardId: it.guardId,
        passedOn: it.passedOn,
        expiryIso: it.expiryIso,
        reminderKind: it.reminderKind
      }))
    );
    sessionStorage.setItem(DISMISS_STORAGE_KEY, fp);
    setDismissed(true);
  }

  const syncDismissedFromItems = useCallback((periodic: ReminderItem[] | null, medical: ReminderItem[] | null) => {
    const totalItems = [...(periodic || []), ...(medical || [])];
    if (totalItems.length === 0) {
      setDismissed(false);
      return;
    }
    const fp = complianceReminderBannerFingerprint(
      totalItems.map((it) => ({
        guardId: it.guardId,
        passedOn: it.passedOn,
        expiryIso: it.expiryIso,
        reminderKind: it.reminderKind,
      })),
    );
    setDismissed(sessionStorage.getItem(DISMISS_STORAGE_KEY) === fp);
  }, []);

  useEffect(() => {
    if (!controlled) return;
    syncDismissedFromItems(periodicItems, medicalItems);
  }, [controlled, medicalItems, periodicItems, syncDismissedFromItems]);

  useEffect(() => {
    if (controlled) return;
    void load();
    const id = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(id);
  }, [controlled, load]);

  useEffect(() => {
    if (controlled) return;
    function onFocus() {
      void load();
    }
    function onComplianceRefresh() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT, onComplianceRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT, onComplianceRefresh);
    };
  }, [controlled, load]);

  const hasPeriodic = (periodicItems?.length || 0) > 0;
  const hasMedical = (medicalItems?.length || 0) > 0;

  if (dismissed || (!hasPeriodic && !hasMedical)) return null;

  return (
    <div
      ref={bannerRef}
      className="pointer-events-auto fixed left-1/2 z-[99] w-[min(calc(100vw-2rem),52rem)] -translate-x-1/2 rounded-card border text-xs shadow-glow transition-all duration-300"
      style={{
        top: incidentBannerVisible
          ? "calc(1rem + var(--incident-banner-offset, 0px))"
          : "1rem",
        backgroundColor: designTokens.color.surface,
        borderColor: hasMedical ? designTokens.color.accent.danger : designTokens.color.accent.warning,
        color: designTokens.color.text,
        boxShadow: designTokens.shadow.glow,
      }}
      role="status"
      aria-live="polite"
    >
      {/* Кнопка закрытия */}
      <button
        type="button"
        aria-label="Закрыть"
        onClick={dismissBanner}
        className="absolute right-2 top-2 rounded p-1 text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
      >
        <X className="size-4" aria-hidden />
      </button>

      {/* Шапка / Свернутый вид */}
      <div 
        className="flex cursor-pointer items-center justify-between p-3 pr-10 select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-accent-danger text-sm">⚠️ Требуется внимание:</span>
          {hasPeriodic && (
            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-medium text-amber-700 dark:text-amber-500">
              Периодическая проверка ({periodicItems?.length} охр.)
            </span>
          )}
          {hasMedical && (
            <span className="rounded bg-red-600/10 px-1.5 py-0.5 font-medium text-red-700 dark:text-red-500">
              Медкомиссия ({medicalItems?.length} охр.)
            </span>
          )}
        </div>
        <button
          type="button"
          className="flex items-center gap-1 font-semibold text-accent-primary hover:underline"
        >
          {expanded ? (
            <> Свернуть <ChevronUp className="size-4" /> </>
          ) : (
            <> Развернуть <ChevronDown className="size-4" /> </>
          )}
        </button>
      </div>

      {/* Развернутый вид: в 1 строку (2 колонки рядом) */}
      {expanded && (
        <div className="grid gap-4 border-t border-app-border p-4 md:grid-cols-2">
          {/* Колонка периодической проверки */}
          <div className="rounded-card border p-3" style={{ backgroundColor: "rgba(217, 119, 6, 0.05)", borderColor: "rgba(217, 119, 6, 0.2)" }}>
            <div className="font-bold mb-1.5 text-amber-700 dark:text-amber-500" style={{ fontSize: "13px" }}>
              Периодическая проверка охранников
            </div>
            <p className="mb-2 text-app-muted leading-tight">
              Срок действия — 1 год; после заведения личной карточки — в течение 30 дней.
            </p>
            {hasPeriodic ? (
              <ul className="list-none space-y-1.5 p-0 max-h-48 overflow-y-auto pr-1">
                {periodicItems?.map((item) => (
                  <li key={item.guardId} className="leading-snug">
                    <span className="font-semibold">{item.guardName}</span>
                    {item.reminderKind === "personal_card" ? (
                      <span className="text-app-muted">
                        : ЛК от {item.passedOnDisplay}, проверка не пройдена в срок (с {item.expiryDisplay})
                      </span>
                    ) : (
                      <span className="text-app-muted">
                        : проверка от {item.passedOnDisplay}, срок до {item.expiryDisplay}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-app-muted italic">Нет предупреждений</p>
            )}
          </div>

          {/* Колонка медкомиссии */}
          <div className="rounded-card border p-3" style={{ backgroundColor: "rgba(220, 38, 38, 0.04)", borderColor: "rgba(220, 38, 38, 0.15)" }}>
            <div className="font-bold mb-1.5 text-red-700 dark:text-red-500" style={{ fontSize: "13px" }}>
              Медкомиссия охранников
            </div>
            <p className="mb-2 text-app-muted leading-tight">
              Срок действия — 1 год. Необходимо пройти медкомиссию до истечения срока.
            </p>
            {hasMedical ? (
              <ul className="list-none space-y-1.5 p-0 max-h-48 overflow-y-auto pr-1">
                {medicalItems?.map((item) => (
                  <li key={item.guardId} className="leading-snug">
                    <span className="font-semibold">{item.guardName}</span>
                    <span className="text-app-muted">
                      : медкомиссия от {item.passedOnDisplay}, срок до {item.expiryDisplay}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-app-muted italic">Нет предупреждений</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
