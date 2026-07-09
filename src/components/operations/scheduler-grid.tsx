"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter } from "next/navigation";
import { Button, ButtonLink } from "../ui/button";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import { designTokens } from "../../lib/design-tokens";
import { rateUnitLabels, shiftKindLabels, shiftKindShortLabels, incidentCategoryLabels } from "../../lib/operations/status-labels";
import type { Guard, SecurityObject, Shift, ShiftKind } from "../../lib/scheduling/types";
import {
  formatCompactTimeRangeLocal,
  formatDisplayDateFromIso,
  formatWeekdayDayLabel,
  toDateIso,
  toDateTimeKhabarovsk,
  getDateKhabarovsk,
  getDayKhabarovsk,
  getHoursKhabarovsk,
  toDateIsoKhabarovsk,
  getKhabarovskComponents,
} from "../../lib/format/display-date";
import {
  defaultDayShiftInterval,
  defaultSutkiShiftInterval,
  scheduleShiftColumnDateIso,
  shiftBelongsToOperationalDayColumn,
  tryBuildShiftIntervalFromHm,
} from "../../lib/scheduling/operational-day-timeline";
import { formatGuardLastNameOnly } from "../../lib/format/guard-display";
import { toast } from "../../store/toast-store";
import { Trash2, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { createShiftAction, deleteShiftAction, recordShiftIncidentAction } from "../../app/scheduler/actions";
import {
  listGuardsWithAvailability,
  formatGuardAvailabilityMessage,
  type GuardAvailability,
} from "../../lib/scheduling/replacement-availability";
import { formatGuardOtherObjectsHint } from "../../lib/scheduling/guard-assignment-hints";
import {
  formatGuardAssignmentLabel,
  sortGuardsForShiftAssignment,
} from "../../lib/scheduling/guard-car-sort";
import { dispatchIncidentReplacementsRefresh } from "./global-incident-replacements-banner";
import {
  defaultExpectedShiftsForDay,
  resolveShiftKindForTemplate,
  shiftKindsInTemplate,
  type ExpectedShifts,
} from "../../lib/scheduling/object-shift-templates";
import { computeDayPlanMetrics, formatTemplateCountWithHours } from "../../lib/scheduling/schedule-shortage";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import {
  buildRateRuleTimePresets,
  listManualSelectableRateRules,
  findRateRuleById,
  initializeShiftRateFormFromShift,
  shiftNeedsManualRateRuleSelection,
  shiftDurationMinutesFromTimes,
} from "../../lib/rates/shift-rate-selection";
import {
  ShiftAssignTimeRateFields,
  shiftAssignShowRateSelection,
  shiftAssignSubmitDisabled,
} from "./shift-assign-time-rate-fields";
import { ShiftAssignGuardProfileSummary } from "./shift-assign-guard-profile-summary";

/** Вспомогательная функция для получения времени в формате HH:mm */
function toTime(date: Date): string {
  const kh = getKhabarovskComponents(date);
  return `${String(kh.hours).padStart(2, "0")}:${String(kh.minutes).padStart(2, "0")}`;
}

import { confirmDeleteShift } from "../../lib/scheduling/shift-delete-confirm";

/** localStorage ключ для last-used времени/типа смены. */
const LAST_USED_QUICK_ASSIGN_KEY = "control.scheduler.lastQuickAssign.v1";

function readLastUsedQuickAssign(): { startTime?: string; endTime?: string; shiftKind?: ShiftKind } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_USED_QUICK_ASSIGN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { startTime?: unknown; endTime?: unknown; shiftKind?: unknown };
    return {
      startTime: typeof parsed.startTime === "string" ? parsed.startTime : undefined,
      endTime: typeof parsed.endTime === "string" ? parsed.endTime : undefined,
      shiftKind:
        parsed.shiftKind === "Regular" || parsed.shiftKind === "Reinforcement" || parsed.shiftKind === "RapidResponse" || parsed.shiftKind === "ShiftLead"
          ? (parsed.shiftKind as ShiftKind)
          : undefined,
    };
  } catch {
    return null;
  }
}

function writeLastUsedQuickAssign(value: { startTime: string; endTime: string; shiftKind: ShiftKind }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_USED_QUICK_ASSIGN_KEY, JSON.stringify(value));
  } catch {
    /* noop: localStorage заполнен или недоступен — игнорируем. */
  }
}

/** Русская плюрализация: pluralizeRu(1, "смену", "смены", "смен") → "смену". */
function pluralizeRu(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

type AnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

function readAnchorRect(el: HTMLElement): AnchorRect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

function computePopoverCoords(anchor: AnchorRect, popW: number, popH: number): { left: number; top: number } {
  const margin = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceRight = vw - anchor.right - margin;
  const spaceLeft = anchor.left - margin;
  const preferRight = spaceRight >= popW || spaceRight >= spaceLeft;
  let left = preferRight ? anchor.right + margin : anchor.left - popW - margin;
  left = Math.max(margin, Math.min(left, vw - popW - margin));
  let top = anchor.top;
  top = Math.max(margin, Math.min(top, vh - popH - margin));
  return { left, top };
}

type MonthScheduledGuardRow = { guardId: string; displayName: string };

export type SchedulerGridProps = {
  guards: Guard[];
  objects: SecurityObject[];
  shifts: Shift[];
  /** Ключи `YYYY-MM-DD` (локальная дата заголовка недели), совпадают с `toDateIso` колонок. */
  holidayDateKeys?: ReadonlySet<string>;
  /** Ожидаемые смены по объекту и дню из шаблона сменности. */
  expectedShiftsByObjectDay?: Record<string, Record<string, ExpectedShifts>>;
  /** Охранники с сменами на объекте в месяце, совпадающем с календарём недели `weekStart`. */
  guardsScheduledOnObjectByMonth?: Record<string, ReadonlyArray<MonthScheduledGuardRow>>;
  /** Подпись месяца для блока охранников (напр. «май 2026 г.»). */
  objectMonthTitle?: string;
  /** Правила ставок по objectId (для плашек времени и выбора тарифа). */
  rateRulesByObjectId?: Record<string, ObjectRateRuleRecord[]>;
  currentRole: Role;
  weekStart: Date;
  createShiftAction: (formData: FormData) => Promise<void>;
  createShiftLogAction: (formData: FormData) => Promise<void>;
  /** Action для кнопки «Скопировать прошлую неделю» в строке объекта. */
  cloneObjectWeekShiftsAction?: (formData: FormData) => Promise<void>;
  /** Action для drag-to-fill / мульти-выбора ячеек (massovoe создание смен). */
  bulkCreateShiftsAction?: (
    formData: FormData,
  ) => Promise<{ created: number; skipped: Array<{ objectId: string; dateIso: string; reason: string }> } | void>;
  errorMessage?: string;
  successMessage?: string;
  initialScrollY?: number;
};

const OBJECT_COLUMN_WIDTH = "14rem";

export function SchedulerGrid({
  guards,
  objects,
  shifts,
  holidayDateKeys = new Set<string>(),
  rateRulesByObjectId = {},
  expectedShiftsByObjectDay = {},
  guardsScheduledOnObjectByMonth = {},
  objectMonthTitle = "",
  currentRole,
  weekStart,
  createShiftAction,
  createShiftLogAction,
  cloneObjectWeekShiftsAction,
  bulkCreateShiftsAction,
  errorMessage,
  successMessage,
  initialScrollY,
}: SchedulerGridProps) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const quickScrollYInputRef = useRef<HTMLInputElement | null>(null);
  const quickAssignFormRef = useRef<HTMLFormElement | null>(null);
  const [openQuickMenu, setOpenQuickMenu] = useState<"guard" | null>(null);
  const [quickGuardSearch, setQuickGuardSearch] = useState("");

  const weekDays = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * 24 * 60 * 60_000);
    const iso = toDateIsoKhabarovsk(date);
    return {
      iso,
      label: formatWeekdayDayLabel(date),
      date,
    };
  });
  const weekStartIso = toDateIsoKhabarovsk(weekStart);
  const previousWeek = toDateIsoKhabarovsk(new Date(weekStart.getTime() - 7 * 24 * 60 * 60_000));
  const nextWeek = toDateIsoKhabarovsk(new Date(weekStart.getTime() + 7 * 24 * 60 * 60_000));
  // Текущая дата в Хабаровском часовом поясе и понедельник этой недели — для кнопки «Сегодня» и подсветки колонки.
  const todayIso = useMemo(() => toDateIsoKhabarovsk(new Date()), []);
  const thisMondayIso = useMemo(() => {
    const kh = getKhabarovskComponents(new Date());
    const mondayOffset = kh.dayOfWeek === 0 ? -6 : 1 - kh.dayOfWeek;
    const mondayKh = getKhabarovskComponents(new Date(Date.now() + mondayOffset * 24 * 3600_000));
    return `${mondayKh.year}-${String(mondayKh.month0 + 1).padStart(2, "0")}-${String(mondayKh.date).padStart(2, "0")}`;
  }, []);
  const activeGuards = guards.filter((guard) => guard.status === "Active");
  const canWrite = hasPermission(currentRole, "schedule:write");
  const [selectedGuardId, setSelectedGuardId] = useState(activeGuards[0]?.id ?? "");

  const sortedActiveGuards = useMemo(() => {
    return [...activeGuards].sort((a, b) => {
      return (a.name || "").localeCompare(b.name || "", "ru-RU");
    });
  }, [activeGuards]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const [tableObjectId, setTableObjectId] = useState<string>(() => searchParams.get("objectId") ?? "");
  const [tableObjectSearch, setTableObjectSearch] = useState("");
  const [openTableMenu, setOpenTableMenu] = useState<"table-object" | "month" | "week" | null>(null);
  // Скрываем объекты без смен и без плана на видимой неделе — при большом списке это сильно разгружает таблицу.
  const [hideEmptyObjects, setHideEmptyObjects] = useState(false);

  // Drag-to-fill: тащим карточку смены по строке объекта — на mouseup массово создаём копии в подсвеченных пустых ячейках.
  const [dragSource, setDragSource] = useState<{
    shiftId: string;
    objectId: string;
    sourceDateIso: string;
    guardId: string;
    startTime: string;
    endTime: string;
    shiftKind: ShiftKind;
  } | null>(null);
  const [dragTargetIsos, setDragTargetIsos] = useState<ReadonlySet<string>>(() => new Set());
  
  // -- Month/Week Filter State --
  const initialWeekIso = toDateIsoKhabarovsk(weekStart);
  const [month, setMonth] = useState(() => {
    const kh = getKhabarovskComponents(weekStart);
    return `${kh.year}-${String(kh.month0 + 1).padStart(2, "0")}`;
  });
  const [weekSearch, setWeekSearch] = useState("");
  
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
    for (let i = -12; i <= 3; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("ru-RU", { month: "long", year: "numeric" });
      options.push({ id: val, label });
    }
    return options.reverse();
  }, []);

  const weekOptions = useMemo(() => {
    const normalized = month.trim();
    if (!/^\d{4}-\d{2}$/.test(normalized)) return [];
    const [yearStr, monthStr] = normalized.split("-");
    const year = Number(yearStr);
    const monthNum = Number(monthStr);
    if (!Number.isFinite(year) || !Number.isFinite(monthNum) || monthNum < 1 || monthNum > 12) return [];
    const monthIndex = monthNum - 1;
    const start = new Date(Date.UTC(year, monthIndex, 1, 0, 0, 0, 0) - 10 * 3600_000);
    const end = new Date(Date.UTC(year, monthIndex + 1, 1, 0, 0, 0, 0) - 10 * 3600_000);
    
    // startOfWeekMonday inside
    const day = getDayKhabarovsk(start);
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const kh = getKhabarovskComponents(start);
    const firstWeekStart = new Date(Date.UTC(kh.year, kh.month0, kh.date + mondayOffset, 0, 0, 0, 0) - 10 * 3600_000);
    
    const options: Array<{ id: string; label: string }> = [];
    for (let cursor = firstWeekStart; cursor < end; cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60_000)) {
      const wStart = cursor;
      const wEnd = new Date(wStart.getTime() + 6 * 24 * 60 * 60_000);
      // in Khabarovsk components
      const sKh = getKhabarovskComponents(wStart);
      const eKh = getKhabarovskComponents(wEnd);
      const label = `Неделя ${String(sKh.date).padStart(2, "0")}.${String(sKh.month0 + 1).padStart(2, "0")}.${sKh.year}–${String(eKh.date).padStart(2, "0")}.${String(eKh.month0 + 1).padStart(2, "0")}.${eKh.year}`;
      options.push({ id: toDateIsoKhabarovsk(wStart), label });
    }
    return options;
  }, [month]);

  const filteredWeeks = useMemo(() => {
    const normalized = weekSearch.trim().toLowerCase();
    if (!normalized) return weekOptions;
    return weekOptions.filter((item) => item.label.toLowerCase().includes(normalized));
  }, [weekOptions, weekSearch]);

  const objectAnchorById = useMemo(
    () => new Map(objects.map((item) => [item.id, item.operationalDayStartTime] as const)),
    [objects],
  );

  const resolveObjectAnchor = useCallback(
    (objectId: string) => objectAnchorById.get(objectId) ?? defaultSutkiShiftInterval().startTime,
    [objectAnchorById],
  );

  const shiftBelongsToDayColumn = useCallback(
    (shift: Shift, columnDateIso: string) =>
      shiftBelongsToOperationalDayColumn(shift, columnDateIso, objectAnchorById),
    [objectAnchorById],
  );

  const [quickAssign, setQuickAssign] = useState<{
    objectId: string;
    dateIso: string;
    replaceShiftId?: string;
    startTime?: string;
    endTime?: string;
    shiftKind?: ShiftKind;
  } | null>(null);
  // Инициализируем из last-used localStorage, если есть — это уменьшит ввод при повторных назначениях.
  const [quickStartTime, setQuickStartTime] = useState("08:00");
  const [quickEndTime, setQuickEndTime] = useState("20:00");
  const [quickShiftKind, setQuickShiftKind] = useState<ShiftKind>("Regular");
  const [selectedRateRuleId, setSelectedRateRuleId] = useState("");
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [manualGuardRubles, setManualGuardRubles] = useState("");
  const [manualClientRubles, setManualClientRubles] = useState("");
  const [manualRateUnit, setManualRateUnit] = useState<"Hour" | "Shift">("Hour");
  const [manualRateReason, setManualRateReason] = useState("");
  const [guardSchedulePreview, setGuardSchedulePreview] = useState<{
    guardId: string;
    anchorDateIso: string;
    displayName: string;
    anchor: AnchorRect;
    activeShift?: {
      id: string;
      objectId: string;
      dateIso: string;
      startTime: string;
      endTime: string;
      shiftKind: ShiftKind;
      isNoShow: boolean;
    };
  } | null>(null);
  const [guardPopoverPos, setGuardPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const guardPopoverRef = useRef<HTMLDivElement | null>(null);
  const guardPreviewCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incidentFormScrollRef = useRef<HTMLInputElement | null>(null);
  const [incidentDraft, setIncidentDraft] = useState<{
    shiftId: string;
    objectId: string;
    guardId: string;
    guardName: string;
    dateIso: string;
    startTime: string;
    endTime: string;
    shiftKind: ShiftKind;
  } | null>(null);
  const [incidentModeLocal, setIncidentModeLocal] = useState<"full" | "partial">("full");
  const headerScrollerRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollerRef = useRef<HTMLDivElement | null>(null);
  const lastToastRef = useRef<{ error?: string; success?: string }>({});

  useEffect(() => {
    function onDocumentClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!sectionRef.current?.contains(target)) {
        setOpenQuickMenu(null);
        setOpenTableMenu(null);
      }
    }
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  // Drag-to-fill: пока тянем карточку, отслеживаем целевые ячейки той же строки и завершаем по mouseup.
  useEffect(() => {
    if (!dragSource) return;
    function onMove(event: MouseEvent) {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const td = el?.closest("td[data-day-iso][data-object-id]") as HTMLElement | null;
      if (!td) return;
      // Только пустые ячейки той же строки объекта, не источник.
      const objectId = td.getAttribute("data-object-id");
      const dayIso = td.getAttribute("data-day-iso");
      const isEmpty = td.getAttribute("data-empty") === "true";
      if (!objectId || !dayIso) return;
      if (objectId !== dragSource!.objectId) return;
      if (dayIso === dragSource!.sourceDateIso) return;
      if (!isEmpty) return;
      setDragTargetIsos((prev) => {
        if (prev.has(dayIso)) return prev;
        const next = new Set(prev);
        next.add(dayIso);
        return next;
      });
    }
    function onUp() {
      const targets = Array.from(dragTargetIsos);
      const source = dragSource;
      setDragSource(null);
      setDragTargetIsos(new Set());
      if (!source || targets.length === 0 || !bulkCreateShiftsAction) return;
      const payload = targets.map((dateIso) => ({
        objectId: source.objectId,
        guardId: source.guardId,
        shiftDate: dateIso,
        startTime: source.startTime,
        endTime: source.endTime,
        shiftKind: source.shiftKind,
      }));
      const guardName = guards.find((g) => g.id === source.guardId)?.name ?? "охранник";
      const ok = window.confirm(
        `Создать ${targets.length} ${pluralizeRu(targets.length, "смену", "смены", "смен")} для «${guardName}» (${source.startTime}–${source.endTime})? Конфликты будут пропущены.`,
      );
      if (!ok) return;
      void (async () => {
        const fd = new FormData();
        fd.set("items", JSON.stringify(payload));
        fd.set("weekStart", weekStartIso);
        fd.set("objectIdFilter", tableObjectId);
        fd.set("scrollY", String(window.scrollY));
        fd.set("noRedirect", "true");
        try {
          const result = await bulkCreateShiftsAction(fd);
          if (result && result.created === 0 && result.skipped.length > 0) {
            toast({
              title: "Смены не созданы",
              message: result.skipped[0]?.reason ?? "Не удалось создать смены",
              variant: "error",
              durationMs: 6500,
            });
            return;
          }
          const skipped = result?.skipped.length ?? 0;
          toast({
            title: "Смены созданы",
            message:
              skipped > 0
                ? `Создано ${result?.created ?? 0}, пропущено ${skipped} (конфликт или занятость)`
                : "График обновлён без прокрутки страницы",
            variant: "success",
          });
          router.refresh();
        } catch (err) {
          toast({
            title: "Смены не созданы",
            message: err instanceof Error ? err.message : "Не удалось создать смены",
            variant: "error",
            durationMs: 6500,
          });
        }
      })();
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [dragSource, dragTargetIsos, bulkCreateShiftsAction, guards, weekStartIso, tableObjectId, router]);

  // Клавиатурная навигация по неделям: ← / →. Игнорируем нажатия в полях ввода и при открытых модалках.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      if (quickAssign || incidentDraft || guardSchedulePreview) return;
      const target_iso = event.key === "ArrowLeft" ? previousWeek : nextWeek;
      const params = new URLSearchParams(searchParams.toString());
      params.set("week", target_iso);
      router.replace(`/scheduler?${params.toString()}`, { scroll: false });
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previousWeek, nextWeek, quickAssign, incidentDraft, guardSchedulePreview, router, searchParams]);

  useEffect(() => {
    if (quickAssign) return;
    if (!selectedGuardId && activeGuards[0]) {
      setSelectedGuardId(activeGuards[0].id);
    }
  }, [activeGuards, selectedGuardId, quickAssign]);

  // Инициализация формы только при открытии/смене ячейки — не сбрасываем
  // выбранного охранника при последующем перерендере (иначе нельзя поменять фамилию при замене).
  const lastQuickKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!quickAssign) {
      lastQuickKeyRef.current = null;
      return;
    }
    const key = `${quickAssign.objectId}|${quickAssign.dateIso}|${quickAssign.replaceShiftId ?? ""}|${quickAssign.startTime ?? ""}|${quickAssign.endTime ?? ""}`;
    if (lastQuickKeyRef.current === key) return;
    lastQuickKeyRef.current = key;
    const lastUsed = !quickAssign.replaceShiftId && !quickAssign.startTime && !quickAssign.endTime
      ? readLastUsedQuickAssign()
      : null;
    const replaced = quickAssign.replaceShiftId ? shifts.find((s) => s.id === quickAssign.replaceShiftId) : undefined;
    const expectedForCell =
      expectedShiftsByObjectDay[quickAssign.objectId]?.[quickAssign.dateIso] ?? defaultExpectedShiftsForDay();
    const anchorTime = resolveObjectAnchor(quickAssign.objectId);
    const defaultSutki = defaultSutkiShiftInterval(anchorTime);
    const resolvedShiftKind =
      replaced?.isNoShow
        ? resolveShiftKindForTemplate(expectedForCell, "Regular")
        : resolveShiftKindForTemplate(expectedForCell, quickAssign.shiftKind ?? lastUsed?.shiftKind);
    setQuickShiftKind(resolvedShiftKind);

    const rulesForPreset = rateRulesByObjectId[quickAssign.objectId] ?? [];
    const guardForPreset = selectedGuardId ? guards.find((g) => g.id === selectedGuardId) : undefined;
    const ratePresets =
      guardForPreset && rulesForPreset.length > 0
        ? buildRateRuleTimePresets(
            rulesForPreset,
            quickAssign.objectId,
            guardForPreset,
            resolvedShiftKind,
            quickAssign.dateIso,
            holidayDateKeys,
          )
        : [];

    if (quickAssign.startTime && quickAssign.endTime) {
      setQuickStartTime(quickAssign.startTime);
      setQuickEndTime(quickAssign.endTime);
    } else if (replaced?.incidentWorkedUntilAt) {
      setQuickStartTime(toTime(replaced.incidentWorkedUntilAt));
      setQuickEndTime(toTime(replaced.endsAt));
    } else if (ratePresets[0]) {
      setQuickStartTime(ratePresets[0].startTime);
      setQuickEndTime(ratePresets[0].endTime);
    } else {
      setQuickStartTime(lastUsed?.startTime ?? defaultSutki.startTime);
      setQuickEndTime(lastUsed?.endTime ?? defaultSutki.endTime);
    }
    setQuickGuardSearch("");
    const rateForm = initializeShiftRateFormFromShift(replaced);
    setUseCustomRate(rateForm.useCustomRate);
    setManualGuardRubles(rateForm.manualGuardRubles);
    setManualClientRubles(rateForm.manualClientRubles);
    setManualRateUnit(rateForm.manualRateUnit);
    setManualRateReason(rateForm.manualRateReason);
    if (replaced) {
      setSelectedRateRuleId(rateForm.useCustomRate ? "" : rateForm.selectedRateRuleId);
    } else if (ratePresets[0]?.ruleIds.length === 1 && !quickAssign.startTime && !quickAssign.endTime) {
      setSelectedRateRuleId(ratePresets[0].ruleIds[0]!);
    } else {
      setSelectedRateRuleId("");
    }
    setOpenTableMenu(null);
    setOpenQuickMenu(null);
    setSelectedGuardId("");
  }, [quickAssign, shifts, expectedShiftsByObjectDay, guards, selectedGuardId, rateRulesByObjectId, holidayDateKeys, resolveObjectAnchor]);

  useEffect(() => {
    if (errorMessage && lastToastRef.current.error !== errorMessage) {
      lastToastRef.current.error = errorMessage;
      toast({ title: "Нельзя назначить смену", message: errorMessage, variant: "error", durationMs: 6500 });
    }
    if (successMessage && lastToastRef.current.success !== successMessage) {
      lastToastRef.current.success = successMessage;
      toast({ title: "Смена сохранена", message: successMessage, variant: "success", durationMs: 4000 });
    }
  }, [errorMessage, successMessage]);

  useLayoutEffect(() => {
    if (typeof initialScrollY !== "number") return;
    window.scrollTo(0, initialScrollY);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("scrollY");
    router.replace(`/scheduler?${params.toString()}`, { scroll: false });
  }, [initialScrollY, searchParams, router]);

  useEffect(() => {
    if (!quickAssign) return;
    setGuardSchedulePreview(null);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [quickAssign]);

  useEffect(() => {
    return () => {
      if (guardPreviewCloseTimerRef.current) clearTimeout(guardPreviewCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (incidentDraft) setIncidentModeLocal("full");
  }, [incidentDraft?.shiftId]);

  useLayoutEffect(() => {
    if (!guardSchedulePreview) {
      setGuardPopoverPos(null);
      return;
    }
    const el = guardPopoverRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setGuardPopoverPos(computePopoverCoords(guardSchedulePreview.anchor, width, height));
  }, [guardSchedulePreview]);

  useEffect(() => {
    if (!guardSchedulePreview) return;
    const close = () => setGuardSchedulePreview(null);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    const bodyEl = bodyScrollerRef.current;
    const hdrEl = headerScrollerRef.current;
    bodyEl?.addEventListener("scroll", close, { passive: true });
    hdrEl?.addEventListener("scroll", close, { passive: true });
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      bodyEl?.removeEventListener("scroll", close);
      hdrEl?.removeEventListener("scroll", close);
    };
  }, [guardSchedulePreview]);

  useEffect(() => {
    if (!guardSchedulePreview) return undefined;
    let removeDocClick: (() => void) | undefined;
    const timeoutId = window.setTimeout(() => {
      function onDocumentClick(event: MouseEvent) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        if (guardPopoverRef.current?.contains(target)) return;
        if (target.closest("[data-guard-preview-trigger]")) return;
        setGuardSchedulePreview(null);
        setGuardPopoverPos(null);
      }
      document.addEventListener("click", onDocumentClick);
      removeDocClick = () => document.removeEventListener("click", onDocumentClick);
    }, 0);
    return () => {
      window.clearTimeout(timeoutId);
      removeDocClick?.();
    };
  }, [guardSchedulePreview]);

  function clearGuardPreviewCloseTimer() {
    if (guardPreviewCloseTimerRef.current) {
      clearTimeout(guardPreviewCloseTimerRef.current);
      guardPreviewCloseTimerRef.current = null;
    }
  }

  function openGuardSchedulePreview(
    payload: {
      guardId: string;
      anchorDateIso: string;
      displayName: string;
      activeShift?: {
        id: string;
        objectId: string;
        dateIso: string;
        startTime: string;
        endTime: string;
        shiftKind: ShiftKind;
        isNoShow: boolean;
      };
    },
    anchorEl: HTMLElement,
  ) {
    clearGuardPreviewCloseTimer();
    const anchor = readAnchorRect(anchorEl);
    const estW = Math.min(window.innerWidth - 16, 72 * 16);
    const estH = Math.min(window.innerHeight * 0.72, 28 * 16);
    setGuardPopoverPos(computePopoverCoords(anchor, estW, estH));
    setGuardSchedulePreview({ ...payload, anchor });
  }

  function scheduleCloseGuardSchedulePreview() {
    clearGuardPreviewCloseTimer();
    guardPreviewCloseTimerRef.current = setTimeout(() => {
      setGuardSchedulePreview(null);
      setGuardPopoverPos(null);
      guardPreviewCloseTimerRef.current = null;
    }, 400);
  }

  function openIncidentFromShift(shift: Shift, guardName: string) {
    setIncidentModeLocal("full");
    setIncidentDraft({
      shiftId: shift.id,
      objectId: shift.objectId,
      guardId: shift.guardId,
      guardName,
      dateIso: scheduleShiftColumnDateIso(shift, resolveObjectAnchor(shift.objectId)),
      startTime: toTime(shift.startsAt),
      endTime: toTime(shift.endsAt),
      shiftKind: shift.shiftKind,
    });
    setGuardSchedulePreview(null);
    setGuardPopoverPos(null);
    setQuickAssign(null);
  }

  const guardPreviewDates = useMemo(
    () => (guardSchedulePreview ? buildElevenDayKeys(guardSchedulePreview.anchorDateIso) : []),
    [guardSchedulePreview],
  );

  const guardPreviewObjects = useMemo(() => {
    if (!guardSchedulePreview || guardPreviewDates.length === 0) return [];
    const gid = guardSchedulePreview.guardId;
    const objectIds = new Set(
      shifts
        .filter(
          (s) =>
            s.guardId === gid &&
            guardPreviewDates.some((dateIso) => shiftBelongsToDayColumn(s, dateIso)),
        )
        .map((s) => s.objectId),
    );
    return objects
      .filter((o) => objectIds.has(o.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
  }, [guardSchedulePreview, guardPreviewDates, objects, shifts, shiftBelongsToDayColumn]);

  const filteredTableObjects = useMemo(() => {
    const normalized = tableObjectSearch.trim().toLowerCase();
    if (!normalized) return objects;
    return objects.filter((item) => item.name.toLowerCase().includes(normalized));
  }, [objects, tableObjectSearch]);

  const objectNameById = useMemo(
    () => new Map(objects.map((objectItem) => [objectItem.id, objectItem.name])),
    [objects],
  );

  const quickAssignAnchor = quickAssign ? resolveObjectAnchor(quickAssign.objectId) : defaultSutkiShiftInterval().startTime;

  const quickAssignOccupiedIntervals = useMemo(() => {
    if (!quickAssign || !selectedGuardId) return [];
    const excludeShiftId = quickAssign.replaceShiftId;
    return shifts
      .filter(
        (shift) =>
          shift.guardId === selectedGuardId &&
          shift.isNoShow !== true &&
          (!excludeShiftId || shift.id !== excludeShiftId),
      )
      .map((shift) => ({ startsAt: shift.startsAt, endsAt: shift.endsAt }));
  }, [quickAssign, selectedGuardId, shifts]);

  const quickAssignIntervalMinutes = useMemo(() => {
    if (!quickAssign) return 0;
    return shiftDurationMinutesFromTimes(
      quickAssign.dateIso,
      quickStartTime,
      quickEndTime,
      quickAssignAnchor,
    );
  }, [quickAssign, quickStartTime, quickEndTime, quickAssignAnchor]);

  const quickAssignIntervalReady = quickAssignIntervalMinutes > 0;

  const guardAvailability = useMemo<GuardAvailability<Guard>[]>(() => {
    if (!quickAssign || !quickAssignIntervalReady) return [];
    const interval = tryBuildShiftIntervalFromHm(
      quickAssign.dateIso,
      quickStartTime,
      quickEndTime,
      quickAssignAnchor,
    );
    if (!interval) return [];
    const replaced = quickAssign.replaceShiftId
      ? shifts.find((shift) => shift.id === quickAssign.replaceShiftId)
      : undefined;
    return listGuardsWithAvailability(
      guards,
      shifts,
      { ...interval, objectId: quickAssign.objectId },
      {
        replaceShiftId: quickAssign.replaceShiftId,
        excludeGuardId: replaced?.guardId,
        currentObjectId: quickAssign.objectId,
        assignmentDateIso: quickAssign.dateIso,
      },
    );
  }, [guards, quickAssign, quickStartTime, quickEndTime, quickAssignAnchor, quickAssignIntervalReady, shifts]);

  const filteredGuardAvailability = useMemo(() => {
    if (!quickAssign || !quickAssignIntervalReady) return [];
    const normalized = quickGuardSearch.trim().toLowerCase();
    const searched = normalized
      ? guardAvailability.filter((item) => item.guard.name.toLowerCase().includes(normalized))
      : guardAvailability;
    const assignable = searched.filter((item) => item.available);
    const sortedGuards = sortGuardsForShiftAssignment(assignable.map((item) => item.guard), quickShiftKind, (a, b) =>
      a.name.localeCompare(b.name, "ru-RU"),
    );
    const sortedGuardOrder = new Map(sortedGuards.map((guard, index) => [guard.id, index]));
    return assignable.sort(
      (a, b) => (sortedGuardOrder.get(a.guard.id) ?? 0) - (sortedGuardOrder.get(b.guard.id) ?? 0),
    );
  }, [guardAvailability, quickAssign, quickGuardSearch, quickShiftKind, quickAssignIntervalReady]);

  useEffect(() => {
    if (!quickAssign || !selectedGuardId) return;
    const inList = filteredGuardAvailability.some((item) => item.guard.id === selectedGuardId);
    if (!inList) {
      setSelectedGuardId("");
      setSelectedRateRuleId("");
      setUseCustomRate(false);
    }
  }, [quickAssign, filteredGuardAvailability, selectedGuardId]);

  const selectedGuardAvailability = useMemo(
    () => guardAvailability.find((item) => item.guard.id === selectedGuardId) ?? null,
    [guardAvailability, selectedGuardId],
  );

  const quickObjectRateRules = useMemo(
    () => (quickAssign ? rateRulesByObjectId[quickAssign.objectId] ?? [] : []),
    [quickAssign, rateRulesByObjectId],
  );

  const quickAssignExpectedShifts = useMemo(() => {
    if (!quickAssign) return null;
    return expectedShiftsByObjectDay[quickAssign.objectId]?.[quickAssign.dateIso] ?? defaultExpectedShiftsForDay();
  }, [quickAssign, expectedShiftsByObjectDay]);

  const quickAssignAllowedShiftKinds = useMemo(
    () => (quickAssignExpectedShifts ? shiftKindsInTemplate(quickAssignExpectedShifts) : []),
    [quickAssignExpectedShifts],
  );

  useEffect(() => {
    if (!quickAssign || !quickAssignExpectedShifts) return;
    const resolved = resolveShiftKindForTemplate(quickAssignExpectedShifts, quickShiftKind);
    if (resolved !== quickShiftKind) setQuickShiftKind(resolved);
  }, [quickAssign, quickAssignExpectedShifts, quickShiftKind]);

  const referenceShiftForRates = useMemo(() => {
    if (!quickAssign?.replaceShiftId) return null;
    return shifts.find((shift) => shift.id === quickAssign.replaceShiftId) ?? null;
  }, [quickAssign?.replaceShiftId, shifts]);

  const quickAssignNeedsManualRate = useMemo(() => {
    if (!quickAssign || !selectedGuardAvailability?.guard || quickObjectRateRules.length === 0) return false;
    return shiftNeedsManualRateRuleSelection({
      objectId: quickAssign.objectId,
      guard: selectedGuardAvailability.guard,
      shiftKind: quickShiftKind,
      shiftDateIso: quickAssign.dateIso,
      startTime: quickStartTime,
      endTime: quickEndTime,
      rules: quickObjectRateRules,
      holidayDates: holidayDateKeys,
      manualClientRateCents: referenceShiftForRates?.manualClientRateCents,
      manualGuardRateCents: referenceShiftForRates?.manualGuardRateCents,
      operationalDayStartTime: quickAssignAnchor,
    });
  }, [
    quickAssign,
    selectedGuardAvailability,
    quickObjectRateRules,
    quickShiftKind,
    quickStartTime,
    quickEndTime,
    holidayDateKeys,
    referenceShiftForRates?.manualClientRateCents,
    referenceShiftForRates?.manualGuardRateCents,
    quickAssignAnchor,
  ]);

  const quickAssignShowRateSelectionBlock = useMemo(
    () =>
      shiftAssignShowRateSelection({
        guard: selectedGuardAvailability?.guard ?? null,
        rateRulesCount: quickObjectRateRules.length,
        editingShift: referenceShiftForRates,
        needsManualRate: quickAssignNeedsManualRate,
      }),
    [selectedGuardAvailability?.guard, quickObjectRateRules.length, referenceShiftForRates, quickAssignNeedsManualRate],
  );

  const quickAssignSelectableRulesCount = useMemo(() => {
    if (!quickAssign || !selectedGuardAvailability?.guard) return 0;
    const { dayMatched, otherWeekdays } = listManualSelectableRateRules(
      quickObjectRateRules,
      quickAssign.objectId,
      selectedGuardAvailability.guard,
      quickShiftKind,
      quickAssign.dateIso,
      holidayDateKeys,
    );
    let count = dayMatched.length + otherWeekdays.length;
    if (referenceShiftForRates?.selectedRateRuleId) {
      const pinned = findRateRuleById(quickObjectRateRules, referenceShiftForRates.selectedRateRuleId);
      if (
        pinned &&
        !dayMatched.some((rule) => rule.id === pinned.id) &&
        !otherWeekdays.some((rule) => rule.id === pinned.id)
      ) {
        count += 1;
      }
    }
    return count;
  }, [
    quickAssign,
    selectedGuardAvailability,
    quickObjectRateRules,
    quickShiftKind,
    holidayDateKeys,
    referenceShiftForRates?.selectedRateRuleId,
  ]);

  const selectedGuard = activeGuards.find((item) => item.id === selectedGuardId);
  const selectedTableObject = tableObjectId
    ? objects.find((item) => item.id === tableObjectId)
    : null;
  const visibleObjects = useMemo(() => {
    let list: ReadonlyArray<SecurityObject> = tableObjectId
      ? objects.filter((item) => item.id === tableObjectId)
      : objects;
    if (hideEmptyObjects) {
      const weekEndMs = weekStart.getTime() + 14 * 24 * 3_600_000;
      list = list.filter((obj) => {
        const hasShifts = shifts.some(
          (s) =>
            s.objectId === obj.id &&
            !s.isNoShow &&
            s.startsAt.getTime() < weekEndMs &&
            s.endsAt.getTime() > weekStart.getTime(),
        );
        if (hasShifts) return true;
        const norms = expectedShiftsByObjectDay[obj.id];
        if (!norms) return false;
        return Object.values(norms).some(
          (n) => n.regular > 0 || n.reinforcement > 0 || n.rapidResponse > 0,
        );
      });
    }
    return list;
  }, [objects, tableObjectId, hideEmptyObjects, shifts, weekStart, expectedShiftsByObjectDay]);

  return (
    <section
      ref={sectionRef}
      className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
      onClickCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && !target.closest("[data-dropdown]")) {
          setOpenQuickMenu(null);
          setOpenTableMenu(null);
        }
      }}
    >
      <div className="mb-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Графики смен</h1>
            <p className="mt-2 text-sm text-app-muted">
              Назначение — кнопка «+» в ячейке; тип, интервал и охранник задаются в окне. Стрелки ←/→ переключают неделю.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink
              href={`/scheduler?week=${previousWeek}`}
              variant="secondary"
              scroll={false}
              aria-label="Предыдущая неделя"
              title="Предыдущая неделя (←)"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink
              href={`/scheduler?week=${thisMondayIso}`}
              variant={weekStartIso === thisMondayIso ? "primary" : "secondary"}
              scroll={false}
              title="Перейти на текущую неделю"
            >
              Сегодня
            </ButtonLink>
            <ButtonLink
              href={`/scheduler?week=${nextWeek}`}
              variant="secondary"
              scroll={false}
              aria-label="Следующая неделя"
              title="Следующая неделя (→)"
            >
              <ChevronRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/dashboard" variant="secondary">
              Назад
            </ButtonLink>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 rounded-card border border-app-border bg-app-elevated p-4">
          <div className="text-sm font-semibold">Фильтр таблицы</div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="grid gap-2 text-sm">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-app-muted">Объект</span>
              <div className="relative" data-dropdown="table-object">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-start bg-app-bg"
                  onClick={() =>
                    setOpenTableMenu((current) => {
                      const next = current === "table-object" ? null : "table-object";
                      if (next === "table-object") setTableObjectSearch("");
                      return next;
                    })
                  }
                >
                  <span className="truncate">{selectedTableObject?.name ?? "Все объекты"}</span>
                </Button>
                {openTableMenu === "table-object" ? (
                  <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
                    <input
                      value={tableObjectSearch}
                      onChange={(event) => setTableObjectSearch(event.target.value)}
                      placeholder="Поиск объекта"
                      className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-2 py-2 text-sm text-app-text outline-none focus:border-accent-primary"
                    />
                    <div className="max-h-56 overflow-auto">
                      <Button
                        type="button"
                        variant="menu"
                        size="sm"
                        className="mb-1 justify-start text-left"
                        onClick={() => {
                          setTableObjectId("");
                          setOpenTableMenu(null);
                          const params = new URLSearchParams(searchParams.toString());
                          params.delete("objectId");
                          router.replace(`/scheduler?${params.toString()}`, { scroll: false });
                        }}
                      >
                        Все объекты
                      </Button>
                      {filteredTableObjects.map((item) => (
                        <Button
                          key={item.id}
                          type="button"
                          variant="menu"
                          size="sm"
                          className="mb-1 justify-start text-left"
                          onClick={() => {
                            setTableObjectId(item.id);
                            setOpenTableMenu(null);
                            const params = new URLSearchParams(searchParams.toString());
                            params.set("objectId", item.id);
                            router.replace(`/scheduler?${params.toString()}`, { scroll: false });
                          }}
                        >
                          {item.name}
                        </Button>
                      ))}
                      {filteredTableObjects.length === 0 ? (
                        <div className="px-2 py-2 text-sm text-app-muted">Совпадений нет</div>
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
                    className="h-10 flex-1 justify-between bg-app-bg font-medium"
                    onClick={() => setOpenTableMenu((current) => (current === "month" ? null : "month"))}
                  >
                    <span className="truncate capitalize">{monthLabel}</span>
                    <Calendar className="ml-2 h-4 w-4 shrink-0 text-app-muted" />
                  </Button>
                </div>
                {openTableMenu === "month" ? (
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
                            setOpenTableMenu(null);
                            // Не меняем неделю сразу при смене месяца, просто даем выбрать в след дропдауне
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
                    setOpenTableMenu((current) => (current === "week" ? null : "week"));
                    setWeekSearch("");
                  }}
                >
                  <span className="truncate">
                    {initialWeekIso ? weekOptions.find((item) => item.id === initialWeekIso)?.label ?? "Выбранная неделя" : "Выберите неделю"}
                  </span>
                </Button>
                {openTableMenu === "week" ? (
                  <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
                    <input
                      value={weekSearch}
                      onChange={(event) => setWeekSearch(event.target.value)}
                      placeholder="Поиск недели"
                      className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    />
                    <div className="max-h-52 overflow-auto overscroll-contain">
                      {filteredWeeks.map((item) => (
                        <Button
                          key={item.id}
                          type="button"
                          variant="menu"
                          size="sm"
                          className="mb-1 justify-start text-left"
                          onClick={() => {
                            setOpenTableMenu(null);
                            const params = new URLSearchParams(searchParams.toString());
                            params.set("week", item.id);
                            router.replace(`/scheduler?${params.toString()}`, { scroll: false });
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
          <div className="flex flex-wrap items-center gap-3 border-t border-app-border pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-app-text">
              <input
                type="checkbox"
                checked={hideEmptyObjects}
                onChange={(event) => setHideEmptyObjects(event.target.checked)}
                className="size-4 cursor-pointer rounded border-app-border accent-accent-primary"
              />
              <span>Скрыть объекты без смен и плана</span>
            </label>
            <span className="text-[11px] text-app-muted">
              Показано объектов: <span className="tabular-nums font-medium text-app-text">{visibleObjects.length}</span> из {objects.length}
            </span>
            <a
              href={`/api/scheduler/export/csv?week=${weekStartIso}${tableObjectId ? `&objectId=${encodeURIComponent(tableObjectId)}` : ""}`}
              className="ml-auto inline-flex items-center gap-1 rounded-button border border-app-border bg-app-surface px-3 py-1.5 text-xs font-medium text-app-text transition hover:border-accent-primary/40 hover:bg-accent-primary/5 hover:text-accent-primary"
              title="Скачать CSV со сменами видимой недели (Excel/Numbers)"
              download
            >
              Экспорт CSV
            </a>
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-card border border-app-border bg-app-surface">
        <div className="sticky top-0 z-10 border-b border-app-border bg-app-elevated">
          <div
            ref={headerScrollerRef}
            className="overflow-x-auto"
            onScroll={() => {
              const header = headerScrollerRef.current;
              const body = bodyScrollerRef.current;
              if (!header || !body) return;
              if (body.scrollLeft !== header.scrollLeft) body.scrollLeft = header.scrollLeft;
            }}
          >
            <table className="table-fixed w-full border-separate border-spacing-0 text-left text-sm text-app-muted">
              <colgroup>
                <col style={{ width: OBJECT_COLUMN_WIDTH }} />
                {weekDays.map((day) => (
                  <col key={`col-h-${day.iso}`} style={{ width: `calc((100% - ${OBJECT_COLUMN_WIDTH}) / 14)` }} />
                ))}
              </colgroup>
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] border border-app-border bg-app-elevated px-2 py-2 font-medium">Объект</th>
                  {weekDays.map((day) => {
                    const isHoliday = holidayDateKeys.has(day.iso);
                    const dow = getDayKhabarovsk(day.date);
                    const isWeekend = dow === 0 || dow === 6;
                    const isToday = day.iso === todayIso;
                    const headerStyle: React.CSSProperties = {};
                    if (isHoliday) {
                      headerStyle.backgroundImage = `linear-gradient(135deg, ${designTokens.color.shift.holidayFrom}22, ${designTokens.color.shift.holidayTo}18)`;
                    } else if (isWeekend) {
                      headerStyle.backgroundColor = `${designTokens.color.accent.warning}12`;
                    }
                    if (isToday) {
                      headerStyle.boxShadow = `inset 0 -3px 0 0 ${designTokens.color.accent.primary}`;
                    }
                    return (
                      <th
                        key={`hdr-${day.iso}`}
                        className="border border-app-border bg-app-elevated px-2 py-2 text-center font-medium"
                        style={headerStyle}
                      >
                        <span
                          className="block"
                          style={isToday ? { color: designTokens.color.accent.primary, fontWeight: 700 } : undefined}
                        >
                          {day.label}
                        </span>
                        {isHoliday ? (
                          <span
                            className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: designTokens.color.shift.holidayTo }}
                          >
                            праздник
                          </span>
                        ) : isToday ? (
                          <span
                            className="mt-0.5 block text-[10px] font-semibold uppercase tracking-wider"
                            style={{ color: designTokens.color.accent.primary }}
                          >
                            сегодня
                          </span>
                        ) : null}
                      </th>
                    );
                  })}
                </tr>
              </thead>
            </table>
          </div>
        </div>

        <div
          ref={bodyScrollerRef}
          className="overflow-x-auto"
          onScroll={() => {
            const header = headerScrollerRef.current;
            const body = bodyScrollerRef.current;
            if (!header || !body) return;
            if (header.scrollLeft !== body.scrollLeft) header.scrollLeft = body.scrollLeft;
          }}
        >
          <table className="table-fixed w-full border-separate border-spacing-0 text-left text-sm">
            <colgroup>
              <col style={{ width: OBJECT_COLUMN_WIDTH }} />
              {weekDays.map((day) => (
                <col key={`col-b-${day.iso}`} style={{ width: `calc((100% - ${OBJECT_COLUMN_WIDTH}) / 14)` }} />
              ))}
            </colgroup>
            <tbody>
            {visibleObjects.map((objectItem, objectIndex) => (
              <tr key={objectItem.id} className="align-top">
                <td
                  className={`sticky left-0 z-[1] min-w-0 border border-app-border bg-app-surface px-1 py-1 align-top ${objectIndex > 0 ? "border-t-[6px] border-t-app-bg" : ""}`}
                >
                  <div className="font-semibold break-words">{objectItem.name}</div>
                  {(() => {
                    const objNorms = expectedShiftsByObjectDay[objectItem.id] ?? {};
                    let planRegularHours = 0;
                    let planReinforcementHours = 0;
                    let planMpHours = 0;
                    let planShiftLeadHours = 0;
                    for (const day of weekDays) {
                      const norm = objNorms[day.iso];
                      if (!norm) continue;
                      planRegularHours += norm.regular * norm.shiftHours;
                      planReinforcementHours += norm.reinforcement * norm.reinforcementShiftHours;
                      planMpHours += norm.rapidResponse * norm.rapidResponseShiftHours;
                      planShiftLeadHours += norm.shiftLead * norm.shiftLeadShiftHours;
                    }
                    const objShifts = shifts.filter((s) => s.objectId === objectItem.id && !s.isNoShow);
                    const factRegularHours = Math.round(
                      (objShifts
                        .filter((s) => s.shiftKind === "Regular")
                        .reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0)) * 10,
                    ) / 10;
                    const factReinforcementHours = Math.round(
                      (objShifts
                        .filter((s) => s.shiftKind === "Reinforcement")
                        .reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0)) * 10,
                    ) / 10;
                    const factMpHours = Math.round(
                      (objShifts
                        .filter((s) => s.shiftKind === "RapidResponse")
                        .reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0)) * 10,
                    ) / 10;
                    const factShiftLeadHours = Math.round(
                      (objShifts
                        .filter((s) => s.shiftKind === "ShiftLead")
                        .reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000, 0)) * 10,
                    ) / 10;
                    const shortHours = Math.max(0, planRegularHours - factRegularHours);
                    const shortReinforcementHours = Math.max(0, planReinforcementHours - factReinforcementHours);
                    const shortMpHours = Math.max(0, planMpHours - factMpHours);
                    const shortShiftLeadHours = Math.max(0, planShiftLeadHours - factShiftLeadHours);
                    if (
                      planRegularHours === 0 &&
                      planReinforcementHours === 0 &&
                      planMpHours === 0 &&
                      planShiftLeadHours === 0 &&
                      objShifts.length === 0
                    ) {
                      return null;
                    }
                    return (
                      <div
                        className="mt-1 grid gap-0.5 rounded-button border border-app-border bg-app-elevated px-1.5 py-1 text-[10px] leading-tight"
                        title="Агрегаты по объекту за видимую неделю"
                      >
                        {planRegularHours > 0 ? (
                          <div className="flex items-center justify-between gap-1 tabular-nums">
                            <span className="text-app-muted">осн:</span>
                            <span
                              className="font-semibold"
                              style={{
                                color: shortHours > 0
                                  ? designTokens.color.accent.danger
                                  : designTokens.color.accent.success,
                              }}
                            >
                              {factRegularHours}/{planRegularHours} ч
                              {shortHours > 0 ? ` · −${Math.round(shortHours * 10) / 10}` : ""}
                            </span>
                          </div>
                        ) : factRegularHours > 0 ? (
                          <div className="flex items-center justify-between gap-1 tabular-nums">
                            <span className="text-app-muted">осн:</span>
                            <span className="font-semibold">{factRegularHours} ч</span>
                          </div>
                        ) : null}
                        {planReinforcementHours > 0 || factReinforcementHours > 0 ? (
                          <div className="flex items-center justify-between gap-1 tabular-nums">
                            <span className="text-app-muted">усил:</span>
                            <span
                              className="font-semibold"
                              style={{
                                color: shortReinforcementHours > 0
                                  ? designTokens.color.accent.warning
                                  : designTokens.color.accent.primary,
                              }}
                            >
                              {factReinforcementHours}
                              {planReinforcementHours > 0 ? `/${planReinforcementHours}` : ""} ч
                            </span>
                          </div>
                        ) : null}
                        {planMpHours > 0 || factMpHours > 0 ? (
                          <div className="flex items-center justify-between gap-1 tabular-nums">
                            <span className="text-app-muted">мп:</span>
                            <span
                              className="font-semibold"
                              style={{
                                color: shortMpHours > 0
                                  ? designTokens.color.accent.warning
                                  : designTokens.color.accent.primary,
                              }}
                            >
                              {factMpHours}
                              {planMpHours > 0 ? `/${planMpHours}` : ""} ч
                            </span>
                          </div>
                        ) : null}
                        {planShiftLeadHours > 0 || factShiftLeadHours > 0 ? (
                          <div className="flex items-center justify-between gap-1 tabular-nums">
                            <span className="text-app-muted">СтМ:</span>
                            <span
                              className="font-semibold"
                              style={{
                                color: shortShiftLeadHours > 0
                                  ? designTokens.color.accent.warning
                                  : designTokens.color.accent.primary,
                              }}
                            >
                              {factShiftLeadHours}
                              {planShiftLeadHours > 0 ? `/${planShiftLeadHours}` : ""} ч
                            </span>
                          </div>
                        ) : null}
                      </div>
                    );
                  })()}
                  {canWrite && cloneObjectWeekShiftsAction ? (
                    <form
                      action={cloneObjectWeekShiftsAction}
                      className="mt-1"
                      onSubmit={(event) => {
                        if (!window.confirm(
                          `Скопировать все смены с прошлой недели на текущую для «${objectItem.name}»? Конфликты будут пропущены.`
                        )) {
                          event.preventDefault();
                          return;
                        }
                        const h = event.currentTarget.querySelector('input[name="scrollY"]') as HTMLInputElement | null;
                        if (h) h.value = String(window.scrollY);
                      }}
                    >
                      <input type="hidden" name="objectId" value={objectItem.id} />
                      <input type="hidden" name="sourceMonday" value={previousWeek} />
                      <input type="hidden" name="targetMonday" value={weekStartIso} />
                      <input type="hidden" name="weekStart" value={weekStartIso} />
                      <input type="hidden" name="objectIdFilter" value={tableObjectId} />
                      <input type="hidden" name="scrollY" defaultValue="0" />
                      <button
                        type="submit"
                        className="inline-flex w-full items-center justify-center gap-1 rounded-button border border-app-border bg-app-bg px-1.5 py-1 text-[10px] font-medium text-app-muted transition hover:border-accent-primary/40 hover:bg-accent-primary/5 hover:text-accent-primary"
                        title="Скопировать все смены этого объекта с прошлой недели"
                      >
                        ⓐ Копия прошлой недели
                      </button>
                    </form>
                  ) : null}
                  {objectMonthTitle ? (
                    <div className="mt-1.5 border-t border-app-border pt-1.5">
                      <div
                        className="text-[9px] font-semibold uppercase tracking-[0.14em] text-app-muted"
                        title={`Охранники с запланированными сменами на объекте в ${objectMonthTitle}`}
                      >
                        Охранники · {objectMonthTitle}
                      </div>
                      {(() => {
                        // Чипы охранников: имя + часы на этом объекте в текущей видимой неделе.
                        const monthRows = guardsScheduledOnObjectByMonth[objectItem.id] ?? [];
                        if (monthRows.length === 0) {
                          return <div className="mt-1 text-[10px] text-app-muted">нет в графике</div>;
                        }
                        const weekEndMs = weekStart.getTime() + 14 * 24 * 3_600_000;
                        const weekHoursByGuard = new Map<string, number>();
                        for (const s of shifts) {
                          if (s.objectId !== objectItem.id) continue;
                          if (s.isNoShow) continue;
                          if (s.startsAt.getTime() >= weekEndMs || s.endsAt.getTime() <= weekStart.getTime()) continue;
                          const h = (s.endsAt.getTime() - s.startsAt.getTime()) / 3_600_000;
                          weekHoursByGuard.set(s.guardId, (weekHoursByGuard.get(s.guardId) ?? 0) + h);
                        }
                        return (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {monthRows.map((row) => {
                              const hours = weekHoursByGuard.get(row.guardId) ?? 0;
                              const hasWeekShifts = hours > 0;
                              return (
                                <span
                                  key={row.guardId}
                                  className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] leading-tight ${
                                    hasWeekShifts
                                      ? "border-accent-primary/30 bg-accent-primary/5 text-app-text"
                                      : "border-app-border bg-app-bg/50 text-app-muted"
                                  }`}
                                  title={
                                    hasWeekShifts
                                      ? `${row.displayName} · ${Math.round(hours * 10) / 10} ч на этой неделе`
                                      : `${row.displayName} · нет смен на видимой неделе (есть в ${objectMonthTitle})`
                                  }
                                >
                                  <span className="font-medium">{row.displayName}</span>
                                  {hasWeekShifts ? (
                                    <span className="tabular-nums text-accent-primary">
                                      {Math.round(hours)}ч
                                    </span>
                                  ) : null}
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                  ) : null}
                </td>
                {weekDays.map((day) => {
                  const dowKh = getDayKhabarovsk(day.date);
                  const isWeekend = dowKh === 0 || dowKh === 6;
                  const isHolidayCell = holidayDateKeys.has(day.iso);
                  const isTodayCell = day.iso === todayIso;
                  const dayCellStyle: React.CSSProperties = {};
                  if (isHolidayCell) {
                    dayCellStyle.backgroundImage = `linear-gradient(135deg, ${designTokens.color.shift.holidayFrom}10, ${designTokens.color.shift.holidayTo}08)`;
                  } else if (isWeekend) {
                    dayCellStyle.backgroundColor = `${designTokens.color.accent.warning}08`;
                  }
                  if (isTodayCell) {
                    dayCellStyle.boxShadow = `inset 2px 0 0 0 ${designTokens.color.accent.primary}33, inset -2px 0 0 0 ${designTokens.color.accent.primary}33`;
                  }
                  const dayShifts = shifts
                    .filter(
                      (s) =>
                        s.objectId === objectItem.id && shiftBelongsToDayColumn(s, day.iso),
                    )
                    .sort((a, b) => {
                      const t = a.startsAt.getTime() - b.startsAt.getTime();
                      if (t !== 0) return t;
                      if (a.isNoShow !== b.isNoShow) return a.isNoShow ? -1 : 1;
                      return a.id.localeCompare(b.id);
                    });
                  const totalDayMinutes = dayShifts
                    .filter((s) => !s.isNoShow)
                    .reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 60000, 0);
                  const totalDayHours = Math.round((totalDayMinutes / 60) * 10) / 10;

                  const norms = expectedShiftsByObjectDay[objectItem.id]?.[day.iso];
                  const planMetrics = computeDayPlanMetrics(dayShifts, norms);

                  const emptyCellTooltipParts: string[] = [];
                  if (planMetrics) {
                    if (planMetrics.expectedHoursRegular > 0) {
                      emptyCellTooltipParts.push(`План осн.: ${planMetrics.expectedHoursRegular} ч`);
                    }
                    if (planMetrics.expectedReinforcement > 0) {
                      emptyCellTooltipParts.push(
                        `План усил.: ${formatTemplateCountWithHours(planMetrics.expectedReinforcement, planMetrics.reinforcementShiftHours, "чел.")} (${planMetrics.expectedReinforcementHours} ч)`,
                      );
                    }
                    if (planMetrics.expectedRapidResponse > 0) {
                      emptyCellTooltipParts.push(
                        `План МП: ${planMetrics.expectedRapidResponseHours} ч`,
                      );
                    }
                    if (planMetrics.expectedShiftLead > 0) {
                      emptyCellTooltipParts.push(
                        `План СтМ: ${planMetrics.expectedShiftLeadHours} ч`,
                      );
                    }
                  }
                  if (emptyCellTooltipParts.length === 0) {
                    emptyCellTooltipParts.push("Назначить смену");
                  } else {
                    emptyCellTooltipParts.push("Назначить смену");
                  }
                  const emptyCellTooltip = emptyCellTooltipParts.join(" · ");
                  const hasPlanForEmpty = planMetrics !== null;
                  const isDragTarget = dragTargetIsos.has(day.iso) && dragSource?.objectId === objectItem.id;
                  const dragHighlightStyle = isDragTarget
                    ? {
                        ...dayCellStyle,
                        boxShadow: `inset 0 0 0 2px ${designTokens.color.accent.primary}`,
                        backgroundColor: `${designTokens.color.accent.primary}10`,
                      }
                    : dayCellStyle;
                  return (
                    <td
                      key={`${objectItem.id}-${day.iso}`}
                      data-object-id={objectItem.id}
                      data-day-iso={day.iso}
                      data-empty={dayShifts.length === 0 ? "true" : "false"}
                      className={`min-w-0 border border-app-border px-0.5 py-0.5 align-top ${objectIndex > 0 ? "border-t-[6px] border-t-app-bg" : ""}`}
                      style={dragHighlightStyle}
                    >
                      {dayShifts.length === 0 ? (
                        <div className="grid min-w-0 gap-0.5">
                          {planMetrics ? (
                            <div className="text-center text-[8px] leading-tight text-app-muted">
                              {planMetrics.expectedHoursRegular > 0 ? (
                                <p style={{ color: designTokens.color.accent.warning }}>
                                  осн 0/{planMetrics.expectedHoursRegular}
                                </p>
                              ) : null}
                              {planMetrics.expectedReinforcement > 0 ? (
                                <p style={{ color: designTokens.color.accent.warning }}>
                                  усил 0/{planMetrics.expectedReinforcementHours} ч
                                </p>
                              ) : null}
                              {planMetrics.expectedRapidResponse > 0 ? (
                                <p style={{ color: designTokens.color.accent.warning }}>
                                  мп 0/{planMetrics.expectedRapidResponseHours} ч
                                </p>
                              ) : null}
                              {planMetrics.expectedShiftLead > 0 ? (
                                <p style={{ color: designTokens.color.accent.warning }}>
                                  СтМ 0/{planMetrics.expectedShiftLeadHours} ч
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                          {canWrite ? (
                            <div className="grid min-w-0 gap-0.5">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className={`!h-auto !min-h-0 !gap-0 !px-0.5 !py-1 min-w-0 w-full justify-center text-[14px] font-semibold leading-tight ${hasPlanForEmpty ? "" : "opacity-70"}`}
                                title={emptyCellTooltip}
                                aria-label={emptyCellTooltip}
                                style={hasPlanForEmpty ? { borderColor: `${designTokens.color.accent.warning}66` } : undefined}
                                onClick={() => {
                                  const dayInterval = defaultDayShiftInterval(resolveObjectAnchor(objectItem.id));
                                  setQuickAssign({
                                    objectId: objectItem.id,
                                    dateIso: day.iso,
                                    startTime: dayInterval.startTime,
                                    endTime: dayInterval.endTime,
                                    shiftKind: "Regular",
                                  });
                                }}
                              >
                                +
                              </Button>
                              {planMetrics && planMetrics.expectedReinforcement > 0 ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="!h-auto !min-h-0 !gap-0 !px-0.5 !py-0.5 min-w-0 w-full justify-center text-[9px] font-semibold leading-tight"
                                  title={`Назначить усиление · ${emptyCellTooltip}`}
                                  style={{ borderColor: `${designTokens.color.accent.warning}66` }}
                                  onClick={() => {
                                    const dayInterval = defaultDayShiftInterval(resolveObjectAnchor(objectItem.id));
                                    setQuickAssign({
                                      objectId: objectItem.id,
                                      dateIso: day.iso,
                                      startTime: dayInterval.startTime,
                                      endTime: dayInterval.endTime,
                                      shiftKind: "Reinforcement",
                                    });
                                  }}
                                >
                                  +ус
                                </Button>
                              ) : null}
                              {planMetrics && planMetrics.expectedRapidResponse > 0 ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="!h-auto !min-h-0 !gap-0 !px-0.5 !py-0.5 min-w-0 w-full justify-center text-[9px] font-semibold leading-tight"
                                  title={`Назначить МП · ${emptyCellTooltip}`}
                                  style={{ borderColor: `${designTokens.color.accent.warning}66` }}
                                  onClick={() => {
                                    const dayInterval = defaultDayShiftInterval(resolveObjectAnchor(objectItem.id));
                                    setQuickAssign({
                                      objectId: objectItem.id,
                                      dateIso: day.iso,
                                      startTime: dayInterval.startTime,
                                      endTime: dayInterval.endTime,
                                      shiftKind: "RapidResponse",
                                    });
                                  }}
                                >
                                  +мп
                                </Button>
                              ) : null}
                              {planMetrics && planMetrics.expectedShiftLead > 0 ? (
                                <Button
                                  type="button"
                                  variant="secondary"
                                  size="sm"
                                  className="!h-auto !min-h-0 !gap-0 !px-0.5 !py-0.5 min-w-0 w-full justify-center text-[9px] font-semibold leading-tight"
                                  title={`Назначить СтМ · ${emptyCellTooltip}`}
                                  style={{ borderColor: `${designTokens.color.accent.secondary}66` }}
                                  onClick={() => {
                                    const dayInterval = defaultDayShiftInterval(resolveObjectAnchor(objectItem.id));
                                    setQuickAssign({
                                      objectId: objectItem.id,
                                      dateIso: day.iso,
                                      startTime: dayInterval.startTime,
                                      endTime: dayInterval.endTime,
                                      shiftKind: "ShiftLead",
                                    });
                                  }}
                                >
                                  +СтМ
                                </Button>
                              ) : null}
                            </div>
                          ) : (
                            <div className="rounded-button border border-app-border border-dashed bg-app-bg/30 px-2 py-2 text-center text-xs text-app-muted">
                              —
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid min-w-0 gap-1">
                          {planMetrics ? (
                            <div className="text-[9px] leading-tight text-app-muted">
                              {planMetrics.expectedHoursRegular > 0 ? (
                                <p
                                  className="font-semibold"
                                  style={{
                                    color: planMetrics.hoursShort > 0
                                      ? designTokens.color.accent.warning
                                      : planMetrics.hoursOver > 0
                                        ? designTokens.color.accent.danger
                                        : designTokens.color.accent.primary,
                                  }}
                                  title={
                                    planMetrics.hoursShort > 0
                                      ? `Недобор по основным: ${planMetrics.hoursShort} ч`
                                      : planMetrics.hoursOver > 0
                                        ? `Перебор по основным: ${planMetrics.hoursOver} ч`
                                        : "План по основным закрыт"
                                  }
                                >
                                  осн: {planMetrics.regularDayHours}/{planMetrics.expectedHoursRegular} ч
                                  {planMetrics.hoursShort > 0 ? ` · −${planMetrics.hoursShort}` : null}
                                  {planMetrics.hoursOver > 0 ? ` · +${planMetrics.hoursOver}` : null}
                                </p>
                              ) : null}
                              {planMetrics.expectedReinforcement > 0 ? (
                                <p
                                  style={{
                                    color: planMetrics.reinforcementHoursShort > 0 || planMetrics.reinforcementHoursOver > 0
                                      ? designTokens.color.accent.warning
                                      : designTokens.color.accent.primary,
                                  }}
                                  title={`Усиление: ${planMetrics.reinforcementDayHours}/${planMetrics.expectedReinforcementHours} ч (${formatTemplateCountWithHours(planMetrics.expectedReinforcement, planMetrics.reinforcementShiftHours, "чел.")})`}
                                >
                                  усил: {planMetrics.reinforcementDayHours}/{planMetrics.expectedReinforcementHours} ч
                                  {planMetrics.reinforcementHoursShort > 0 || planMetrics.reinforcementHoursOver > 0 ? (
                                    <span className="ml-0.5 text-accent-danger">!</span>
                                  ) : null}
                                </p>
                              ) : null}
                              {planMetrics.expectedRapidResponse > 0 ? (
                                <p
                                  style={{
                                    color: planMetrics.rapidResponseHoursShort > 0 || planMetrics.rapidResponseHoursOver > 0
                                      ? designTokens.color.accent.warning
                                      : designTokens.color.accent.primary,
                                  }}
                                  title={`МП: ${planMetrics.rapidResponseDayHours}/${planMetrics.expectedRapidResponseHours} ч`}
                                >
                                  мп: {planMetrics.rapidResponseDayHours}/{planMetrics.expectedRapidResponseHours} ч
                                  {planMetrics.rapidResponseHoursShort > 0 ? (
                                    <span className="ml-0.5 text-accent-danger">!</span>
                                  ) : null}
                                </p>
                              ) : null}
                              {planMetrics.expectedShiftLead > 0 ? (
                                <p
                                  style={{
                                    color: planMetrics.shiftLeadHoursShort > 0 || planMetrics.shiftLeadHoursOver > 0
                                      ? designTokens.color.accent.warning
                                      : designTokens.color.accent.primary,
                                  }}
                                  title={`СтМ: ${planMetrics.shiftLeadDayHours}/${planMetrics.expectedShiftLeadHours} ч`}
                                >
                                  СтМ: {planMetrics.shiftLeadDayHours}/{planMetrics.expectedShiftLeadHours} ч
                                  {planMetrics.shiftLeadHoursShort > 0 ? (
                                    <span className="ml-0.5 text-accent-danger">!</span>
                                  ) : null}
                                </p>
                              ) : null}
                              <p className="mt-0.5 border-t border-app-border/30 pt-0.5 text-[8px] text-app-muted">
                                всего: {totalDayHours} ч
                              </p>
                            </div>
                          ) : (
                            <div className="text-[9px] leading-tight text-accent-primary font-bold">
                              всего: {totalDayHours} ч
                            </div>
                          )}

                            {dayShifts.map((shift) => {
                              const guard = guards.find((g) => g.id === shift.guardId);
                              const isReinf = shift.shiftKind === "Reinforcement";
                              const isRapid = shift.shiftKind === "RapidResponse";
                              const isShiftLead = shift.shiftKind === "ShiftLead";
                              const isNoShow = shift.isNoShow;

                              const cardStyle: React.CSSProperties = {};
                              let cardSurface = "border bg-app-bg";
                              if (isNoShow) {
                                cardSurface = "border bg-slate-500/10";
                                cardStyle.borderColor = designTokens.color.border;
                                cardStyle.textDecoration = "line-through";
                              } else if (isReinf) {
                                cardSurface = "border-2";
                                cardStyle.backgroundColor = designTokens.color.shift.reinforcementCellBg;
                                cardStyle.borderColor = designTokens.color.accent.danger;
                              } else if (isRapid) {
                                cardSurface = "border-2";
                                cardStyle.backgroundColor = designTokens.color.shift.mobilePostCellBg;
                                cardStyle.borderColor = designTokens.color.accent.warning;
                              } else if (isShiftLead) {
                                cardSurface = "border-2";
                                cardStyle.backgroundColor = designTokens.color.shiftKind.ShiftLead.bg;
                                cardStyle.borderColor = designTokens.color.shiftKind.ShiftLead.border;
                              } else {
                                cardSurface = "border";
                                cardStyle.backgroundColor = designTokens.color.shift.regularCellBg;
                                cardStyle.borderColor = designTokens.color.border;
                              }

                              const cardLabel = formatGuardLastNameOnly(guard?.name ?? shift.guardId);
                              const timeLine = formatCompactTimeRangeLocal(shift.startsAt, shift.endsAt);
                              const incidentTag =
                                shift.isNoShow && shift.incidentRecordedAt && shift.incidentCategory
                                  ? incidentCategoryLabels[shift.incidentCategory]
                                  : shift.isNoShow
                                    ? "Инцидент"
                                    : null;
                              return (
                                <div key={shift.id} className="group/shift relative min-w-0 w-full">
                                  {canWrite && bulkCreateShiftsAction && !shift.isNoShow ? (
                                    <button
                                      type="button"
                                      title="Тяните, чтобы скопировать смену в другие дни строки"
                                      aria-label="Перетащить смену по строке"
                                      className="absolute right-0.5 top-0.5 z-10 hidden h-3 w-3 cursor-grab items-center justify-center rounded-sm border border-app-border bg-app-surface text-[8px] leading-none text-app-muted shadow-sm group-hover/shift:flex active:cursor-grabbing"
                                      onMouseDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setDragSource({
                                          shiftId: shift.id,
                                          objectId: objectItem.id,
                                          sourceDateIso: day.iso,
                                          guardId: shift.guardId,
                                          startTime: toTime(shift.startsAt),
                                          endTime: toTime(shift.endsAt),
                                          shiftKind: shift.shiftKind,
                                        });
                                        setDragTargetIsos(new Set());
                                      }}
                                    >
                                      ⋮⋮
                                    </button>
                                  ) : null}
                                  <div
                                    className={`flex min-w-0 w-full flex-col items-stretch gap-0 rounded-button px-0.5 py-px text-center text-[10px] leading-tight transition-colors ${cardSurface}`}
                                    style={cardStyle}
                                  >
                                    <button
                                      type="button"
                                      data-guard-preview-trigger
                                      className="w-full cursor-pointer rounded-t-button border-0 bg-transparent px-0 py-0.5 text-center font-semibold text-app-text outline-none hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/35"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        const p = guardSchedulePreview;
                                        const sameOpen =
                                          p &&
                                          p.guardId === shift.guardId &&
                                          p.anchorDateIso === day.iso &&
                                          p.activeShift?.id === shift.id;
                                        if (sameOpen) {
                                          setGuardSchedulePreview(null);
                                          setGuardPopoverPos(null);
                                          return;
                                        }
                                        openGuardSchedulePreview(
                                          {
                                            guardId: shift.guardId,
                                            anchorDateIso: day.iso,
                                            displayName: guard?.name ?? cardLabel,
                                            activeShift: {
                                              id: shift.id,
                                              objectId: objectItem.id,
                                              dateIso: day.iso,
                                              startTime: toTime(shift.startsAt),
                                              endTime: toTime(shift.endsAt),
                                              shiftKind: shift.shiftKind,
                                              isNoShow: shift.isNoShow,
                                            },
                                          },
                                          event.currentTarget,
                                        );
                                      }}
                                    >
                                      <span className="block min-w-0 break-words">{cardLabel}</span>
                                    </button>
                                    <button
                                      type="button"
                                      className="w-full cursor-pointer rounded-b-button border-0 bg-transparent px-0 py-0 text-[9px] text-app-muted outline-none tabular-nums hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/35"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setQuickAssign({
                                          objectId: objectItem.id,
                                          dateIso: day.iso,
                                          replaceShiftId: shift.id,
                                          startTime: toTime(shift.startsAt),
                                          endTime: toTime(shift.endsAt),
                                          shiftKind: shift.shiftKind,
                                        });
                                      }}
                                    >
                                      <time className="block w-full min-w-0">{timeLine}</time>
                                      {incidentTag ? (
                                        <span className="mt-0.5 block w-full text-[8px] font-semibold uppercase leading-none text-accent-danger">
                                          {incidentTag}
                                        </span>
                                      ) : null}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          {canWrite ? (
                            <div className="mt-1 w-full">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="!h-auto !min-h-0 !gap-0 !px-0.5 !py-px w-full justify-center text-[12px] font-semibold leading-tight"
                                title="Добавить смену"
                                aria-label="Добавить смену"
                                onClick={() => {
                                  const dayInterval = defaultDayShiftInterval(resolveObjectAnchor(objectItem.id));
                                  setQuickAssign({
                                    objectId: objectItem.id,
                                    dateIso: day.iso,
                                    startTime: dayInterval.startTime,
                                    endTime: dayInterval.endTime,
                                    shiftKind: "Regular",
                                  });
                                }}
                              >
                                +
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            </tbody>
          </table>
        </div>
      </div>

      {dragSource ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-button border border-accent-primary bg-app-surface px-4 py-2 text-xs font-medium text-app-text shadow-glow"
        >
          Тащите по строке: ячеек выбрано — <span className="tabular-nums font-semibold text-accent-primary">{dragTargetIsos.size}</span>. Отпустите для подтверждения.
        </div>
      ) : null}

      {quickAssign ? (
        <div
          className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4 sm:p-6"
          role="presentation"
          onClick={() => setQuickAssign(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="max-h-[min(92vh,56rem)] w-full max-w-[min(98vw,85rem)] min-h-[min(72vh,42rem)] overflow-y-auto overscroll-contain rounded-card border border-app-border bg-app-surface p-8 sm:p-10 shadow-glow"
            style={{ boxShadow: designTokens.shadow.glow }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 text-app-text">
              <div>
                <div className="text-sm uppercase tracking-[0.24em] text-accent-primary">Быстрое назначение</div>
                <div className="mt-2 text-xl font-semibold">
                  {objects.find((item) => item.id === quickAssign.objectId)?.name ?? "Объект"} •{" "}
                  {formatDisplayDateFromIso(quickAssign.dateIso)}
                </div>
                <div className="mt-1 text-sm text-app-muted">
                  {quickAssign.replaceShiftId ? (
                    (() => {
                      const replaced = shifts.find(s => s.id === quickAssign.replaceShiftId);
                      const replacedGuard = replaced && guards.find(g => g.id === replaced.guardId);
                      return `Замена охранника: ${replacedGuard?.name ?? replaced?.guardId ?? ""}`;
                    })()
                  ) : "Новая смена"}
                </div>
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setQuickAssign(null);
                }}
              >
                Закрыть
              </Button>
            </div>

            <form
              ref={quickAssignFormRef}
              action={createShiftAction}
              className="mt-6 flex flex-col gap-6 rounded-card border border-app-border bg-app-elevated p-6 sm:p-8"
              onSubmit={(event) => {
                if (
                  selectedGuardAvailability &&
                  !selectedGuardAvailability.available
                ) {
                  event.preventDefault();
                  toast({
                    title: "Смена не назначена",
                    message:
                      formatGuardAvailabilityMessage(
                        selectedGuardAvailability.guard.name,
                        selectedGuardAvailability,
                        objectNameById,
                      ) ?? "Охранник недоступен",
                    variant: "error",
                    durationMs: 6500,
                  });
                  return;
                }
                if (quickScrollYInputRef.current) quickScrollYInputRef.current.value = String(window.scrollY);
                // Сохраняем last-used только для обычных назначений, не для замен/инцидентов.
                if (!quickAssign?.replaceShiftId) {
                  writeLastUsedQuickAssign({
                    startTime: quickStartTime,
                    endTime: quickEndTime,
                    shiftKind: quickShiftKind,
                  });
                }
              }}
            >
              <input type="hidden" name="weekStart" value={toDateIso(weekStart)} />
              <input type="hidden" name="objectId" value={quickAssign.objectId} />
              <input type="hidden" name="shiftDate" value={quickAssign.dateIso} />
              <input type="hidden" name="objectIdFilter" value={tableObjectId} />
              <input ref={quickScrollYInputRef} type="hidden" name="scrollY" defaultValue="0" />
              {quickAssign.replaceShiftId ? (
                <input type="hidden" name="replaceShiftId" value={quickAssign.replaceShiftId} />
              ) : null}

              <ShiftAssignTimeRateFields
                objectId={quickAssign.objectId}
                operationalDayStartTime={quickAssignAnchor}
                rateRules={quickObjectRateRules}
                guard={selectedGuardAvailability?.guard ?? null}
                shiftKind={quickShiftKind}
                shiftDateIso={quickAssign.dateIso}
                holidayDateKeys={holidayDateKeys}
                startTime={quickStartTime}
                endTime={quickEndTime}
                onStartTimeChange={(value) => {
                  setQuickStartTime(value);
                  setSelectedRateRuleId("");
                  setUseCustomRate(false);
                }}
                onEndTimeChange={(value) => {
                  setQuickEndTime(value);
                  setSelectedRateRuleId("");
                  setUseCustomRate(false);
                }}
                selectedRateRuleId={selectedRateRuleId}
                onSelectedRateRuleIdChange={setSelectedRateRuleId}
                canSetCustomRate={canWrite}
                showClientRate={canWrite}
                useCustomRate={useCustomRate}
                onUseCustomRateChange={setUseCustomRate}
                manualGuardRubles={manualGuardRubles}
                onManualGuardRublesChange={setManualGuardRubles}
                manualClientRubles={manualClientRubles}
                onManualClientRublesChange={setManualClientRubles}
                manualRateUnit={manualRateUnit}
                onManualRateUnitChange={setManualRateUnit}
                manualRateReason={manualRateReason}
                onManualRateReasonChange={setManualRateReason}
                editingShift={referenceShiftForRates}
                occupiedIntervals={quickAssignOccupiedIntervals}
              />

              <div className="grid gap-6 md:grid-cols-12 md:[&>*]:min-w-0">
                <div className="md:col-span-4 min-w-0">
                  <div className="text-xs font-medium text-app-muted">Охранник</div>
                  <div className="relative mt-1.5" data-dropdown="guard">
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="w-full justify-start bg-app-bg font-normal"
                      disabled={!quickAssignIntervalReady}
                      onClick={() =>
                        setOpenQuickMenu((curr) => (curr === "guard" ? null : "guard"))
                      }
                    >
                      {(() => {
                        if (!quickAssignIntervalReady) return "Сначала укажите время";
                        const g = activeGuards.find((x) => x.id === selectedGuardId);
                        return g
                          ? formatGuardAssignmentLabel(g.name, g.hasCar, quickShiftKind)
                          : "Выберите охранника";
                      })()}
                    </Button>
                    {openQuickMenu === "guard" ? (
                      <div className="absolute z-40 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
                        <input
                          value={quickGuardSearch}
                          onChange={(event) => setQuickGuardSearch(event.target.value)}
                          placeholder="Поиск охранника"
                          className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-2 py-2 text-sm text-app-text outline-none focus:border-accent-primary"
                        />
                        <div
                          className="max-h-56 overflow-auto"
                        >
                          {filteredGuardAvailability.length === 0 ? (
                            <div className="px-2 py-2 text-xs text-app-muted">
                              {quickAssignIntervalReady ? "Нет свободных охранников" : "Сначала укажите время"}
                            </div>
                          ) : null}
                          {filteredGuardAvailability.map((item) => {
                            const g = item.guard;
                            return (
                              <Button
                                key={g.id}
                                type="button"
                                variant="menu"
                                size="sm"
                                className="mb-1 w-full justify-start font-normal"
                                onClick={() => {
                                  setSelectedGuardId(g.id);
                                  setSelectedRateRuleId("");
                                  setUseCustomRate(false);
                                  setOpenQuickMenu(null);
                                }}
                              >
                                {formatGuardAssignmentLabel(g.name, g.hasCar, quickShiftKind)}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <input type="hidden" name="guardId" value={selectedGuardId} />
                  {selectedGuardAvailability &&
                  formatGuardOtherObjectsHint(selectedGuardAvailability, objectNameById) ? (
                    <p
                      className="mt-2 rounded-button border-2 px-2.5 py-1.5 text-xs font-bold leading-snug"
                      style={{
                        borderColor: designTokens.color.accent.warning,
                        backgroundColor: `${designTokens.color.accent.warning}18`,
                        color: designTokens.color.accent.warning,
                      }}
                    >
                      {formatGuardOtherObjectsHint(selectedGuardAvailability, objectNameById)}
                    </p>
                  ) : null}
                  <p className="mt-2 text-[10px] text-app-muted leading-snug">
                    Пересечение по времени с любой сменой охранника запрещено. Суточный лимит — 24 ч.
                  </p>
                  <ShiftAssignGuardProfileSummary
                    guard={selectedGuardAvailability?.guard ?? null}
                    objectId={quickAssign.objectId}
                    rateRules={quickObjectRateRules}
                    shiftKind={quickShiftKind}
                    shiftDateIso={quickAssign.dateIso}
                    holidayDateKeys={holidayDateKeys}
                  />
                </div>

                <div className="md:col-span-4">
                  <label className="grid min-w-0 gap-1.5 text-xs font-medium text-app-muted">
                    Тип
                    <select
                      name="shiftKind"
                      value={quickShiftKind}
                      onChange={(event) => {
                        setQuickShiftKind(event.target.value as ShiftKind);
                        setSelectedGuardId("");
                        setSelectedRateRuleId("");
                        setUseCustomRate(false);
                      }}
                      className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-sm text-app-text outline-none focus:border-accent-primary w-full"
                    >
                      {quickAssignAllowedShiftKinds.includes("Regular") ? (
                        <option value="Regular">{shiftKindLabels.Regular}</option>
                      ) : null}
                      {quickAssignAllowedShiftKinds.includes("Reinforcement") ? (
                        <option value="Reinforcement">{shiftKindLabels.Reinforcement}</option>
                      ) : null}
                      {quickAssignAllowedShiftKinds.includes("RapidResponse") ? (
                        <option value="RapidResponse">{shiftKindLabels.RapidResponse}</option>
                      ) : null}
                      {quickAssignAllowedShiftKinds.includes("ShiftLead") ? (
                        <option value="ShiftLead">{shiftKindLabels.ShiftLead}</option>
                      ) : null}
                    </select>
                  </label>
                </div>

                <div className="md:col-span-8 flex items-end">
                  <div className="flex w-full min-w-0 flex-wrap gap-2">
                    <Button
                      type="submit"
                      disabled={
                        !canWrite ||
                        shiftAssignSubmitDisabled({
                          guardId: selectedGuardId,
                          showRateSelection: quickAssignShowRateSelectionBlock,
                          selectedRateRuleId,
                          manualSelectableRulesCount: quickAssignSelectableRulesCount,
                          useCustomRate,
                          manualGuardRubles,
                          manualRateUnit,
                        })
                      }
                      className="min-w-[8rem] flex-1"
                    >
                      {quickAssign.replaceShiftId ? "Заменить" : "Назначить"}
                    </Button>
                    <input type="hidden" name="isNoShow" value="false" />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        !canWrite ||
                        (quickAssign.replaceShiftId
                          ? !shifts.some((s) => s.id === quickAssign.replaceShiftId) ||
                            !!shifts.find((s) => s.id === quickAssign.replaceShiftId)?.incidentRecordedAt
                          : !selectedGuardId)
                      }
                      className="min-w-[7.5rem] shrink-0 px-4 text-accent-danger border-accent-danger hover:bg-accent-danger/10"
                      onClick={() => {
                        if (quickAssign.replaceShiftId) {
                          const replaced = shifts.find((s) => s.id === quickAssign.replaceShiftId);
                          const guard = replaced && guards.find((g) => g.id === replaced.guardId);
                          if (replaced && !replaced.incidentRecordedAt) {
                            openIncidentFromShift(replaced, guard?.name ?? replaced.guardId);
                            return;
                          }
                        }
                        const form = quickAssignFormRef.current;
                        if (!form) return;
                        const noShowInput = form.querySelector('input[name="isNoShow"]') as HTMLInputElement | null;
                        const guardInput = form.querySelector('input[name="guardId"]') as HTMLInputElement | null;
                        if (!noShowInput || !guardInput) return;
                        const replaced = quickAssign.replaceShiftId
                          ? shifts.find((s) => s.id === quickAssign.replaceShiftId)
                          : undefined;
                        guardInput.value = replaced?.guardId ?? selectedGuardId;
                        noShowInput.value = "true";
                        if (quickScrollYInputRef.current) quickScrollYInputRef.current.value = String(window.scrollY);
                        form.requestSubmit();
                      }}
                    >
                      {quickAssign.replaceShiftId ? "Инцидент" : "Невыход в график"}
                    </Button>
                  </div>
                </div>
              </div>
            </form>

            <div className="mt-4 flex items-center gap-2 text-xs text-app-muted">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-app-elevated text-[10px] font-bold text-app-text">i</span>
              Подсказка: суточная смена — поставь одинаковое время начала и конца (например {quickAssignAnchor} → {quickAssignAnchor} следующего дня).
            </div>
          </div>
        </div>
      ) : null}

      {guardSchedulePreview && guardPopoverPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={guardPopoverRef}
              role="dialog"
              aria-label={`Смены: ${guardSchedulePreview.displayName}`}
              className="pointer-events-auto z-[45] max-h-[min(80vh,32rem)] w-[min(calc(100vw-12px),72rem)] max-w-[min(calc(100vw-12px),72rem)] overflow-y-auto overflow-x-hidden rounded-card border border-app-border bg-app-surface p-2 shadow-glow sm:p-3"
              style={{
                position: "fixed",
                left: guardPopoverPos.left,
                top: guardPopoverPos.top,
                boxShadow: designTokens.shadow.glow,
              }}
              onMouseEnter={clearGuardPreviewCloseTimer}
              onMouseLeave={scheduleCloseGuardSchedulePreview}
            >
              <div className="flex items-start justify-between gap-2 border-b border-app-border pb-2">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] text-accent-primary">Охранник</div>
                  <h2 className="mt-0.5 truncate text-sm font-semibold text-app-text sm:text-base">
                    {guardSchedulePreview.displayName}
                  </h2>
                  {guardSchedulePreview.activeShift && (
                    <div className="mt-2 grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-7 px-2 text-[10px]"
                          onClick={() => {
                            const s = guardSchedulePreview.activeShift!;
                            setQuickAssign({
                              objectId: s.objectId,
                              dateIso: s.dateIso,
                              replaceShiftId: s.id,
                              startTime: s.startTime,
                              endTime: s.endTime,
                              shiftKind: s.shiftKind,
                            });
                            setGuardSchedulePreview(null);
                          }}
                        >
                          Изменить смену
                        </Button>
                        {(() => {
                          const st = shifts.find((x) => x.id === guardSchedulePreview.activeShift!.id);
                          if (!st || st.incidentRecordedAt) return null;
                          return (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-[10px] text-accent-danger border-accent-danger hover:bg-accent-danger/10"
                              onClick={() => openIncidentFromShift(st, guardSchedulePreview.displayName)}
                            >
                              Инцидент
                            </Button>
                          );
                        })()}
                        {canWrite && guardSchedulePreview.activeShift ? (
                          <form
                            action={deleteShiftAction}
                            className="inline-flex"
                            onSubmit={async (e) => {
                              const st = shifts.find((x) => x.id === guardSchedulePreview.activeShift!.id);
                              if (!st || !confirmDeleteShift(st)) {
                                e.preventDefault();
                                return;
                              }
                              e.preventDefault();
                              const fd = new FormData(e.currentTarget);
                              fd.set("scrollY", String(Math.round(window.scrollY)));
                              fd.set("noRedirect", "true");
                              try {
                                await deleteShiftAction(fd);
                                setGuardSchedulePreview(null);
                                toast({
                                  title: "Смена удалена",
                                  message: "График обновлён без прокрутки страницы",
                                  variant: "success",
                                });
                                router.refresh();
                              } catch (err) {
                                toast({
                                  title: "Смена не удалена",
                                  message: err instanceof Error ? err.message : "Не удалось удалить смену",
                                  variant: "error",
                                  durationMs: 6500,
                                });
                              }
                            }}
                          >
                            <input type="hidden" name="shiftId" value={guardSchedulePreview.activeShift.id} />
                            <input type="hidden" name="weekStart" value={weekStartIso} />
                            <input type="hidden" name="objectIdFilter" value={tableObjectId} />
                            <input type="hidden" name="scrollY" defaultValue="0" />
                            <button
                              type="submit"
                              className="inline-flex h-7 shrink-0 items-center justify-center rounded-md border px-2 shadow-sm outline-none transition hover:bg-accent-danger/15 focus-visible:ring-2 focus-visible:ring-accent-danger/40"
                              style={{
                                borderColor: designTokens.color.accent.danger,
                                backgroundColor: designTokens.color.surface,
                                color: designTokens.color.accent.danger,
                              }}
                              title="Удалить смену"
                              aria-label="Удалить смену"
                            >
                              <Trash2 className="size-3.5" strokeWidth={2.25} aria-hidden />
                            </button>
                          </form>
                        ) : null}
                      </div>
                      {canWrite ? (
                        <form
                          action={createShiftLogAction}
                          className="grid gap-2 rounded-button border border-app-border bg-app-elevated p-2"
                          onSubmit={(event) => {
                            const h = event.currentTarget.querySelector('input[name="scrollY"]') as HTMLInputElement | null;
                            if (h) h.value = String(window.scrollY);
                          }}
                        >
                          <input type="hidden" name="shiftId" value={guardSchedulePreview.activeShift.id} />
                          <input type="hidden" name="weekStart" value={weekStartIso} />
                          <input type="hidden" name="objectIdFilter" value={tableObjectId} />
                          <input type="hidden" name="scrollY" defaultValue="0" />
                          <div className="grid gap-2 sm:grid-cols-[10rem_1fr_auto]">
                            <select
                              name="incidentLevel"
                              defaultValue="Info"
                              className="rounded-button border border-app-border bg-app-surface px-2 py-1 text-xs text-app-text outline-none focus:border-accent-primary"
                              required
                            >
                              <option value="None">Без инцидента</option>
                              <option value="Info">Инфо</option>
                              <option value="Warning">Предупреждение</option>
                              <option value="Critical">Критично</option>
                            </select>
                            <input
                              name="note"
                              minLength={3}
                              placeholder="Запись по этой смене"
                              className="rounded-button border border-app-border bg-app-surface px-2 py-1 text-xs text-app-text outline-none focus:border-accent-primary"
                              required
                            />
                            <Button type="submit" size="sm" className="h-7 px-2 text-[10px]">
                              Добавить запись
                            </Button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] leading-snug text-app-muted sm:text-xs">
                    11 суток от{" "}
                    <span className="font-medium text-app-text">
                      {formatDisplayDateFromIso(guardSchedulePreview.anchorDateIso)}
                    </span>
                    : −3…+7. Часы и интервалы по объектам.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-app-muted"
                  onClick={() => {
                    setGuardSchedulePreview(null);
                    setGuardPopoverPos(null);
                  }}
                >
                  ×
                </Button>
              </div>

              <div className="mt-1.5 min-w-0 w-full">
                <table className="table-fixed w-full border-separate border-spacing-0 text-left text-[9px] text-app-text sm:text-[10px]">
                  <colgroup>
                    <col style={{ width: "8.5%" }} />
                    {guardPreviewDates.map((dateIso) => (
                      <col key={`cg-${dateIso}`} style={{ width: `${91.5 / 11}%` }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[1] border border-app-border bg-app-elevated px-0.5 py-1 font-medium">
                        Объект
                      </th>
                      {guardPreviewDates.map((dateIso) => {
                        const isAnchor = dateIso === guardSchedulePreview.anchorDateIso;
                        const labelDate = toDateTimeKhabarovsk(dateIso, "12:00");
                        return (
                          <th
                            key={`pv-${dateIso}`}
                            className={`border border-app-border px-0 py-1 text-center font-medium leading-none ${
                              isAnchor ? "bg-app-elevated" : "bg-app-surface"
                            }`}
                            style={
                              isAnchor
                                ? { boxShadow: `inset 0 0 0 1px ${designTokens.color.accent.primary}` }
                                : undefined
                            }
                          >
                            <span className="block whitespace-nowrap">{formatWeekdayDayLabel(labelDate)}</span>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {guardPreviewObjects.length === 0 ? (
                      <tr>
                        <td
                          className="border border-app-border px-2 py-3 text-center text-app-muted"
                          colSpan={1 + guardPreviewDates.length}
                        >
                          Нет смен в этом окне
                        </td>
                      </tr>
                    ) : (
                      guardPreviewObjects.map((obj) => (
                        <tr key={obj.id}>
                          <td className="sticky left-0 z-[1] border border-app-border bg-app-surface px-0.5 py-1 align-top font-medium break-words">
                            {obj.name}
                          </td>
                          {guardPreviewDates.map((dateIso) => {
                            const cellShifts = shifts
                              .filter(
                                (s) =>
                                  s.guardId === guardSchedulePreview.guardId &&
                                  s.objectId === obj.id &&
                                  shiftBelongsToDayColumn(s, dateIso),
                              )
                              .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
                            return (
                              <td
                                key={`${obj.id}-${dateIso}`}
                                className={`border border-app-border px-0 py-1 text-center align-middle leading-tight ${
                                  dateIso === guardSchedulePreview.anchorDateIso ? "bg-app-bg/40" : ""
                                }`}
                              >
                                {cellShifts.length === 0 ? (
                                  <span className="text-app-muted">—</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-1">
                                    {cellShifts.map((shift) => (
                                      <div
                                        key={shift.id}
                                        className="flex w-full max-w-[5.5rem] flex-col items-stretch gap-0 leading-none"
                                      >
                                        <div className="flex items-start justify-center gap-0.5">
                                          <div className="flex min-w-0 flex-1 flex-col items-center gap-0 leading-none">
                                            <span className="font-medium tabular-nums">
                                              {formatDurationRuHours(shift.startsAt, shift.endsAt)}
                                            </span>
                                            <div className="flex flex-col items-center gap-0.5 mt-0.5">
                                              <span className="text-[8px] font-bold text-accent-primary uppercase tracking-tight">
                                                {(() => {
                                                  const hours = (shift.endsAt.getTime() - shift.startsAt.getTime()) / 3600000;
                                                  const startH = getHoursKhabarovsk(shift.startsAt);
                                                  const endH = getHoursKhabarovsk(shift.endsAt);
                                                  if (hours >= 23) return "сутки";
                                                  if (shift.shiftKind === "Regular") {
                                                    if (startH === 8 && endH === 20) return "день";
                                                    if (startH === 20 && endH === 8) return "ночь";
                                                    return "осн";
                                                  }
                                                  if (shift.shiftKind === "Reinforcement") return "";
                                                  if (shift.shiftKind === "RapidResponse") return shiftKindShortLabels.RapidResponse;
                                                  if (shift.shiftKind === "ShiftLead") return shiftKindShortLabels.ShiftLead;
                                                  return "";
                                                })()}
                                              </span>
                                              <span className="text-[8px] text-app-muted tabular-nums">
                                                {formatCompactTimeRangeLocal(shift.startsAt, shift.endsAt)}
                                              </span>
                                            </div>
                                          </div>
                                          {canWrite ? (
                                            <form
                                              action={deleteShiftAction}
                                              className="shrink-0"
                                              onSubmit={async (e) => {
                                                if (!confirmDeleteShift(shift)) {
                                                  e.preventDefault();
                                                  return;
                                                }
                                                e.preventDefault();
                                                const fd = new FormData(e.currentTarget);
                                                fd.set("scrollY", String(Math.round(window.scrollY)));
                                                fd.set("noRedirect", "true");
                                                try {
                                                  await deleteShiftAction(fd);
                                                  setGuardSchedulePreview(null);
                                                  toast({
                                                    title: "Смена удалена",
                                                    message: "График обновлён без прокрутки страницы",
                                                    variant: "success",
                                                  });
                                                  router.refresh();
                                                } catch (err) {
                                                  toast({
                                                    title: "Смена не удалена",
                                                    message: err instanceof Error ? err.message : "Не удалось удалить смену",
                                                    variant: "error",
                                                    durationMs: 6500,
                                                  });
                                                }
                                              }}
                                            >
                                              <input type="hidden" name="shiftId" value={shift.id} />
                                              <input type="hidden" name="weekStart" value={weekStartIso} />
                                              <input type="hidden" name="objectIdFilter" value={tableObjectId} />
                                              <input type="hidden" name="scrollY" defaultValue="0" />
                                              <button
                                                type="submit"
                                                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border shadow-sm outline-none transition hover:bg-accent-danger/15 focus-visible:ring-2 focus-visible:ring-accent-danger/40"
                                                style={{
                                                  borderColor: designTokens.color.accent.danger,
                                                  backgroundColor: designTokens.color.surface,
                                                  color: designTokens.color.accent.danger,
                                                }}
                                                title="Удалить смену"
                                                aria-label="Удалить смену"
                                              >
                                                <Trash2 className="size-3" strokeWidth={2.5} aria-hidden />
                                              </button>
                                            </form>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>,
            document.body,
          )
        : null}

      {incidentDraft && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={() => setIncidentDraft(null)}
            >
              <div
                role="dialog"
                aria-labelledby="incident-dialog-title"
                className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-card border border-app-border bg-app-surface p-4 shadow-glow"
                style={{ boxShadow: designTokens.shadow.glow }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="incident-dialog-title" className="text-lg font-semibold text-app-text">
                  Инцидент по смене
                </h3>
                <p className="mt-1 text-sm text-app-muted">
                  {incidentDraft.guardName} · {shiftKindLabels[incidentDraft.shiftKind]} ·{" "}
                  {incidentDraft.startTime}–{incidentDraft.endTime} ({incidentDraft.dateIso})
                </p>
                <form
                  key={incidentDraft.shiftId}
                  className="mt-4 grid gap-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.currentTarget);
                    fd.set("incidentMode", incidentModeLocal);
                    const mode = incidentModeLocal;
                    if (mode === "full") {
                      fd.set("category", "FullNoShow");
                    } else {
                      const cp = fd.get("categoryPartial");
                      fd.set("category", cp && String(cp).length ? String(cp) : "LeftWork");
                    }
                    fd.delete("categoryPartial");
                    if (mode === "full") {
                      fd.delete("workedDate");
                      fd.delete("workedTime");
                    }
                    const scrollY = String(Math.max(0, Math.round(window.scrollY)));
                    fd.set("scrollY", scrollY);
                    fd.set("noRedirect", "true");
                    if (incidentFormScrollRef.current) {
                      incidentFormScrollRef.current.value = scrollY;
                    }
                    try {
                      const result = await recordShiftIncidentAction(fd);
                      if (result && !result.ok) {
                        toast({
                          title: "Инцидент не сохранён",
                          message: result.error || "Не удалось зафиксировать инцидент",
                          variant: "error",
                          durationMs: 6500,
                        });
                        return;
                      }
                      setIncidentDraft(null);
                      toast({
                        title: "Инцидент зафиксирован",
                        message: "График обновлён без прокрутки страницы",
                        variant: "success",
                      });
                      router.refresh();
                      dispatchIncidentReplacementsRefresh();
                    } catch (err) {
                      if (isNextRedirectError(err)) {
                        setIncidentDraft(null);
                        return;
                      }
                      toast({
                        title: "Инцидент не сохранён",
                        message: err instanceof Error ? err.message : "Не удалось зафиксировать инцидент",
                        variant: "error",
                        durationMs: 6500,
                      });
                    }
                  }}
                >
                  <input type="hidden" name="shiftId" value={incidentDraft.shiftId} />
                  <input type="hidden" name="shiftObjectId" value={incidentDraft.objectId} />
                  <input type="hidden" name="weekStart" value={toDateIso(weekStart)} />
                  <input type="hidden" name="objectIdFilter" value={tableObjectId} />
                  <input ref={incidentFormScrollRef} type="hidden" name="scrollY" defaultValue="0" />
                  <fieldset className="grid gap-2 border-0 p-0">
                    <legend className="text-xs font-medium text-app-muted">Отработка</legend>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="incidentMode"
                        value="full"
                        checked={incidentModeLocal === "full"}
                        onChange={() => setIncidentModeLocal("full")}
                      />
                      Не вышел на смену (полностью)
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="incidentMode"
                        value="partial"
                        checked={incidentModeLocal === "partial"}
                        onChange={() => setIncidentModeLocal("partial")}
                      />
                      Отработал частично (укажите дату и время ухода / до которых был на посту)
                    </label>
                  </fieldset>
                  {incidentModeLocal === "partial" ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-xs font-medium text-app-muted">
                        Дата (Хабаровск)
                        <input
                          type="date"
                          name="workedDate"
                          required
                          defaultValue={incidentDraft.dateIso}
                          className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-app-muted">
                        Время
                        <input
                          type="time"
                          name="workedTime"
                          required
                          defaultValue={incidentDraft.endTime}
                          className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-sm"
                        />
                      </label>
                      <label className="grid gap-1 text-xs font-medium text-app-muted sm:col-span-2">
                        Тип инцидента
                        <select
                          name="categoryPartial"
                          defaultValue="LeftWork"
                          className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-sm"
                        >
                          <option value="LeftWork">{incidentCategoryLabels.LeftWork}</option>
                          <option value="DrunkOnDuty">{incidentCategoryLabels.DrunkOnDuty}</option>
                          <option value="Other">{incidentCategoryLabels.Other}</option>
                        </select>
                      </label>
                    </div>
                  ) : null}
                  <label className="grid gap-1 text-xs font-medium text-app-muted">
                    Комментарий
                    <textarea
                      name="comment"
                      rows={3}
                      className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-sm"
                      placeholder="Кратко опишите обстоятельства"
                    />
                  </label>
                  <label className="grid gap-1 text-xs font-medium text-app-muted">
                    Замена (необязательно)
                    <select
                      name="replacementGuardId"
                      defaultValue=""
                      className="rounded-button border border-app-border bg-app-surface px-3 py-2 text-sm"
                    >
                      <option value="">— Нет замены (будет напоминание) —</option>
                      {sortedActiveGuards
                        .filter((g) => g.id !== incidentDraft.guardId)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="mt-2 flex flex-wrap justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setIncidentDraft(null)}>
                      Отмена
                    </Button>
                    <Button type="submit" disabled={!canWrite}>
                      Сохранить
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function buildElevenDayKeys(anchorIso: string): string[] {
  return Array.from({ length: 11 }, (_, index) => addDaysToCivilIso(anchorIso, -3 + index));
}

function addDaysToCivilIso(iso: string, deltaDays: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  // Используем UTC для календарных расчетов, чтобы избежать влияния локального часового пояса
  const base = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  base.setUTCDate(base.getUTCDate() + deltaDays);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDurationRuHours(start: Date, end: Date): string {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  if (!Number.isFinite(rounded) || rounded <= 0) return "0ч";
  if (rounded === Math.trunc(rounded)) return `${Math.trunc(rounded)}ч`;
  return `${String(rounded).replace(".", ",")}ч`;
}

