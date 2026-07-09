"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { GlobalAlertsPayload, GlobalAlertIncidentItem } from "../../lib/operations/global-alerts";
import { GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT } from "../../lib/guards/compliance-reminders-refresh";
import { GlobalGuardComplianceBanners } from "./global-guard-compliance-banners";
import {
  GlobalIncidentReplacementsBanner,
  INCIDENT_REPLACEMENTS_REFRESH_EVENT,
  type IncidentReplacementsRefreshDetail,
} from "./global-incident-replacements-banner";
import { GlobalGuardBirthdayBell } from "./global-guard-birthday-bell";
import { GlobalScheduleShortageBell } from "./global-schedule-shortage-bell";

const EMPTY_ALERTS: GlobalAlertsPayload = {
  incidentItems: null,
  canDismissIncidentAlerts: false,
  periodicItems: null,
  medicalItems: null,
  birthdayItems: null,
  shortages: null,
  weekStartIso: null,
};

async function fetchPendingIncidentItems(): Promise<GlobalAlertIncidentItem[] | null> {
  const res = await fetch("/api/scheduler/pending-incident-replacements", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (res.status === 403) return [];
  if (!res.ok) return null;
  const body = (await res.json()) as { ok?: boolean; items?: GlobalAlertIncidentItem[] };
  if (!body.ok || !Array.isArray(body.items)) return null;
  return body.items;
}

export function GlobalAlertsShell() {
  const pathname = usePathname();
  const [alerts, setAlerts] = useState<GlobalAlertsPayload | null>(null);
  const [incidentDismissed, setIncidentDismissed] = useState(false);

  const loadIncidentItems = useCallback(async () => {
    if (pathname === "/login") return;
    const items = await fetchPendingIncidentItems();
    if (items === null) return;
    setAlerts((prev) => ({
      ...(prev ?? EMPTY_ALERTS),
      incidentItems: items,
    }));
    if (items.length > 0) {
      setIncidentDismissed(false);
    }
  }, [pathname]);

  const load = useCallback(async () => {
    if (pathname === "/login") return;
    try {
      const res = await fetch("/api/global-alerts", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as GlobalAlertsPayload & { ok?: boolean };
      if (body.ok === false) return;
      setAlerts({
        incidentItems: body.incidentItems ?? null,
        canDismissIncidentAlerts: body.canDismissIncidentAlerts === true,
        periodicItems: body.periodicItems ?? null,
        medicalItems: body.medicalItems ?? null,
        birthdayItems: body.birthdayItems ?? null,
        shortages: body.shortages ?? null,
        weekStartIso: body.weekStartIso ?? null,
      });
    } catch {
      /* ignore */
    }
    await loadIncidentItems();
  }, [loadIncidentItems, pathname]);

  useEffect(() => {
    if (pathname === "/login") {
      setAlerts(null);
      return;
    }
    void load();
    const id = window.setInterval(() => void load(), 180_000);
    return () => window.clearInterval(id);
  }, [load, pathname]);

  useEffect(() => {
    if (pathname === "/login") return;
    function onFocus() {
      void loadIncidentItems();
    }
    function onIncidentRefresh(event: Event) {
      const detail = (event as CustomEvent<IncidentReplacementsRefreshDetail>).detail;
      if (detail?.hiddenShiftId) {
        setAlerts((prev) => {
          if (!prev?.incidentItems?.length) return prev;
          const nextItems = prev.incidentItems.filter((item) => item.shiftId !== detail.hiddenShiftId);
          return { ...prev, incidentItems: nextItems };
        });
      }
      void loadIncidentItems();
    }
    function onComplianceRefresh() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(INCIDENT_REPLACEMENTS_REFRESH_EVENT, onIncidentRefresh);
    window.addEventListener(GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT, onComplianceRefresh);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(INCIDENT_REPLACEMENTS_REFRESH_EVENT, onIncidentRefresh);
      window.removeEventListener(GUARD_COMPLIANCE_REMINDERS_REFRESH_EVENT, onComplianceRefresh);
    };
  }, [load, loadIncidentItems, pathname]);

  const data = alerts ?? EMPTY_ALERTS;
  const incidentFingerprint =
    data.incidentItems?.map((item) => item.shiftId).join(",") ?? "";
  const hasIncidents = (data.incidentItems?.length ?? 0) > 0;
  const incidentBannerVisible = hasIncidents && !incidentDismissed;

  useEffect(() => {
    setIncidentDismissed(false);
  }, [incidentFingerprint]);

  useEffect(() => {
    if (!incidentBannerVisible) {
      document.documentElement.style.setProperty("--incident-banner-offset", "0px");
    }
  }, [incidentBannerVisible]);

  if (pathname === "/login") return null;

  const showTopBells =
    (data.birthdayItems?.length ?? 0) > 0 || (data.shortages?.length ?? 0) > 0;

  return (
    <>
      <GlobalIncidentReplacementsBanner
        items={data.incidentItems}
        canDismiss={data.canDismissIncidentAlerts}
        dismissed={incidentDismissed}
        onDismiss={() => setIncidentDismissed(true)}
      />
      <GlobalGuardComplianceBanners
        periodicItems={data.periodicItems}
        medicalItems={data.medicalItems}
        incidentBannerVisible={incidentBannerVisible}
      />
      {showTopBells ? (
        <div className="pointer-events-auto fixed right-3 top-3 z-[95] flex items-start gap-2 sm:right-4 sm:top-4">
          <GlobalGuardBirthdayBell items={data.birthdayItems} />
          <GlobalScheduleShortageBell
            shortages={data.shortages}
            weekStartIso={data.weekStartIso ?? ""}
          />
        </div>
      ) : null}
    </>
  );
}
