"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Info,
  MapPin,
  Save,
} from "lucide-react";
import { ObjectGuardAssignmentSection } from "./object-guard-assignment-section";
import { ObjectHolidaysSection } from "./object-holidays-section";
import { ObjectPostsAndStaffSection } from "./object-posts-and-staff-section";
import type { MonthlyPostGuardsByPostId } from "../../lib/operations/object-monthly-post-guards-repository";
import { ObjectTimesheetApprovalSection } from "./object-timesheet-approval-section";
import { ObjectShiftTemplateSection } from "./object-shift-template-section";
import { ObjectMonthScheduleGridLazy } from "./object-month-schedule-grid-lazy";
import { readLastUsedQuickAssign } from "./object-month-schedule-grid";
import { normalizeHolidayDateKey, type DayColumnMeta } from "./object-detail-schedule-styles";
import { setObjectGuardsAction, updateObjectAction } from "../../app/objects/actions";
import {
  createShiftAction,
  recordShiftIncidentAction,
  updateShiftAction,
} from "../../app/scheduler/actions";
import { Button, ButtonLink } from "../ui/button";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import type { GuardSchedulePickerRow } from "../../lib/operations/guards-repository";
import type { ObjectHolidayRecord } from "../../lib/operations/object-holidays-repository";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import type { ObjectPost } from "../../lib/operations/object-posts-repository";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import type { ObjectShiftTemplateRow } from "../../lib/operations/shift-templates-repository";
import type { ObjectMonthScheduledGuard } from "../../lib/operations/scheduler-repository";
import type { Shift, ShiftKind } from "../../lib/scheduling/types";
import { toast } from "../../store/toast-store";
import { designTokens } from "../../lib/design-tokens";
import { dispatchIncidentReplacementsRefresh } from "./global-incident-replacements-banner";
import { ObjectRateRulesPanel } from "./object-rate-rules-panel";
import { ObjectSwitchTabs } from "./object-switch-tabs";
import { shiftKindLabels, incidentCategoryLabels } from "../../lib/operations/status-labels";
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
  getDaysInMonth,
  getKhabarovskComponents,
  addDaysToIsoDate,
} from "../../lib/format/display-date";
import { shiftMatchesPost } from "../../lib/scheduling/shift-post-display";
import {
  defaultSutkiShiftInterval,
  normalizeOperationalAnchorTime,
  scheduleShiftColumnDateIso,
  shiftBelongsToOperationalDayColumn,
  tryBuildShiftIntervalFromHm,
} from "../../lib/scheduling/operational-day-timeline";
import {
  listGuardsWithAvailability,
  formatRequestedGuardSubstitutionHint,
  formatGuardAvailabilityMessage,
} from "../../lib/scheduling/replacement-availability";
import { formatGuardOtherObjectsHint } from "../../lib/scheduling/guard-assignment-hints";
import {
  formatGuardAssignmentLabel,
  sortGuardsForShiftAssignment,
} from "../../lib/scheduling/guard-car-sort";
import {
  buildExpectedShiftsForLocalMonth,
  defaultExpectedShiftsForDay,
  dominantTemplateEffectiveFromForMonth,
  localMonthDateIso,
  resolveShiftKindForTemplate,
  shiftKindsInTemplate,
  weeklyExpectedShiftsFromDateMap,
  type ExpectedShifts,
} from "../../lib/scheduling/object-shift-templates";
import {
  findRateRuleById,
  guardListRowToSchedulerGuard,
  initializeShiftRateFormFromShift,
  listManualSelectableRateRules,
  buildRateRuleTimePresets,
  shiftNeedsManualRateRuleSelection,
  shiftDurationMinutesFromTimes,
} from "../../lib/rates/shift-rate-selection";
import {
  ShiftAssignTimeRateFields,
  shiftAssignShowRateSelection,
  shiftAssignSubmitDisabled,
} from "./shift-assign-time-rate-fields";
import { ShiftAssignGuardProfileSummary } from "./shift-assign-guard-profile-summary";

import type { ObjectSwitchTabRow } from "../../lib/operations/objects-repository";

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

function buildElevenDayKeys(anchorIso: string): string[] {
  return Array.from({ length: 11 }, (_, index) => addDaysToCivilIso(anchorIso, -3 + index));
}

function formatDurationRuHours(start: Date, end: Date): string {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  if (!Number.isFinite(rounded) || rounded <= 0) return "0ч";
  if (rounded === Math.trunc(rounded)) return `${Math.trunc(rounded)}ч`;
  return `${String(rounded).replace(".", ",")}ч`;
}


const LAST_USED_QUICK_ASSIGN_KEY = "control.scheduler.lastQuickAssign.v1";

function formatAssignmentDateLabel(dateIso: string): string {
  const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"] as const;
  const d = new Date(`${dateIso}T12:00:00+10:00`);
  return `${weekdays[getDayKhabarovsk(d)]}, ${formatDisplayDateFromIso(dateIso)}`;
}

function writeLastUsedQuickAssign(value: { startTime: string; endTime: string; shiftKind: ShiftKind }) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_USED_QUICK_ASSIGN_KEY, JSON.stringify(value));
  } catch {
    /* noop */
  }
}

export type ObjectDetailViewProps = {
  object: ObjectListRow;
  posts: ObjectPost[];
  gridGuardNames: Record<string, string>;
  rateRules: ObjectRateRuleRecord[];
  /** План смен по каждой дате месяца (версии шаблона + наследование МП/усиления). */
  expectedShiftsByDateIso: Record<string, ExpectedShifts>;
  shiftTemplates: ObjectShiftTemplateRow[];
  currentRole: Role;
  objectHolidays: ObjectHolidayRecord[];
  /** Глобальный календарь праздников (admin/holidays) за видимый месяц. */
  globalHolidayDateKeys?: readonly string[];
  scheduledGuards: ObjectMonthScheduledGuard[];
  shifts: Shift[];
  /** Смены всех объектов за месяц — для проверки пересечений и подсказки «на других объектах». */
  monthAvailabilityShifts: Shift[];
  viewYear: number;
  viewMonth0: number;
  error?: string;
  success?: string;
  /** Восстановление вертикальной прокрутки после server action (удаление смены и т.п.) */
  initialScrollY?: number;
  bulkCreateShiftsAction?: (
    formData: FormData,
  ) => Promise<{ created: number; skipped: Array<{ objectId: string; dateIso: string; reason: string }> } | void>;
  operationalDayStartTime: string;
  monthlyPostGuardsByPostId: MonthlyPostGuardsByPostId;
};

function toTimeKh(date: Date): string {
  const kh = getKhabarovskComponents(date);
  return `${String(kh.hours).padStart(2, "0")}:${String(kh.minutes).padStart(2, "0")}`;
}

type ShiftApiRow = Omit<Shift, "startsAt" | "endsAt" | "incidentWorkedUntilAt" | "incidentRecordedAt"> & {
  startsAt: string;
  endsAt: string;
  incidentWorkedUntilAt: string | null;
  incidentRecordedAt: string | null;
};

function parseShiftFromApi(row: ShiftApiRow): Shift {
  return {
    ...row,
    startsAt: new Date(row.startsAt),
    endsAt: new Date(row.endsAt),
    incidentWorkedUntilAt: row.incidentWorkedUntilAt ? new Date(row.incidentWorkedUntilAt) : null,
    incidentRecordedAt: row.incidentRecordedAt ? new Date(row.incidentRecordedAt) : null,
  };
}

function normalizeShiftDates(shift: Shift): Shift {
  if (
    shift.startsAt instanceof Date &&
    shift.endsAt instanceof Date &&
    (!shift.incidentWorkedUntilAt || shift.incidentWorkedUntilAt instanceof Date) &&
    (!shift.incidentRecordedAt || shift.incidentRecordedAt instanceof Date)
  ) {
    return shift;
  }
  return parseShiftFromApi(shift as unknown as ShiftApiRow);
}

export function ObjectDetailView({
  object,
  posts,
  gridGuardNames,
  rateRules,
  expectedShiftsByDateIso,
  shiftTemplates,
  currentRole,
  objectHolidays,
  globalHolidayDateKeys = [],
  scheduledGuards,
  shifts,
  monthAvailabilityShifts,
  viewYear,
  viewMonth0,
  error,
  success,
  initialScrollY,
  bulkCreateShiftsAction,
  operationalDayStartTime,
  monthlyPostGuardsByPostId,
}: ObjectDetailViewProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [guardSearch, setGuardSearch] = useState("");
  const [quickAssign, setQuickAssign] = useState<{
    guardId?: string;
    dateIso: string;
    shiftKind: "Regular" | "Reinforcement" | "RapidResponse" | "ShiftLead";
    editingShiftId?: string;
    replaceShiftId?: string;
    replacedGuardName?: string;
    startTime?: string;
    endTime?: string;
    postId?: string | null;
  } | null>(null);
  const operationalAnchor = normalizeOperationalAnchorTime(operationalDayStartTime);
  const defaultSutki = useMemo(() => defaultSutkiShiftInterval(operationalAnchor), [operationalAnchor]);
  const [quickStartTime, setQuickStartTime] = useState(defaultSutki.startTime);
  const [quickEndTime, setQuickEndTime] = useState(defaultSutki.endTime);
  const [quickModalGuardId, setQuickModalGuardId] = useState("");
  const [quickAssignGuardSearch, setQuickAssignGuardSearch] = useState("");
  const [quickAssignGuardMenuOpen, setQuickAssignGuardMenuOpen] = useState(false);
  const [selectedRateRuleId, setSelectedRateRuleId] = useState("");
  const [useCustomRate, setUseCustomRate] = useState(false);
  const [manualGuardRubles, setManualGuardRubles] = useState("");
  const [manualClientRubles, setManualClientRubles] = useState("");
  const [manualRateUnit, setManualRateUnit] = useState<"Hour" | "Shift">("Hour");
  const [manualRateReason, setManualRateReason] = useState("");
  const quickAssignScrollRef = useRef<HTMLInputElement | null>(null);
  const lastQuickAssignKeyRef = useRef<string | null>(null);

  const [incidentDraft, setIncidentDraft] = useState<{
    shiftId: string;
    objectId: string;
    guardId: string;
    guardName: string;
    dateIso: string;
    startTime: string;
    endTime: string;
    shiftKind: "Regular" | "Reinforcement" | "RapidResponse" | "ShiftLead";
  } | null>(null);
  const [incidentModeLocal, setIncidentModeLocal] = useState<"full" | "partial">("full");
  const incidentFormScrollRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (incidentDraft) setIncidentModeLocal("full");
  }, [incidentDraft?.shiftId]);

  const [guardSchedulePreview, setGuardSchedulePreview] = useState<{
    guardId: string;
    anchorDateIso: string;
    displayName: string;
    anchor: AnchorRect;
  } | null>(null);
  const [guardPopoverPos, setGuardPopoverPos] = useState<{ left: number; top: number } | null>(null);
  const guardPopoverRef = useRef<HTMLDivElement | null>(null);
  const guardPreviewCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [guardPreviewShifts, setGuardPreviewShifts] = useState<Shift[]>([]);
  const [pickerGuards, setPickerGuards] = useState<GuardSchedulePickerRow[] | null>(null);
  const [pickerGuardsLoading, setPickerGuardsLoading] = useState(false);
  const pickerGuardsRequestRef = useRef(false);
  const [switchObjects, setSwitchObjects] = useState<ObjectSwitchTabRow[] | null>(null);

  const canWrite = hasPermission(currentRole, "schedule:write");
  const canManageOperationalDay = hasPermission(currentRole, "objects:manage");
  const canEditTemplates = hasPermission(currentRole, "scheduleTemplates:manage");
  const showRatesSection = hasPermission(currentRole, "rates:read");

  const templateSections = useMemo(() => {
    if (posts.length === 0) {
      const expected = buildExpectedShiftsForLocalMonth(
        object.id,
        viewYear,
        viewMonth0,
        shiftTemplates,
        null,
      );
      return [
        {
          postId: null as string | null,
          postName: null as string | null,
          sequence: weeklyExpectedShiftsFromDateMap(expected, viewYear, viewMonth0),
          effectiveFrom: dominantTemplateEffectiveFromForMonth(
            shiftTemplates,
            object.id,
            viewYear,
            viewMonth0,
            null,
          ),
        },
      ];
    }
    return posts.map((post) => {
      const expected = buildExpectedShiftsForLocalMonth(
        object.id,
        viewYear,
        viewMonth0,
        shiftTemplates,
        post.id,
      );
      return {
        postId: post.id,
        postName: post.name,
        sequence: weeklyExpectedShiftsFromDateMap(expected, viewYear, viewMonth0),
        effectiveFrom: dominantTemplateEffectiveFromForMonth(
          shiftTemplates,
          object.id,
          viewYear,
          viewMonth0,
          post.id,
        ),
      };
    });
  }, [posts, object.id, viewYear, viewMonth0, shiftTemplates]);

  const lastToastRef = useRef<{ error?: string; success?: string }>({});

  useEffect(() => {
    if (error && lastToastRef.current.error !== error) {
      lastToastRef.current.error = error;
      toast({ title: "Ошибка", message: error, variant: "error" });
    }
    if (success && lastToastRef.current.success !== success) {
      lastToastRef.current.success = success;
      const parseBulkStats = (prefix: string, label: string): string | undefined => {
        if (!success.startsWith(prefix)) return undefined;
        const rest = success.slice(prefix.length);
        const [createdRaw, totalRaw] = rest.split("/");
        const created = Number(createdRaw);
        const total = totalRaw ? Number(totalRaw) : created;
        if (!Number.isFinite(created) || !Number.isFinite(total)) return undefined;
        return total > created
          ? `${label}: ${created}/${total} (${total - created} пропущено — конфликты или дубли)`
          : `${label}: ${created}`;
      };
      const msg =
        success === "shift-deleted"
          ? "Смена удалена"
          : success === "shift-created"
            ? "Смена создана"
            : success === "incident-recorded"
              ? "Инцидент зафиксирован"
              : parseBulkStats("bulk-create:", "Создано смен") ?? success;
      toast({ title: "Успех", message: msg, variant: "success" });
    }
  }, [error, success]);

  useLayoutEffect(() => {
    if (initialScrollY == null || !Number.isFinite(initialScrollY)) return;
    window.scrollTo(0, initialScrollY);
    const params = new URLSearchParams(window.location.search);
    params.delete("scrollY");
    params.delete("success");
    params.delete("error");
    const path = window.location.pathname;
    const next = params.toString() ? `${path}?${params.toString()}` : path;
    router.replace(next, { scroll: false });
  }, [initialScrollY, router]);

  useEffect(() => {
    return () => {
      if (guardPreviewCloseTimerRef.current) clearTimeout(guardPreviewCloseTimerRef.current);
    };
  }, []);

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
    if (!guardSchedulePreview) {
      setGuardPreviewShifts([]);
      return;
    }
    let cancelled = false;
    const { guardId } = guardSchedulePreview;
    const month = viewMonth0 + 1;
    void (async () => {
      try {
        const res = await fetch(
          `/api/scheduler/shifts-query?guardId=${encodeURIComponent(guardId)}&year=${viewYear}&month=${month}`,
          { credentials: "same-origin" },
        );
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { ok?: boolean; shifts?: ShiftApiRow[] };
        if (body.ok && Array.isArray(body.shifts) && !cancelled) {
          setGuardPreviewShifts(body.shifts.map(parseShiftFromApi));
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guardSchedulePreview, viewYear, viewMonth0]);

  const shiftsForAvailability = useMemo(() => monthAvailabilityShifts, [monthAvailabilityShifts]);

  const ensurePickerGuards = useCallback(async () => {
    if (pickerGuards !== null || pickerGuardsRequestRef.current) return;
    pickerGuardsRequestRef.current = true;
    setPickerGuardsLoading(true);
    try {
      const res = await fetch("/api/guards/schedule-picker", { credentials: "same-origin" });
      if (!res.ok) return;
      const body = (await res.json()) as { ok?: boolean; guards?: GuardSchedulePickerRow[] };
      if (body.ok && Array.isArray(body.guards)) {
        setPickerGuards(body.guards);
      }
    } catch {
      /* ignore */
    } finally {
      setPickerGuardsLoading(false);
    }
  }, [pickerGuards]);

  useEffect(() => {
    if (quickAssign || incidentDraft) {
      void ensurePickerGuards();
    }
  }, [quickAssign, incidentDraft, ensurePickerGuards]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/objects/switch-tabs", { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const body = (await res.json()) as { ok?: boolean; objects?: ObjectSwitchTabRow[] };
        if (body.ok && Array.isArray(body.objects) && !cancelled) {
          setSwitchObjects(body.objects);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (guardSchedulePreview && switchObjects === null) {
      void (async () => {
        try {
          const res = await fetch("/api/objects/switch-tabs", { credentials: "same-origin" });
          if (!res.ok) return;
          const body = (await res.json()) as { ok?: boolean; objects?: ObjectSwitchTabRow[] };
          if (body.ok && Array.isArray(body.objects)) setSwitchObjects(body.objects);
        } catch {
          /* ignore */
        }
      })();
    }
  }, [guardSchedulePreview, switchObjects]);

  function clearGuardPreviewCloseTimer() {
    if (guardPreviewCloseTimerRef.current) {
      clearTimeout(guardPreviewCloseTimerRef.current);
      guardPreviewCloseTimerRef.current = null;
    }
  }

  function openGuardSchedulePreview(
    payload: { guardId: string; anchorDateIso: string; displayName: string },
    anchorEl: HTMLElement,
  ) {
    clearGuardPreviewCloseTimer();
    const anchor = readAnchorRect(anchorEl);
    const estW = Math.min(window.innerWidth - 16, 96 * 16);
    const estH = Math.min(window.innerHeight * 0.85, 40 * 16);
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

  const objectAnchorById = useMemo(() => {
    const map = new Map<string, string>();
    map.set(object.id, operationalAnchor);
    for (const objectItem of switchObjects ?? []) {
      map.set(objectItem.id, objectItem.operationalDayStartTime);
    }
    return map;
  }, [object.id, operationalAnchor, switchObjects]);

  const shiftBelongsToDayColumn = useCallback(
    (shift: Shift, columnDateIso: string) =>
      shiftBelongsToOperationalDayColumn(shift, columnDateIso, objectAnchorById),
    [objectAnchorById],
  );

  const objectNameById = useMemo(() => {
    const map = new Map((switchObjects ?? []).map((objectItem) => [objectItem.id, objectItem.name]));
    map.set(object.id, object.name);
    return map;
  }, [switchObjects, object.id, object.name]);

  // На детальной странице объекта в превью показываем ВЕСЬ текущий месяц по другим объектам.
  const guardPreviewDates = useMemo(() => {
    if (!guardSchedulePreview) return [];
    const dim = getDaysInMonth(viewYear, viewMonth0);
    return Array.from({ length: dim }, (_, i) => {
      const day = i + 1;
      const m = String(viewMonth0 + 1).padStart(2, "0");
      const d = String(day).padStart(2, "0");
      return `${viewYear}-${m}-${d}`;
    });
  }, [guardSchedulePreview, viewYear, viewMonth0]);

  const guardPreviewObjects = useMemo(() => {
    if (!guardSchedulePreview || guardPreviewDates.length === 0) return [];
    const gid = guardSchedulePreview.guardId;
    const otherObjectIds = new Set(
      guardPreviewShifts
        .filter(
          (s) =>
            s.guardId === gid &&
            s.objectId !== object.id &&
            guardPreviewDates.some((dateIso) => shiftBelongsToDayColumn(s, dateIso)),
        )
        .map((s) => s.objectId),
    );

    return Array.from(otherObjectIds)
      .map((id) => ({ id, name: objectNameById.get(id) ?? "…" }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru-RU"));
  }, [guardSchedulePreview, guardPreviewDates, guardPreviewShifts, objectNameById, object.id, shiftBelongsToDayColumn]);

  const daysInMonth = getDaysInMonth(viewYear, viewMonth0);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const todayIso = useMemo(() => toDateIsoKhabarovsk(new Date()), []);

  const holidayDateKeys = useMemo(() => {
    const keys = new Set(globalHolidayDateKeys.map(normalizeHolidayDateKey));
    for (const h of objectHolidays) {
      keys.add(normalizeHolidayDateKey(h.holidayDate));
    }
    return keys;
  }, [globalHolidayDateKeys, objectHolidays]);

  const dayColumnMetaByDay = useMemo(() => {
    const map = new Map<number, DayColumnMeta>();
    for (const d of days) {
      const dateIso = localMonthDateIso(viewYear, viewMonth0, d);
      const date = new Date(`${dateIso}T12:00:00+10:00`);
      const dow = getDayKhabarovsk(date);
      map.set(d, {
        dateIso,
        isWeekend: dow === 0 || dow === 6,
        isHoliday: holidayDateKeys.has(dateIso),
        isToday: dateIso === todayIso,
      });
    }
    return map;
  }, [days, viewYear, viewMonth0, holidayDateKeys, todayIso]);

  const monthPlan = useMemo(() => {
    const plan: Record<number, ExpectedShifts> = {};
    for (const d of days) {
      const meta = dayColumnMetaByDay.get(d);
      if (meta) {
        plan[d] = expectedShiftsByDateIso[meta.dateIso] ?? defaultExpectedShiftsForDay();
      }
    }
    return plan;
  }, [days, dayColumnMetaByDay, expectedShiftsByDateIso]);

  const expectedShiftsByPostId = useMemo(() => {
    if (posts.length === 0) return {};
    const result: Record<string, Record<string, ExpectedShifts>> = {};
    for (const post of posts) {
      result[post.id] = buildExpectedShiftsForLocalMonth(
        object.id,
        viewYear,
        viewMonth0,
        shiftTemplates,
        post.id,
      );
    }
    return result;
  }, [posts, object.id, viewYear, viewMonth0, shiftTemplates]);

  const monthPlanByPost = useMemo(() => {
    const result: Record<string, Record<number, ExpectedShifts>> = {};
    for (const post of posts) {
      const byDate = expectedShiftsByPostId[post.id] ?? {};
      const byDay: Record<number, ExpectedShifts> = {};
      for (const d of days) {
        const meta = dayColumnMetaByDay.get(d);
        if (meta) {
          byDay[d] = byDate[meta.dateIso] ?? defaultExpectedShiftsForDay();
        }
      }
      result[post.id] = byDay;
    }
    return result;
  }, [posts, expectedShiftsByPostId, days, dayColumnMetaByDay]);

  // Список охранников для графика
  const guardsForGrid = useMemo(() => {
    const assignedIds = new Set(object.guardIds);
    const shiftGuardIds = new Set(shifts.map((s) => s.guardId));
    const allIds = new Set<string>([...Array.from(assignedIds), ...Array.from(shiftGuardIds)]);

    return Array.from(allIds)
      .map((id) => ({
        guardId: id,
        displayName:
          gridGuardNames[id] ??
          scheduledGuards.find((g) => g.guardId === id)?.displayName ??
          "Неизвестный",
        isAssigned: assignedIds.has(id),
      }))
      .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "ru-RU"));
  }, [object.guardIds, shifts, gridGuardNames, scheduledGuards]);

  const monthKey = `${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}`;

  const firstPostId = posts[0]?.id ?? null;

  const guardsByPost = useMemo(() => {
    if (posts.length === 0) {
      return { "": guardsForGrid };
    }

    const result: Record<string, typeof guardsForGrid> = {};
    for (const post of posts) {
      const assignedIds = new Set(monthlyPostGuardsByPostId[post.id] ?? []);
      const shiftGuardIds = new Set(
        shifts
          .filter((s) => shiftMatchesPost(s.postId, post.id, firstPostId))
          .map((s) => s.guardId),
      );
      const allIds = new Set([...assignedIds, ...shiftGuardIds]);
      result[post.id] = Array.from(allIds)
        .map((id) => ({
          guardId: id,
          displayName:
            gridGuardNames[id] ??
            scheduledGuards.find((g) => g.guardId === id)?.displayName ??
            "Неизвестный",
          isAssigned: assignedIds.has(id),
        }))
        .sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "ru-RU"));
    }
    return result;
  }, [posts, monthlyPostGuardsByPostId, shifts, guardsForGrid, gridGuardNames, scheduledGuards, firstPostId]);

  const pickerGuardList = pickerGuards ?? [];

  const filteredGuards = useMemo(() => {
    const q = guardSearch.toLowerCase().trim();
    if (!q) return pickerGuardList;
    return pickerGuardList.filter((g) =>
      `${g.lastName} ${g.firstName}`.toLowerCase().includes(q),
    );
  }, [pickerGuardList, guardSearch]);

  const monthLabel = useMemo(() => {
    const date = new Date(Date.UTC(viewYear, viewMonth0, 1, 12 - 10));
    const label = new Intl.DateTimeFormat("ru-RU", {
      month: "long",
      year: "numeric",
    }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [viewYear, viewMonth0]);

  const dateIsoToDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const [day, meta] of dayColumnMetaByDay) {
      map.set(meta.dateIso, day);
    }
    return map;
  }, [dayColumnMetaByDay]);

  const normalizedShifts = useMemo(() => shifts.map(normalizeShiftDates), [shifts]);

  const shiftsByGuardAndDay = useMemo(() => {
    const map: Record<string, Record<number, Shift[]>> = {};
    for (const shift of normalizedShifts) {
      const opDateIso = scheduleShiftColumnDateIso(shift, operationalAnchor);
      const d = dateIsoToDay.get(opDateIso);
      if (d === undefined) continue;
      if (!map[shift.guardId]) map[shift.guardId] = {};
      if (!map[shift.guardId][d]) map[shift.guardId][d] = [];
      map[shift.guardId][d].push(shift);
    }
    return map;
  }, [normalizedShifts, operationalAnchor, dateIsoToDay]);

  useEffect(() => {
    if (!quickAssign) {
      lastQuickAssignKeyRef.current = null;
      return;
    }
    const key = `${quickAssign.dateIso}|${quickAssign.guardId ?? ""}|${quickAssign.replaceShiftId ?? ""}|${quickAssign.editingShiftId ?? ""}`;
    if (lastQuickAssignKeyRef.current !== key) {
      lastQuickAssignKeyRef.current = key;
      const lastUsed = readLastUsedQuickAssign();
      const replaced = quickAssign.replaceShiftId
        ? shifts.find((shift) => shift.id === quickAssign.replaceShiftId)
        : undefined;
      const editing = quickAssign.editingShiftId
        ? shifts.find((shift) => shift.id === quickAssign.editingShiftId)
        : undefined;
      const expectedForCell =
        quickAssign.postId && expectedShiftsByPostId[quickAssign.postId]
          ? expectedShiftsByPostId[quickAssign.postId][quickAssign.dateIso] ?? defaultExpectedShiftsForDay()
          : expectedShiftsByDateIso[quickAssign.dateIso] ?? defaultExpectedShiftsForDay();
      const resolvedShiftKind = resolveShiftKindForTemplate(
        expectedForCell,
        quickAssign.shiftKind ?? lastUsed?.shiftKind,
      );

      const guardIdForOpen =
        quickAssign.editingShiftId && editing ? editing.guardId : quickAssign.guardId ?? "";
      setQuickModalGuardId(guardIdForOpen);
      setQuickAssignGuardSearch("");
      setQuickAssignGuardMenuOpen(false);

      const presetGuardRow = guardIdForOpen ? pickerGuardList.find((g) => g.id === guardIdForOpen) : undefined;
      const presetGuard = presetGuardRow ? guardListRowToSchedulerGuard(presetGuardRow) : null;
      const ratePresets =
        presetGuard && rateRules.length > 0
          ? buildRateRuleTimePresets(
              rateRules,
              object.id,
              presetGuard,
              resolvedShiftKind,
              quickAssign.dateIso,
              holidayDateKeys,
            )
          : [];

      if (quickAssign.startTime && quickAssign.endTime) {
        setQuickStartTime(quickAssign.startTime);
        setQuickEndTime(quickAssign.endTime);
      } else if (replaced?.incidentWorkedUntilAt) {
        setQuickStartTime(toTimeKh(replaced.incidentWorkedUntilAt));
        setQuickEndTime(toTimeKh(replaced.endsAt));
      } else if (ratePresets[0]) {
        setQuickStartTime(ratePresets[0].startTime);
        setQuickEndTime(ratePresets[0].endTime);
      } else {
        setQuickStartTime(lastUsed?.startTime ?? defaultSutki.startTime);
        setQuickEndTime(lastUsed?.endTime ?? defaultSutki.endTime);
      }

      const hasManualRate =
        editing?.manualGuardRateCents != null || editing?.manualClientRateCents != null;
      const rateForm = initializeShiftRateFormFromShift(editing);
      setUseCustomRate(rateForm.useCustomRate);
      setManualGuardRubles(rateForm.manualGuardRubles);
      setManualClientRubles(rateForm.manualClientRubles);
      setManualRateUnit(rateForm.manualRateUnit);
      setManualRateReason(rateForm.manualRateReason);
      if (
        !hasManualRate &&
        !rateForm.selectedRateRuleId &&
        !quickAssign.startTime &&
        !quickAssign.endTime &&
        ratePresets[0]?.ruleIds.length === 1
      ) {
        setSelectedRateRuleId(ratePresets[0].ruleIds[0]!);
      } else {
        setSelectedRateRuleId(rateForm.selectedRateRuleId);
      }
    }
  }, [quickAssign, shifts, expectedShiftsByDateIso, expectedShiftsByPostId, pickerGuardList, object.guardIds, object.id, rateRules, holidayDateKeys]);

  const quickAssignExpectedShifts = useMemo(() => {
    if (!quickAssign) return null;
    if (quickAssign.postId && expectedShiftsByPostId[quickAssign.postId]) {
      return (
        expectedShiftsByPostId[quickAssign.postId][quickAssign.dateIso] ?? defaultExpectedShiftsForDay()
      );
    }
    return expectedShiftsByDateIso[quickAssign.dateIso] ?? defaultExpectedShiftsForDay();
  }, [quickAssign, expectedShiftsByPostId, expectedShiftsByDateIso]);

  const quickAssignAllowedShiftKinds = useMemo(
    () => (quickAssignExpectedShifts ? shiftKindsInTemplate(quickAssignExpectedShifts) : []),
    [quickAssignExpectedShifts],
  );

  useEffect(() => {
    if (!quickAssign || !quickAssignExpectedShifts) return;
    const resolved = resolveShiftKindForTemplate(quickAssignExpectedShifts, quickAssign.shiftKind);
    if (resolved !== quickAssign.shiftKind) {
      setQuickAssign((q) => (q ? { ...q, shiftKind: resolved } : null));
    }
  }, [quickAssign, quickAssignExpectedShifts]);

  const quickAssignGuard = useMemo(() => {
    const row = pickerGuardList.find((g) => g.id === quickModalGuardId);
    return row ? guardListRowToSchedulerGuard(row) : null;
  }, [pickerGuardList, quickModalGuardId]);

  const editingShift = useMemo(() => {
    if (!quickAssign?.editingShiftId) return null;
    return shifts.find((shift) => shift.id === quickAssign.editingShiftId) ?? null;
  }, [quickAssign?.editingShiftId, shifts]);

  const quickAssignOccupiedIntervals = useMemo(() => {
    if (!quickAssign || !quickModalGuardId) return [];
    const excludeShiftId = quickAssign.editingShiftId ?? quickAssign.replaceShiftId;
    return shiftsForAvailability
      .filter(
        (shift) =>
          shift.guardId === quickModalGuardId &&
          shift.isNoShow !== true &&
          (!excludeShiftId || shift.id !== excludeShiftId),
      )
      .map((shift) => ({ startsAt: shift.startsAt, endsAt: shift.endsAt }));
  }, [quickAssign, quickModalGuardId, shiftsForAvailability]);

  const quickAssignNeedsManualRate = useMemo(() => {
    if (!quickAssign || !quickAssignGuard || rateRules.length === 0) return false;
    return shiftNeedsManualRateRuleSelection({
      objectId: object.id,
      guard: quickAssignGuard,
      shiftKind: quickAssign.shiftKind,
      shiftDateIso: quickAssign.dateIso,
      startTime: quickStartTime,
      endTime: quickEndTime,
      rules: rateRules,
      holidayDates: holidayDateKeys,
      manualClientRateCents: editingShift?.manualClientRateCents,
      manualGuardRateCents: editingShift?.manualGuardRateCents,
      operationalDayStartTime: operationalAnchor,
    });
  }, [
    quickAssign,
    quickAssignGuard,
    rateRules,
    object.id,
    quickStartTime,
    quickEndTime,
    holidayDateKeys,
    editingShift?.manualClientRateCents,
    editingShift?.manualGuardRateCents,
  ]);

  const quickAssignShowRateSelectionBlock = useMemo(
    () =>
      shiftAssignShowRateSelection({
        guard: quickAssignGuard,
        rateRulesCount: rateRules.length,
        editingShift,
        needsManualRate: quickAssignNeedsManualRate,
      }),
    [quickAssignGuard, rateRules.length, editingShift, quickAssignNeedsManualRate],
  );

  const quickAssignSelectableRulesCount = useMemo(() => {
    if (!quickAssign || !quickAssignGuard) return 0;
    const { dayMatched, otherWeekdays } = listManualSelectableRateRules(
      rateRules,
      object.id,
      quickAssignGuard,
      quickAssign.shiftKind,
      quickAssign.dateIso,
      holidayDateKeys,
    );
    let count = dayMatched.length + otherWeekdays.length;
    if (editingShift?.selectedRateRuleId) {
      const pinned = findRateRuleById(rateRules, editingShift.selectedRateRuleId);
      if (
        pinned &&
        !dayMatched.some((rule) => rule.id === pinned.id) &&
        !otherWeekdays.some((rule) => rule.id === pinned.id)
      ) {
        count += 1;
      }
    }
    return count;
  }, [quickAssign, quickAssignGuard, rateRules, object.id, holidayDateKeys, editingShift?.selectedRateRuleId]);

  const quickAssignIntervalMinutes = useMemo(() => {
    if (!quickAssign) return 0;
    return shiftDurationMinutesFromTimes(quickAssign.dateIso, quickStartTime, quickEndTime, operationalAnchor);
  }, [quickAssign, quickStartTime, quickEndTime, operationalAnchor]);

  const quickAssignIntervalReady = quickAssignIntervalMinutes > 0;

  const quickAssignGuardAvailability = useMemo(() => {
    if (!quickAssign || !quickAssignIntervalReady) return [];
    const interval = tryBuildShiftIntervalFromHm(
      quickAssign.dateIso,
      quickStartTime,
      quickEndTime,
      operationalAnchor,
    );
    if (!interval) return [];
    const excludeShiftId = quickAssign.editingShiftId ?? quickAssign.replaceShiftId;
    const replaced = quickAssign.replaceShiftId
      ? shifts.find((shift) => shift.id === quickAssign.replaceShiftId)
      : undefined;
    return listGuardsWithAvailability(
      pickerGuardList,
      shiftsForAvailability,
      { ...interval, objectId: object.id },
      {
        replaceShiftId: excludeShiftId,
        excludeGuardId: quickAssign.replaceShiftId ? replaced?.guardId : undefined,
        currentObjectId: object.id,
        assignmentDateIso: quickAssign.dateIso,
      },
    );
  }, [quickAssign, quickStartTime, quickEndTime, quickAssignIntervalReady, shiftsForAvailability, pickerGuardList, object.id, shifts, operationalAnchor]);

  const filteredQuickAssignGuardAvailability = useMemo(() => {
    if (!quickAssign || !quickAssignIntervalReady) return [];
    const assignable = quickAssignGuardAvailability.filter((item) => item.available);
    const sortedGuards = sortGuardsForShiftAssignment(
      assignable.map((item) => item.guard),
      quickAssign.shiftKind,
      (a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "ru-RU"),
    );
    const sortedGuardOrder = new Map(sortedGuards.map((guard, index) => [guard.id, index]));
    return assignable.sort(
      (a, b) => (sortedGuardOrder.get(a.guard.id) ?? 0) - (sortedGuardOrder.get(b.guard.id) ?? 0),
    );
  }, [quickAssign, quickAssignGuardAvailability, quickAssignIntervalReady]);

  const searchedQuickAssignGuardAvailability = useMemo(() => {
    const normalized = quickAssignGuardSearch.trim().toLowerCase();
    if (!normalized) return filteredQuickAssignGuardAvailability;
    return filteredQuickAssignGuardAvailability.filter((item) => {
      const name = `${item.guard.lastName} ${item.guard.firstName}`.toLowerCase();
      return name.includes(normalized);
    });
  }, [filteredQuickAssignGuardAvailability, quickAssignGuardSearch]);

  const quickModalGuardLabel = useMemo(() => {
    if (!quickAssign) return "Выберите сотрудника";
    if (!quickAssignIntervalReady) return "Сначала укажите время";
    if (!quickModalGuardId) return "Выберите сотрудника";
    const row = pickerGuardList.find((g) => g.id === quickModalGuardId);
    if (row) {
      return formatGuardAssignmentLabel(
        `${row.lastName} ${row.firstName}`.trim(),
        row.hasCar,
        quickAssign.shiftKind,
      );
    }
    return (
      gridGuardNames[quickModalGuardId] ??
      scheduledGuards.find((g) => g.guardId === quickModalGuardId)?.displayName ??
      "Выберите сотрудника"
    );
  }, [
    quickAssign,
    quickAssignIntervalReady,
    quickModalGuardId,
    pickerGuardList,
    gridGuardNames,
    scheduledGuards,
  ]);

  useEffect(() => {
    if (!quickAssign || !quickAssignIntervalReady || pickerGuards === null) return;

    const requestedId = quickAssign.guardId;
    const currentInList =
      quickModalGuardId !== "" &&
      filteredQuickAssignGuardAvailability.some((item) => item.guard.id === quickModalGuardId);

    if (requestedId) {
      const requestedAvailable = filteredQuickAssignGuardAvailability.some(
        (item) => item.guard.id === requestedId,
      );
      if (requestedAvailable) {
        if (quickModalGuardId !== requestedId) {
          setQuickModalGuardId(requestedId);
          setSelectedRateRuleId("");
          setUseCustomRate(false);
        }
        return;
      }

      if (currentInList && quickModalGuardId !== requestedId) return;

      const substitute = filteredQuickAssignGuardAvailability[0];
      if (substitute) {
        if (quickModalGuardId !== substitute.guard.id) {
          setQuickModalGuardId(substitute.guard.id);
          setSelectedRateRuleId("");
          setUseCustomRate(false);
        }
        return;
      }

      if (quickModalGuardId) {
        setQuickModalGuardId("");
        setSelectedRateRuleId("");
        setUseCustomRate(false);
      }
      return;
    }

    if (currentInList) return;

    const first = filteredQuickAssignGuardAvailability[0];
    if (first) {
      if (quickModalGuardId !== first.guard.id) {
        setQuickModalGuardId(first.guard.id);
        setSelectedRateRuleId("");
        setUseCustomRate(false);
      }
      return;
    }

    if (quickModalGuardId) {
      setQuickModalGuardId("");
      setSelectedRateRuleId("");
      setUseCustomRate(false);
    }
  }, [
    quickAssign,
    quickAssignIntervalReady,
    filteredQuickAssignGuardAvailability,
    quickModalGuardId,
    pickerGuards,
  ]);

  const selectedQuickAssignAvailability = useMemo(
    () => quickAssignGuardAvailability.find((item) => item.guard.id === quickModalGuardId) ?? null,
    [quickAssignGuardAvailability, quickModalGuardId],
  );

  const selectedGuardAvailabilityMessage = useMemo(() => {
    if (!selectedQuickAssignAvailability || selectedQuickAssignAvailability.available) return null;
    return formatGuardAvailabilityMessage(quickModalGuardLabel, selectedQuickAssignAvailability, objectNameById);
  }, [selectedQuickAssignAvailability, quickModalGuardLabel, objectNameById]);

  const requestedGuardSubstitutionHint = useMemo(() => {
    if (!quickAssign?.guardId || quickAssign.editingShiftId || !quickAssignIntervalReady) return null;
    if (quickModalGuardId === quickAssign.guardId) return null;
    const requested = quickAssignGuardAvailability.find((item) => item.guard.id === quickAssign.guardId);
    if (!requested) return null;
    const row = pickerGuardList.find((g) => g.id === quickAssign.guardId);
    const name = row ? `${row.lastName} ${row.firstName}`.trim() : "охранника";
    const selectedName =
      quickModalGuardId && quickModalGuardLabel !== "Выберите сотрудника" && quickModalGuardLabel !== "Сначала укажите время"
        ? quickModalGuardLabel
        : undefined;
    return formatRequestedGuardSubstitutionHint(name, requested, objectNameById, selectedName);
  }, [
    quickAssign,
    quickAssignIntervalReady,
    quickModalGuardId,
    quickAssignGuardAvailability,
    pickerGuardList,
    objectNameById,
  ]);

  const redirectMonth = `${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}`;

  function shiftMonth(delta: number) {
    let nextMonth = viewMonth0 + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear--;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear++;
    }
    const m = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`;
    router.push(`/objects/${object.id}?month=${m}`, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Шапка */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <ButtonLink href="/objects" variant="secondary" size="icon" className="shrink-0">
            <ArrowLeft className="size-4" />
          </ButtonLink>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold sm:text-3xl">{object.name}</h1>
            <p className="truncate text-sm text-app-muted sm:text-base">{object.address}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            onClick={() => setIsEditing(!isEditing)}
            variant={isEditing ? "primary" : "secondary"}
          >
            {isEditing ? "Отмена" : "Редактировать инфо"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Основная информация */}
        <motion.section
          layout
          className="rounded-card border border-app-border bg-app-surface p-4 shadow-glow sm:p-6 lg:col-span-2"
        >
          <div className="flex items-center gap-2 mb-4 text-accent-primary">
            <Info className="size-5" />
            <h2 className="text-lg font-semibold">Информация об объекте</h2>
          </div>

          {isEditing ? (
            <form action={updateObjectAction} className="grid gap-4">
              <input type="hidden" name="id" value={object.id} />
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-app-muted">Название</label>
                <input
                  name="name"
                  defaultValue={object.name}
                  required
                  className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-app-muted">Адрес</label>
                <input
                  name="address"
                  defaultValue={object.address}
                  required
                  className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-app-muted">Описание</label>
                <textarea
                  name="description"
                  defaultValue={object.description}
                  rows={4}
                  className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary resize-none"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-app-muted">Статус</label>
                <select
                  name="status"
                  defaultValue={object.status}
                  className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
                >
                  <option value="Active">Активен</option>
                  <option value="Inactive">Неактивен</option>
                </select>
              </div>
              <Button type="submit" className="mt-2">
                <Save className="size-4 mr-2" />
                Сохранить изменения
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wider text-app-muted">Адрес</span>
                <p className="flex items-center gap-2">
                  <MapPin className="size-4 text-accent-primary" />
                  {object.address}
                </p>
              </div>
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wider text-app-muted">Описание</span>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {object.description || "Описание не добавлено."}
                </p>
              </div>
              <div className="grid gap-1">
                <span className="text-xs uppercase tracking-wider text-app-muted">Статус</span>
                <p className={object.status === "Active" ? "text-status-active" : "text-status-inactive"}>
                  {object.status === "Active" ? "Активен" : "Неактивен"}
                </p>
              </div>
              <ObjectTimesheetApprovalSection object={object} />
            </div>
          )}
        </motion.section>

        <ObjectGuardAssignmentSection
          assignedGuardIds={object.guardIds}
          guardSearch={guardSearch}
          onGuardSearchChange={setGuardSearch}
          onGuardSearchFocus={() => void ensurePickerGuards()}
          pickerGuards={pickerGuards}
          pickerGuardsLoading={pickerGuardsLoading}
          filteredGuards={filteredGuards}
          onToggleGuard={async (guardId: string, checked: boolean) => {
            const newIds = checked
              ? [...object.guardIds, guardId]
              : object.guardIds.filter((id) => id !== guardId);
            const fd = new FormData();
            fd.append("objectId", object.id);
            fd.append("guardIds", newIds.join(","));
            await setObjectGuardsAction(fd);
          }}
        />
      </div>

      <ObjectHolidaysSection objectId={object.id} holidays={objectHolidays} />

      <ObjectPostsAndStaffSection
        objectId={object.id}
        monthKey={monthKey}
        monthLabel={monthLabel}
        posts={posts}
        objectGuardIds={object.guardIds}
        monthlyPostGuardsByPostId={monthlyPostGuardsByPostId}
        guardNames={gridGuardNames}
        canManage={canManageOperationalDay}
      />

      <ObjectMonthScheduleGridLazy
        objectId={object.id}
        objectName={object.name}
        posts={posts}
        viewYear={viewYear}
        viewMonth0={viewMonth0}
        monthLabel={monthLabel}
        redirectMonth={redirectMonth}
        days={days}
        dayColumnMetaByDay={dayColumnMetaByDay}
        monthPlan={monthPlan}
        monthPlanByPost={monthPlanByPost}
        expectedShiftsByPostId={expectedShiftsByPostId}
        guardsByPost={guardsByPost}
        shiftsByGuardAndDay={shiftsByGuardAndDay}
        monthShifts={normalizedShifts}
        expectedShiftsByDateIso={expectedShiftsByDateIso}
        operationalDayStartTime={operationalDayStartTime}
        canWrite={canWrite}
        canManageOperationalDay={canManageOperationalDay}
        bulkCreateShiftsAction={bulkCreateShiftsAction}
        onShiftMonth={shiftMonth}
        onOpenGuardPreview={openGuardSchedulePreview}
        onCloseGuardPreview={scheduleCloseGuardSchedulePreview}
        onQuickAssign={setQuickAssign}
        onIncidentDraft={setIncidentDraft}
      />

      <ObjectSwitchTabs
        objects={switchObjects ?? []}
        currentObjectId={object.id}
        month={redirectMonth}
      />

      {/* Сменность и ставки */}
      <section className="rounded-card border border-app-border bg-app-surface p-3 shadow-glow sm:p-6">
        <div className="flex flex-col gap-6 sm:gap-8">
          {posts.length > 0 ? (
            <>
              <h2 className="text-lg font-semibold">Сменность (Шаблон)</h2>
              {templateSections.map((section) => (
                <ObjectShiftTemplateSection
                  key={section.postId ?? "object"}
                  objectId={object.id}
                  postId={section.postId}
                  postName={section.postName}
                  templateSequence={section.sequence}
                  templateEffectiveFrom={section.effectiveFrom}
                  canEdit={canEditTemplates}
                />
              ))}
            </>
          ) : (
            templateSections.map((section) => (
              <ObjectShiftTemplateSection
                key="object"
                objectId={object.id}
                templateSequence={section.sequence}
                templateEffectiveFrom={section.effectiveFrom}
                canEdit={canEditTemplates}
              />
            ))
          )}

          {showRatesSection ? (
            <div className="border-t border-app-border pt-6 sm:pt-8">
              <h2 className="mb-4 text-lg font-semibold">Ставки и правила</h2>
              <ObjectRateRulesPanel objectId={object.id} rules={rateRules} />
            </div>
          ) : null}
        </div>
      </section>

      {/* Модалка быстрого назначения */}
      {quickAssign && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          role="presentation"
          onClick={() => setQuickAssign(null)}
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              className="my-4 w-full max-w-md max-h-[min(92vh,44rem)] overflow-x-hidden overflow-y-auto overscroll-contain rounded-card border border-app-border bg-app-surface p-5 shadow-glow sm:p-6"
              style={{ boxShadow: designTokens.shadow.glow }}
              onClick={(e) => e.stopPropagation()}
            >
            <h3 className="text-xl font-bold mb-2">
              {quickAssign.editingShiftId
                ? "Редактирование смены"
                : quickAssign.replaceShiftId
                  ? "Замена смены"
                  : "Назначение смены"}
            </h3>
            <p className="mb-4 text-sm text-app-muted">
              <span className="text-xs uppercase tracking-wider">Дата назначения</span>
              <span className="mt-1 block font-medium text-app-text">
                {formatAssignmentDateLabel(quickAssign.dateIso)}
              </span>
            </p>
            {quickAssign.replaceShiftId ? (
              <p className="mb-4 text-sm text-app-muted">
                Замена охранника:{" "}
                <span className="font-semibold text-app-text">{quickAssign.replacedGuardName ?? "охранник"}</span>
              </p>
            ) : null}
            <form
              className="min-w-0 space-y-4"
              onClickCapture={(event) => {
                const target = event.target;
                if (target instanceof Element && !target.closest("[data-dropdown=quick-assign-guard]")) {
                  setQuickAssignGuardMenuOpen(false);
                }
              }}
              onSubmit={async (e) => {
                e.preventDefault();
                if (!quickModalGuardId) {
                  toast({
                    title: "Смена не назначена",
                    message: "Выберите сотрудника",
                    variant: "error",
                    durationMs: 4000,
                  });
                  return;
                }
                if (
                  selectedQuickAssignAvailability &&
                  !selectedQuickAssignAvailability.available
                ) {
                  toast({
                    title: "Смена не назначена",
                    message:
                      formatGuardAvailabilityMessage(
                        quickModalGuardLabel,
                        selectedQuickAssignAvailability,
                        objectNameById,
                      ) ?? "Охранник недоступен",
                    variant: "error",
                    durationMs: 6500,
                  });
                  return;
                }
                const form = e.currentTarget;
                const fd = new FormData(form);
                fd.set("noRedirect", "true");
                fd.set("scrollY", String(Math.round(window.scrollY)));
                const isEdit = Boolean(quickAssign.editingShiftId);
                try {
                  if (isEdit) {
                    await updateShiftAction(fd);
                    toast({
                      title: "Смена обновлена",
                      message: "График обновлён без прокрутки страницы",
                      variant: "success",
                    });
                  } else {
                    if (!quickAssign.replaceShiftId) {
                      writeLastUsedQuickAssign({
                        startTime: quickStartTime,
                        endTime: quickEndTime,
                        shiftKind: quickAssign.shiftKind,
                      });
                    }
                    await createShiftAction(fd);
                    toast({
                      title: quickAssign.replaceShiftId ? "Смена заменена" : "Смена создана",
                      message: "График обновлён без прокрутки страницы",
                      variant: "success",
                    });
                    if (quickAssign.replaceShiftId) {
                      dispatchIncidentReplacementsRefresh();
                    }
                  }
                  setQuickAssign(null);
                  router.refresh();
                } catch (err) {
                  if (
                    typeof err === "object" &&
                    err !== null &&
                    "digest" in err &&
                    typeof (err as { digest: unknown }).digest === "string" &&
                    String((err as { digest: string }).digest).startsWith("NEXT_REDIRECT")
                  ) {
                    throw err;
                  }
                  toast({
                    title: isEdit ? "Смена не обновлена" : "Смена не создана",
                    message: err instanceof Error ? err.message : "Не удалось сохранить смену",
                    variant: "error",
                    durationMs: 6500,
                  });
                }
              }}
            >
              <input type="hidden" name="objectId" value={object.id} />
              <input type="hidden" name="shiftDate" value={quickAssign.dateIso} />
              <input type="hidden" name="guardId" value={quickModalGuardId} />
              {quickAssign.editingShiftId ? (
                <input type="hidden" name="shiftId" value={quickAssign.editingShiftId} />
              ) : null}
              {quickAssign.replaceShiftId ? (
                <input type="hidden" name="replaceShiftId" value={quickAssign.replaceShiftId} />
              ) : null}
              {quickAssign.postId ? (
                <input type="hidden" name="postId" value={quickAssign.postId} />
              ) : null}
              <input
                type="hidden"
                name="redirect"
                value={`/objects/${object.id}?month=${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}`}
              />
              <input ref={quickAssignScrollRef} type="hidden" name="scrollY" defaultValue="0" />

              <ShiftAssignTimeRateFields
                objectId={object.id}
                operationalDayStartTime={operationalAnchor}
                rateRules={rateRules}
                guard={quickAssignGuard}
                shiftKind={quickAssign.shiftKind}
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
                editingShift={editingShift}
                occupiedIntervals={quickAssignOccupiedIntervals}
              />

              <div className="grid min-w-0 gap-2">
                <label className="text-xs uppercase tracking-wider text-app-muted">Сотрудник</label>
                <div className="relative" data-dropdown="quick-assign-guard">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-start bg-app-bg font-normal"
                    disabled={!quickAssignIntervalReady}
                    onClick={() => {
                      if (!quickAssignIntervalReady) return;
                      setQuickAssignGuardMenuOpen((open) => !open);
                    }}
                  >
                    <span className="truncate">{quickModalGuardLabel}</span>
                  </Button>
                  {quickAssignGuardMenuOpen && quickAssignIntervalReady ? (
                    <div className="absolute z-50 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
                      <input
                        value={quickAssignGuardSearch}
                        onChange={(event) => setQuickAssignGuardSearch(event.target.value)}
                        placeholder="Поиск по фамилии"
                        className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-2 py-2 text-sm text-app-text outline-none focus:border-accent-primary"
                        autoFocus
                      />
                      <div className="max-h-56 overflow-auto">
                        {searchedQuickAssignGuardAvailability.length === 0 ? (
                          <div className="px-2 py-2 text-xs text-app-muted">
                            {filteredQuickAssignGuardAvailability.length === 0
                              ? "Нет свободных охранников"
                              : "Никого не найдено"}
                          </div>
                        ) : (
                          searchedQuickAssignGuardAvailability.map((item) => (
                            <Button
                              key={item.guard.id}
                              type="button"
                              variant="menu"
                              size="sm"
                              className="mb-1 w-full justify-start font-normal"
                              onClick={() => {
                                setQuickModalGuardId(item.guard.id);
                                setSelectedRateRuleId("");
                                setUseCustomRate(false);
                                setQuickAssignGuardMenuOpen(false);
                                setQuickAssignGuardSearch("");
                              }}
                            >
                              {formatGuardAssignmentLabel(
                                `${item.guard.lastName} ${item.guard.firstName}`.trim(),
                                item.guard.hasCar,
                                quickAssign.shiftKind,
                              )}
                            </Button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
                {selectedGuardAvailabilityMessage ? (
                  <p
                    className="rounded-button border-2 px-2.5 py-1.5 text-xs font-bold leading-snug break-words"
                    style={{
                      borderColor: designTokens.color.accent.danger,
                      backgroundColor: `${designTokens.color.accent.danger}18`,
                      color: designTokens.color.accent.danger,
                    }}
                  >
                    {selectedGuardAvailabilityMessage}
                  </p>
                ) : null}
                {requestedGuardSubstitutionHint ? (
                  <p
                    className="rounded-button border-2 px-2.5 py-1.5 text-xs font-bold leading-snug break-words"
                    style={{
                      borderColor: designTokens.color.accent.warning,
                      backgroundColor: `${designTokens.color.accent.warning}18`,
                      color: designTokens.color.accent.warning,
                    }}
                  >
                    {requestedGuardSubstitutionHint}
                  </p>
                ) : null}
                {selectedQuickAssignAvailability &&
                formatGuardOtherObjectsHint(selectedQuickAssignAvailability, objectNameById) ? (
                  <p
                    className="rounded-button border-2 px-2.5 py-1.5 text-xs font-bold leading-snug break-words"
                    style={{
                      borderColor: designTokens.color.accent.warning,
                      backgroundColor: `${designTokens.color.accent.warning}18`,
                      color: designTokens.color.accent.warning,
                    }}
                  >
                    {formatGuardOtherObjectsHint(selectedQuickAssignAvailability, objectNameById)}
                  </p>
                ) : null}
                <p className="text-[10px] text-app-muted">
                  Пересечение по времени с любой сменой охранника запрещено. Суточный лимит — 24 ч.
                </p>
              </div>

              <ShiftAssignGuardProfileSummary
                guard={quickAssignGuard}
                objectId={object.id}
                rateRules={rateRules}
                shiftKind={quickAssign.shiftKind}
                shiftDateIso={quickAssign.dateIso}
                holidayDateKeys={holidayDateKeys}
              />

              <div className="grid gap-2">
                <label className="text-xs uppercase tracking-wider text-app-muted">Тип смены</label>
                <select
                  name="shiftKind"
                  value={quickAssign.shiftKind}
                  onChange={(e) => {
                    setQuickAssign((q) =>
                      q
                        ? {
                            ...q,
                            shiftKind: e.target.value as "Regular" | "Reinforcement" | "RapidResponse" | "ShiftLead",
                          }
                        : null,
                    );
                    setSelectedRateRuleId("");
                    setUseCustomRate(false);
                  }}
                  className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
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
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="secondary" onClick={() => setQuickAssign(null)}>
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={shiftAssignSubmitDisabled({
                    guardId: quickModalGuardId,
                    showRateSelection: quickAssignShowRateSelectionBlock,
                    selectedRateRuleId,
                    manualSelectableRulesCount: quickAssignSelectableRulesCount,
                    useCustomRate,
                    manualGuardRubles,
                    manualRateUnit,
                  })}
                >
                  {quickAssign.editingShiftId
                    ? "Сохранить"
                    : quickAssign.replaceShiftId
                      ? "Заменить"
                      : "Создать смену"}
                </Button>
              </div>
            </form>
            </div>
          </div>
        </div>
      )}

      {incidentDraft && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
              role="presentation"
              onClick={() => setIncidentDraft(null)}
            >
              <div
                role="dialog"
                aria-labelledby="incident-dialog-title-obj"
                className="max-h-[min(90vh,40rem)] w-full max-w-lg overflow-y-auto rounded-card border border-app-border bg-app-surface p-4 shadow-glow"
                style={{ boxShadow: designTokens.shadow.glow }}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="incident-dialog-title-obj" className="text-lg font-semibold text-app-text">
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
                      fd.delete("workedDate");
                      fd.delete("workedTime");
                    } else {
                      const cp = fd.get("categoryPartial");
                      fd.set("category", cp && String(cp).length ? String(cp) : "LeftWork");
                    }
                    fd.delete("categoryPartial");
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
                      const isRedirect =
                        typeof err === "object" &&
                        err !== null &&
                        "digest" in err &&
                        String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
                      if (isRedirect) {
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
                  <input ref={incidentFormScrollRef} type="hidden" name="scrollY" defaultValue="0" />
                  <input
                    type="hidden"
                    name="redirect"
                    value={`/objects/${object.id}?month=${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}`}
                  />
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
                      Отработал частично (укажите время ухода — замена пойдёт на оставшиеся часы)
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
                        Отработал до
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
                      {pickerGuardList
                        .filter((g) => g.id !== incidentDraft.guardId)
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.lastName} {g.firstName}
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

      {guardSchedulePreview && guardPopoverPos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={guardPopoverRef}
              role="dialog"
              aria-label={`Смены: ${guardSchedulePreview.displayName}`}
              className="pointer-events-auto z-[60] max-h-[min(85vh,40rem)] w-[min(calc(100vw-12px),96rem)] max-w-[min(calc(100vw-12px),96rem)] overflow-auto rounded-card border border-app-border bg-app-surface p-2 shadow-glow sm:p-3"
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
                  <div className="text-[10px] uppercase tracking-[0.18em] text-accent-primary">Охранник (другие объекты)</div>
                  <h2 className="mt-0.5 truncate text-sm font-semibold text-app-text sm:text-base">
                    {guardSchedulePreview.displayName}
                  </h2>
                  <p className="mt-1 text-[10px] leading-snug text-app-muted sm:text-xs">
                    Показаны смены на других объектах за 11 дней от{" "}
                    <span className="font-medium text-app-text">
                      {formatDisplayDateFromIso(guardSchedulePreview.anchorDateIso)}
                    </span>
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

              <div className="mt-1.5 min-w-max w-full">
                <table className="border-separate border-spacing-0 text-left text-[8px] text-app-text sm:text-[9px]">
                  <colgroup>
                    <col style={{ width: "120px" }} />
                    {guardPreviewDates.map((dateIso) => (
                      <col key={`cg-${dateIso}`} style={{ width: "28px" }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-[1] border border-app-border bg-app-elevated px-0.5 py-1 font-medium">
                        Объект
                      </th>
                      {guardPreviewDates.map((dateIso) => {
                        const isAnchor = dateIso === guardSchedulePreview.anchorDateIso;
                        const [, , dd] = dateIso.split("-");
                        return (
                          <th
                            key={`pv-${dateIso}`}
                            className={`border border-app-border px-0 py-0.5 text-center font-medium leading-none ${
                              isAnchor ? "bg-app-elevated" : "bg-app-surface"
                            }`}
                            style={
                              isAnchor
                                ? { boxShadow: `inset 0 0 0 1px ${designTokens.color.accent.primary}` }
                                : undefined
                            }
                          >
                            <span className="block whitespace-nowrap">{Number(dd)}</span>
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
                          Нет смен на других объектах в этом окне
                        </td>
                      </tr>
                    ) : (
                      guardPreviewObjects.map((obj) => (
                        <tr key={obj.id}>
                          <td className="sticky left-0 z-[1] border border-app-border bg-app-surface px-0.5 py-1 align-top font-medium break-words">
                            {obj.name}
                          </td>
                          {guardPreviewDates.map((dateIso) => {
                            const cellShifts = guardPreviewShifts
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
                                  <span className="text-app-muted">·</span>
                                ) : (
                                  <div className="flex flex-col items-center gap-0.5">
                                    {cellShifts.map((shift) => {
                                      const startH = getHoursKhabarovsk(shift.startsAt);
                                      const endH = getHoursKhabarovsk(shift.endsAt);
                                      return (
                                        <div
                                          key={shift.id}
                                          className="flex flex-col items-center leading-none"
                                          title={`${formatCompactTimeRangeLocal(shift.startsAt, shift.endsAt)} (${formatDurationRuHours(shift.startsAt, shift.endsAt)})`}
                                        >
                                          <span className="text-[8px] font-semibold tabular-nums">
                                            {startH}-{endH}
                                          </span>
                                          <span className="text-[8px] text-app-muted tabular-nums">
                                            {formatDurationRuHours(shift.startsAt, shift.endsAt)}
                                          </span>
                                        </div>
                                      );
                                    })}
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
    </div>
  );
}
