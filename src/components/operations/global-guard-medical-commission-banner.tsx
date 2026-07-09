"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import { designTokens } from "../../lib/design-tokens";
import { complianceReminderBannerFingerprint } from "../../lib/guards/periodic-check";

type ReminderItem = {
  guardId: string;
  guardName: string;
  passedOn?: string;
  passedOnDisplay: string;
  expiryIso?: string;
  expiryDisplay: string;
};

const DISMISS_STORAGE_KEY = "guard-medical-commission-banner-dismiss";

export function GlobalGuardMedicalCommissionBanner() {
  const [items, setItems] = useState<ReminderItem[] | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const bannerRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useLayoutEffect(() => {
    const el = bannerRef.current;
    if (!items?.length || !el || dismissed) {
      document.documentElement.style.setProperty("--medical-commission-banner-offset", "0px");
      return;
    }
    const sync = () => {
      const h = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty(
        "--medical-commission-banner-offset",
        `${Math.ceil(h + 16)}px`,
      );
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty("--medical-commission-banner-offset", "0px");
    };
  }, [items, dismissed]);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/guards/medical-commission-reminders", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 403) {
        setItems([]);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; items?: ReminderItem[] };
      if (body.ok && Array.isArray(body.items)) {
        setItems(body.items);
        const fp = complianceReminderBannerFingerprint(body.items);
        setDismissed(
          body.items.length > 0 && sessionStorage.getItem(DISMISS_STORAGE_KEY) === fp,
        );
      }
    } catch {
      /* ignore */
    }
  }, []);

  function dismissBanner() {
    if (!items?.length) return;
    sessionStorage.setItem(DISMISS_STORAGE_KEY, complianceReminderBannerFingerprint(items));
    setDismissed(true);
  }

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    void load();
  }, [load, pathname, searchParams]);

  useEffect(() => {
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (items === null || items.length === 0 || dismissed) return null;

  return (
    <div
      ref={bannerRef}
      className="pointer-events-auto fixed left-1/2 z-[98] max-h-[min(70vh,24rem)] w-[min(calc(100vw-2rem),26rem)] -translate-x-1/2 overflow-y-auto rounded-card border px-3 py-2 pr-8 text-xs shadow-glow"
      style={{
        top: "calc(1rem + var(--incident-banner-offset, 0px) + var(--periodic-check-banner-offset, 0px))",
        backgroundColor: "rgba(220, 38, 38, 0.1)",
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
        onClick={dismissBanner}
        className="absolute right-2 top-2 rounded p-0.5 text-app-muted transition-colors hover:bg-app-elevated hover:text-app-text"
      >
        <X className="size-4" aria-hidden />
      </button>
      <div className="font-semibold pr-4" style={{ color: designTokens.color.accent.danger }}>
        Медкомиссия охранников
      </div>
      <p className="mt-1 leading-snug text-app-muted">
        Срок действия — 1 год. Необходимо пройти медкомиссию до истечения срока.
      </p>
      <ul className="mt-2 list-none space-y-2 p-0">
        {items.map((item) => (
          <li key={item.guardId} className="leading-snug">
            <span className="font-medium">{item.guardName}</span>: медкомиссия от {item.passedOnDisplay}, срок до{" "}
            {item.expiryDisplay}
          </li>
        ))}
      </ul>
    </div>
  );
}
