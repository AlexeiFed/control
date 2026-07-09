"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { Button } from "../ui/button";
import { formatDisplayDateLocal, toDateIsoKhabarovsk, getDayKhabarovsk, getKhabarovskComponents } from "../../lib/format/display-date";

type Option = { id: string; name: string };

type TimesheetFiltersProps = {
  guardOptions: Option[];
  objectOptions: Option[];
  filters: {
    guardId?: string;
    objectId?: string;
    month?: string;
    week?: string;
  };
};

export function TimesheetFilters({ guardOptions, objectOptions, filters }: TimesheetFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const sectionRef = useRef<HTMLDivElement | null>(null);

  const [openMenu, setOpenMenu] = useState<"guard" | "object" | "week" | "month" | null>(null);
  const [guardSearch, setGuardSearch] = useState("");
  const [objectSearch, setObjectSearch] = useState("");
  const [weekSearch, setWeekSearch] = useState("");
  const [guardId, setGuardId] = useState(filters.guardId ?? "");
  const [objectId, setObjectId] = useState(filters.objectId ?? "");
  const [month, setMonth] = useState(filters.month ?? "");
  const [week, setWeek] = useState(filters.week ?? "");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setGuardId(filters.guardId ?? "");
    setObjectId(filters.objectId ?? "");
    setMonth(filters.month ?? "");
    setWeek(filters.week ?? "");
  }, [filters.guardId, filters.objectId, filters.month, filters.week]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!sectionRef.current?.contains(target)) setOpenMenu(null);
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  const selectedGuardLabel = guardId
    ? guardOptions.find((g) => g.id === guardId)?.name ?? "Выбранный охранник"
    : "Все охранники";
  const selectedObjectLabel = objectId
    ? objectOptions.find((o) => o.id === objectId)?.name ?? "Выбранный объект"
    : "Все объекты";

  const filteredGuards = useMemo(() => {
    const normalized = guardSearch.trim().toLowerCase();
    const base = guardOptions.slice().sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
    if (!normalized) return base;
    return base.filter((g) => g.name.toLowerCase().includes(normalized));
  }, [guardOptions, guardSearch]);

  const filteredObjects = useMemo(() => {
    const normalized = objectSearch.trim().toLowerCase();
    const base = objectOptions.slice().sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
    if (!normalized) return base;
    return base.filter((o) => o.name.toLowerCase().includes(normalized));
  }, [objectOptions, objectSearch]);

  const weekOptions = useMemo(() => buildWeekOptions(month), [month]);

  const filteredWeeks = useMemo(() => {
    const normalized = weekSearch.trim().toLowerCase();
    if (!normalized) return weekOptions;
    return weekOptions.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [weekOptions, weekSearch]);

  useEffect(() => {
    if (week && !weekOptions.some((item) => item.id === week)) {
      setWeek("");
      pushNext({ guardId, objectId, month, week: "" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  function buildHref(next: { guardId: string; objectId: string; month: string; week: string }) {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.guardId) params.set("guardId", next.guardId);
    else params.delete("guardId");
    if (next.objectId) params.set("objectId", next.objectId);
    else params.delete("objectId");
    if (next.month) params.set("month", next.month);
    else params.delete("month");
    if (next.week) params.set("week", next.week);
    else params.delete("week");
    params.delete("q");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function pushNext(next: { guardId: string; objectId: string; month: string; week: string }) {
    const href = buildHref(next);
    window.dispatchEvent(new CustomEvent("app:nav-pending", { detail: { pending: true } }));
    startTransition(() => {
      router.replace(href);
    });
  }

  useEffect(() => {
    if (!isPending) {
      window.dispatchEvent(new CustomEvent("app:nav-pending", { detail: { pending: false } }));
    }
  }, [isPending]);

  useEffect(() => {
    if (!month) return;
    const [y, m] = month.split("-").map(Number);
    if (!y || !m) return;
    const prevDate = new Date(y, m - 2, 1);
    const nextDate = new Date(y, m, 1);
    const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
    const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
    router.prefetch(buildHref({ guardId, objectId, month: prevMonth, week: "" }));
    router.prefetch(buildHref({ guardId, objectId, month: nextMonth, week: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, guardId, objectId]);

  const monthLabel = useMemo(() => {
    if (!month) return "Выберите месяц";
    const [y, m] = month.split("-");
    const date = new Date(Number(y), Number(m) - 1, 1);
    return date.toLocaleString("ru-RU", { month: "long", year: "numeric" });
  }, [month]);

  const monthOptions = useMemo(() => {
    const options = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Генерируем список месяцев: 12 месяцев назад и 3 вперед от текущего
    for (let i = -12; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("ru-RU", { month: "long", year: "numeric" });
      options.push({ id: val, label });
    }
    return options.reverse();
  }, []);

  return (
    <>
    {isPending ? (
      <div
        role="status"
        aria-live="polite"
        className="mb-3 flex items-center gap-3 rounded-card border border-accent-primary/40 bg-accent-primary/10 px-3 py-2.5 text-sm text-accent-primary sm:px-4 sm:py-3"
      >
        <span className="inline-block h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-accent-primary" />
        <span className="font-semibold sm:hidden">Обновляем табель…</span>
        <span className="hidden font-semibold sm:inline">
          Обновляем табель… считаем часы и инциденты, это может занять несколько секунд.
        </span>
      </div>
    ) : null}
    <div
      ref={sectionRef}
      className={`grid gap-3 rounded-card border border-app-border bg-app-elevated p-3 sm:p-4 md:grid-cols-2 lg:grid-cols-4 ${isPending ? "pointer-events-none opacity-60" : ""}`}
      onClickCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && !target.closest("[data-dropdown]")) setOpenMenu(null);
      }}
    >
      <div className="grid gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Охранник</span>
        <div className="relative" data-dropdown="guard">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start bg-app-bg font-medium"
            onClick={() => {
              setOpenMenu((current) => (current === "guard" ? null : "guard"));
              setGuardSearch("");
            }}
          >
            {selectedGuardLabel}
          </Button>
          {openMenu === "guard" ? (
            <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              <input
                value={guardSearch}
                onChange={(event) => setGuardSearch(event.target.value)}
                placeholder="Поиск охранника"
                className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
              />
              <div className="max-h-52 overflow-auto overscroll-contain">
                <Button
                  type="button"
                  variant="menu"
                  size="sm"
                  className="mb-1 justify-start text-left"
                  onClick={() => {
                    setGuardId("");
                    setOpenMenu(null);
                    pushNext({ guardId: "", objectId, month, week });
                  }}
                >
                  Все охранники
                </Button>
                {filteredGuards.map((g) => (
                  <Button
                    key={g.id}
                    type="button"
                    variant="menu"
                    size="sm"
                    className="mb-1 justify-start text-left"
                    onClick={() => {
                      setGuardId(g.id);
                      setOpenMenu(null);
                      pushNext({ guardId: g.id, objectId, month, week });
                    }}
                  >
                    {g.name}
                  </Button>
                ))}
                {filteredGuards.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-app-muted">Совпадений нет</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Объект</span>
        <div className="relative" data-dropdown="object">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start bg-app-bg font-medium"
            onClick={() => {
              setOpenMenu((current) => (current === "object" ? null : "object"));
              setObjectSearch("");
            }}
          >
            {selectedObjectLabel}
          </Button>
          {openMenu === "object" ? (
            <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              <input
                value={objectSearch}
                onChange={(event) => setObjectSearch(event.target.value)}
                placeholder="Поиск объекта"
                className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
              />
              <div className="max-h-52 overflow-auto overscroll-contain">
                <Button
                  type="button"
                  variant="menu"
                  size="sm"
                  className="mb-1 justify-start text-left"
                  onClick={() => {
                    setObjectId("");
                    setOpenMenu(null);
                    pushNext({ guardId, objectId: "", month, week });
                  }}
                >
                  Все объекты
                </Button>
                {filteredObjects.map((o) => (
                  <Button
                    key={o.id}
                    type="button"
                    variant="menu"
                    size="sm"
                    className="mb-1 justify-start text-left"
                    onClick={() => {
                      setObjectId(o.id);
                      setOpenMenu(null);
                      pushNext({ guardId, objectId: o.id, month, week });
                    }}
                  >
                    {o.name}
                  </Button>
                ))}
                {filteredObjects.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-app-muted">Совпадений нет</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Месяц</span>
        <div className="relative" data-dropdown="month">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 bg-app-bg"
              onClick={() => {
                const [y, m] = month.split("-").map(Number);
                const prev = new Date(y, m - 2, 1);
                const nextVal = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
                setMonth(nextVal);
                pushNext({ guardId, objectId, month: nextVal, week: "" });
              }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 justify-between bg-app-bg font-medium"
              onClick={() => setOpenMenu((current) => (current === "month" ? null : "month"))}
            >
              <span className="truncate capitalize">{monthLabel}</span>
              <Calendar className="ml-2 h-4 w-4 shrink-0 text-app-muted" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0 bg-app-bg"
              onClick={() => {
                const [y, m] = month.split("-").map(Number);
                const next = new Date(y, m, 1);
                const nextVal = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
                setMonth(nextVal);
                pushNext({ guardId, objectId, month: nextVal, week: "" });
              }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {openMenu === "month" ? (
            <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              <div className="max-h-52 overflow-auto overscroll-contain">
                {monthOptions.map((opt) => (
                  <Button
                    key={opt.id}
                    type="button"
                    variant="menu"
                    size="sm"
                    className={`mb-1 justify-start text-left capitalize ${month === opt.id ? "bg-accent-primary/10 text-accent-primary" : ""}`}
                    onClick={() => {
                      setMonth(opt.id);
                      setOpenMenu(null);
                      pushNext({ guardId, objectId, month: opt.id, week: "" });
                    }}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2 text-sm">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Неделя</span>
        <div className="relative" data-dropdown="week">
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start bg-app-bg font-medium"
            onClick={() => {
              setOpenMenu((current) => (current === "week" ? null : "week"));
              setWeekSearch("");
            }}
          >
            <span className="truncate">
              {week ? weekOptions.find((item) => item.id === week)?.label ?? "Выбранная неделя" : "Все недели"}
            </span>
          </Button>
          {openMenu === "week" ? (
            <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              <input
                value={weekSearch}
                onChange={(event) => setWeekSearch(event.target.value)}
                placeholder="Поиск недели"
                className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
              />
              <div className="max-h-52 overflow-auto overscroll-contain">
                <Button
                  type="button"
                  variant="menu"
                  size="sm"
                  className="mb-1 justify-start text-left"
                  onClick={() => {
                    setWeek("");
                    setOpenMenu(null);
                    pushNext({ guardId, objectId, month, week: "" });
                  }}
                >
                  Все недели
                </Button>
                {filteredWeeks.map((item) => (
                  <Button
                    key={item.id}
                    type="button"
                    variant="menu"
                    size="sm"
                    className="mb-1 justify-start text-left"
                    onClick={() => {
                      setWeek(item.id);
                      setOpenMenu(null);
                      pushNext({ guardId, objectId, month, week: item.id });
                    }}
                  >
                    {item.label}
                  </Button>
                ))}
                {filteredWeeks.length === 0 ? (
                  <div className="px-2 py-2 text-xs text-app-muted">Совпадений нет</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
    </>
  );
}

function buildWeekOptions(monthKey: string): Array<{ id: string; label: string }> {
  const normalized = monthKey.trim();
  if (!/^\d{4}-\d{2}$/.test(normalized)) return [];
  const [yearStr, monthStr] = normalized.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];
  const monthIndex = month - 1;

  // Используем UTC+10 для определения границ месяца
  const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0) - 10 * 3600_000);
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - 10 * 3600_000);

  const firstWeekStart = startOfWeekMonday(start);
  const options: Array<{ id: string; label: string }> = [];
  for (let cursor = firstWeekStart; cursor < end; cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60_000)) {
    const weekStart = cursor;
    const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60_000);
    const label = `Неделя ${formatDisplayDateLocal(weekStart)}–${formatDisplayDateLocal(weekEnd)}`;
    options.push({ id: toDateIsoKhabarovsk(weekStart), label });
  }
  return options;
}

function startOfWeekMonday(date: Date): Date {
  const day = getDayKhabarovsk(date); // 0 вс ... 1 пн
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const kh = getKhabarovskComponents(date);
  // Возвращаем полночь понедельника в Хабаровске
  return new Date(Date.UTC(kh.year, kh.month0, kh.date + mondayOffset, 0, 0, 0, 0) - 10 * 3600_000);
}

