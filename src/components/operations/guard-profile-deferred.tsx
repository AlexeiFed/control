"use client";

import { useEffect, useState } from "react";
import { GuardHistoryCard } from "./guard-history-card";
import { GuardScheduleSection } from "./guard-schedule-section";
import { GuardServiceRecordSection } from "./guard-service-record-section";
import type { GuardDetails, GuardServiceHistoryEntry } from "../../lib/operations/guards-repository";
import {
  addDaysToIsoDate,
  formatDisplayDateFromIso,
  formatMonthYearLongRu,
  getKhabarovskComponents,
  khabarovskWeekRangeContaining,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";

type AssignedObject = GuardDetails["objects"][number];

type SerializedHistoryEntry = {
  kind: GuardServiceHistoryEntry["kind"];
  at: string;
  shiftStartsAt: string;
  shiftEndsAt: string;
  workedUntilAt?: string | null;
} & Record<string, unknown>;

function formatDayMonthShort(isoDate: string): string {
  const formatted = formatDisplayDateFromIso(isoDate);
  const parts = formatted.split(".");
  if (parts.length < 2) return formatted;
  return `${parts[0]}.${parts[1]}`;
}

function reviveHistoryEntry(entry: SerializedHistoryEntry): GuardServiceHistoryEntry {
  const base = {
    ...entry,
    at: new Date(entry.at),
    shiftStartsAt: new Date(entry.shiftStartsAt),
    shiftEndsAt: new Date(entry.shiftEndsAt),
  };
  if (entry.kind !== "incident") return base as GuardServiceHistoryEntry;
  return {
    ...(base as Extract<GuardServiceHistoryEntry, { kind: "incident" }>),
    workedUntilAt: entry.workedUntilAt ? new Date(entry.workedUntilAt) : null,
  };
}

function HoursCardsSkeleton({ weekTitle, monthTitle }: { weekTitle: string; monthTitle: string }) {
  return (
    <>
      <article className="animate-pulse rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold text-app-muted">{weekTitle}</h2>
        <div className="mt-3 h-9 w-24 rounded bg-app-border/40" />
      </article>
      <article className="animate-pulse rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold text-app-muted">{monthTitle}</h2>
        <div className="mt-3 h-9 w-24 rounded bg-app-border/40" />
      </article>
    </>
  );
}

function HistorySkeleton() {
  return (
    <div className="animate-pulse rounded-card border border-app-border bg-app-elevated p-4">
      <div className="mb-4 h-6 w-40 rounded bg-app-border/40" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-14 rounded bg-app-border/40" />
        ))}
      </div>
    </div>
  );
}

/** Часы и история смен догружаются после отрисовки карточки, график месяца — своим запросом. */
export function GuardProfileDeferredSections({
  guardId,
  assignedObjects,
  initialDate,
}: {
  guardId: string;
  assignedObjects: AssignedObject[];
  initialDate: string;
}) {
  const weekRange = khabarovskWeekRangeContaining(initialDate);
  const weekEndIso = addDaysToIsoDate(toDateIsoKhabarovsk(weekRange.start), 6);
  const weekCardTitle = `За неделю (${formatDayMonthShort(toDateIsoKhabarovsk(weekRange.start))}–${formatDayMonthShort(weekEndIso)})`;
  const monthKh = getKhabarovskComponents(new Date(`${initialDate}T12:00:00+10:00`));
  const monthCardTitle = `За месяц (${formatMonthYearLongRu(monthKh.year, monthKh.month0).replace(/\s*г\.?\s*$/, "").toLowerCase()})`;

  const [weekTotalHours, setWeekTotalHours] = useState<number | null>(null);
  const [monthTotalHours, setMonthTotalHours] = useState<number | null>(null);
  const [history, setHistory] = useState<GuardServiceHistoryEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWeekTotalHours(null);
    setMonthTotalHours(null);
    setHistory(null);
    const url = `/api/guards/${encodeURIComponent(guardId)}/profile-extra?date=${encodeURIComponent(initialDate)}`;
    void (async () => {
      try {
        const response = await fetch(url, { credentials: "same-origin" });
        if (!response.ok || cancelled) return;
        const body = (await response.json()) as {
          ok?: boolean;
          weekTotalHours?: number;
          monthTotalHours?: number;
          history?: SerializedHistoryEntry[];
        };
        if (!body.ok || cancelled) return;
        setWeekTotalHours(body.weekTotalHours ?? 0);
        setMonthTotalHours(body.monthTotalHours ?? 0);
        setHistory((body.history ?? []).map(reviveHistoryEntry));
      } catch {
        if (!cancelled) {
          setWeekTotalHours(0);
          setMonthTotalHours(0);
          setHistory([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guardId, initialDate]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-app-muted">
            Закрепленные объекты
          </h2>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-app-text sm:mt-3">
            {assignedObjects.length > 0 ? (
              assignedObjects.map((object) => (
                <li key={object.id} className="list-inside list-disc">
                  {object.name}
                </li>
              ))
            ) : (
              <li className="font-normal text-app-muted">Нет закрепленных объектов</li>
            )}
          </ul>
        </article>
        {weekTotalHours == null || monthTotalHours == null ? (
          <HoursCardsSkeleton weekTitle={weekCardTitle} monthTitle={monthCardTitle} />
        ) : (
          <>
            <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
              <h2 className="text-xs font-semibold text-app-muted">{weekCardTitle}</h2>
              <p className="mt-2 text-2xl font-extrabold text-accent-primary sm:mt-3 sm:text-3xl">
                {weekTotalHours} ч
              </p>
            </article>
            <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
              <h2 className="text-xs font-semibold text-app-muted">{monthCardTitle}</h2>
              <p className="mt-2 text-2xl font-extrabold text-accent-primary sm:mt-3 sm:text-3xl">
                {monthTotalHours} ч
              </p>
            </article>
          </>
        )}
      </div>

      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">{history == null ? <HistorySkeleton /> : <GuardHistoryCard entries={history} />}</div>
        <div>
          <GuardServiceRecordSection guardId={guardId} />
        </div>
      </div>

      <GuardScheduleSection
        guardId={guardId}
        assignedObjects={assignedObjects}
        initialDate={initialDate}
      />
    </>
  );
}
