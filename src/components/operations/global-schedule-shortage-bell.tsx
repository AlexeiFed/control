/**
 * Назначение: Глобальный индикатор недоборов графика смен (красный колокольчик).
 * Описание: Отображается плавающим значком в верхнем правом углу. При наведении
 * показывает детальный список объектов и дней с недостающими сменами и ссылки на них.
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, BellRing, AlertTriangle } from "lucide-react";
import { usePathname } from "next/navigation";
import { designTokens } from "../../lib/design-tokens";

type DayShortage = {
  dateIso: string;
  dayLabel: string;
  hoursShort: number;
  reinforcementShort: number;
  rapidResponseShort: number;
  shiftLeadShort: number;
  expectedHoursRegular: number;
  regularDayHours: number;
};

type ObjectShortage = {
  objectId: string;
  objectName: string;
  totalHoursShort: number;
  totalReinforcementShort: number;
  totalRapidResponseShort: number;
  totalShiftLeadShort: number;
  days: DayShortage[];
};

function pluralObjects(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "объект";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "объекта";
  return "объектов";
}

type GlobalScheduleShortageBellProps = {
  shortages?: ObjectShortage[] | null;
  weekStartIso?: string;
};

export function GlobalScheduleShortageBell({
  shortages: controlledShortages,
  weekStartIso: controlledWeekStartIso,
}: GlobalScheduleShortageBellProps = {}) {
  const [internalShortages, setInternalShortages] = useState<ObjectShortage[] | null>(
    controlledShortages ?? null,
  );
  const [internalWeekStartIso, setInternalWeekStartIso] = useState<string>(controlledWeekStartIso ?? "");
  const controlled = controlledShortages !== undefined;
  const shortages = controlled ? controlledShortages : internalShortages;
  const weekStartIso = controlled ? (controlledWeekStartIso ?? "") : internalWeekStartIso;
  const [hovered, setHovered] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const pathname = usePathname();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/scheduler/shortages", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; shortages?: ObjectShortage[]; weekStartIso?: string };
      if (body.ok && Array.isArray(body.shortages)) {
        setInternalShortages(body.shortages);
        setInternalWeekStartIso(body.weekStartIso || "");
        setForbidden(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (controlled || forbidden) return;
    void load();
    const id = window.setInterval(() => void load(), 45_000);
    return () => window.clearInterval(id);
  }, [controlled, load, forbidden]);

  useEffect(() => {
    if (controlled || forbidden) return;
    function onFocus() {
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [controlled, load, forbidden]);

  // Не показываем на странице входа
  if (pathname === "/login" || forbidden || shortages === null || shortages.length === 0) {
    return null;
  }

  const totalHoursShort = shortages.reduce((s, o) => s + o.totalHoursShort, 0);

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
      }}
    >
      {/* Иконка колокольчика */}
      <button
        type="button"
        className="relative flex size-10 items-center justify-center rounded-full border bg-app-surface text-accent-danger shadow-glow transition-all hover:scale-105"
        style={{
          borderColor: designTokens.color.accent.danger,
          color: designTokens.color.accent.danger,
          boxShadow: designTokens.shadow.glow,
        }}
        aria-label="Оповещения о недоборах смен"
      >
        <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white shadow">
          {shortages.length}
        </span>
        <span className="absolute inset-0 rounded-full bg-red-500/10 animate-ping" style={{ animationDuration: "2s" }} />
        <BellRing className="size-5 animate-pulse" />
      </button>

      {/* Выпадающее меню при наведении */}
      <div
        className={`absolute right-0 top-full z-[99] w-80 pt-2 transition-all duration-150 ${
          hovered
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-2 opacity-0"
        }`}
      >
        <div
          className="max-h-[min(70vh,28rem)] overflow-y-auto rounded-card border bg-app-surface p-3 text-xs shadow-glow"
          style={{
            borderColor: designTokens.color.accent.danger,
            boxShadow: designTokens.shadow.glow,
          }}
        >
          <div className="flex items-center gap-1.5 border-b border-app-border pb-2 mb-2">
            <AlertTriangle className="size-4 shrink-0 text-accent-danger" />
            <span className="font-bold text-accent-danger">Неполный график смен</span>
          </div>

          <p className="mb-3 text-app-muted leading-snug">
            {shortages.length} {pluralObjects(shortages.length)} без полных смен. 
            {totalHoursShort > 0 ? (
              <> Недобор по основным: <span className="font-semibold text-app-text">−{totalHoursShort} ч</span>.</>
            ) : null}
          </p>

          <ul className="list-none space-y-3 p-0">
            {shortages.map((obj) => (
              <li key={obj.objectId} className="border-b border-app-border/40 pb-2 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-baseline justify-between gap-1.5">
                  <Link
                    href={`/scheduler?week=${weekStartIso}&objectId=${encodeURIComponent(obj.objectId)}`}
                    className="font-bold text-accent-primary hover:underline"
                    onClick={() => setHovered(false)}
                  >
                    {obj.objectName}
                  </Link>
                  {obj.totalHoursShort > 0 ? (
                    <span className="font-semibold text-accent-danger tabular-nums">
                      −{obj.totalHoursShort} ч
                    </span>
                  ) : null}
                </div>
                
                <ul className="mt-1 list-none space-y-0.5 border-l-2 pl-2" style={{ borderColor: "rgba(185, 28, 28, 0.2)" }}>
                  {obj.days.map((day) => (
                    <li key={day.dateIso} className="text-app-muted leading-tight">
                      <span className="font-medium text-app-text">{day.dayLabel}</span>
                      {day.hoursShort > 0 ? (
                        <> недобор <span className="font-semibold text-accent-danger">{day.hoursShort} ч</span></>
                      ) : null}
                      {day.reinforcementShort > 0 ? (
                        <> усиление −{day.reinforcementShort} ч</>
                      ) : null}
                      {day.rapidResponseShort > 0 ? (
                        <> МП −{day.rapidResponseShort} ч</>
                      ) : null}
                      {day.shiftLeadShort > 0 ? (
                        <> СтМ −{day.shiftLeadShort} ч</>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
