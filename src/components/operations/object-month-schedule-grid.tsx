"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Info,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { deleteShiftAction } from "../../app/scheduler/actions";
import { upsertObjectMonthlySettingAction } from "../../app/objects/actions";
import { Button } from "../ui/button";
import type { Shift, ShiftKind } from "../../lib/scheduling/types";
import type { ObjectPost } from "../../lib/operations/object-posts-repository";
import { toast } from "../../store/toast-store";
import { designTokens } from "../../lib/design-tokens";
import { ScheduleExportDialog, type ScheduleExportFormat } from "./schedule-export-dialog";
import {
  formatDisplayDateFromIso,
  getDateKhabarovsk,
  getDayKhabarovsk,
  getHoursKhabarovsk,
  getKhabarovskComponents,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";
import {
  defaultExpectedShiftsForDay,
  resolveShiftKindForTemplate,
  type ExpectedShifts,
} from "../../lib/scheduling/object-shift-templates";
import { computeDayPlanMetrics, formatTemplateCountWithHours } from "../../lib/scheduling/schedule-shortage";
import { shiftMatchesPost } from "../../lib/scheduling/shift-post-display";
import { scheduleShiftColumnDateIso } from "../../lib/scheduling/operational-day-timeline";
import { confirmDeleteShift } from "../../lib/scheduling/shift-delete-confirm";
import {
  buildScheduleDayColumnStyle,
  mergeScheduleCellStyles,
  scheduleGridCellHoverStyle,
  scheduleGridColumnHoverStyle,
  scheduleGridRowHoverStyle,
  type DayColumnMeta,
  type ScheduleGridHover,
} from "./object-detail-schedule-styles";

const LAST_USED_QUICK_ASSIGN_KEY = "control.scheduler.lastQuickAssign.v1";

export function readLastUsedQuickAssign(): { startTime?: string; endTime?: string; shiftKind?: ShiftKind } | null {
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

function toTimeKh(date: Date): string {
  const kh = getKhabarovskComponents(date);
  return `${String(kh.hours).padStart(2, "0")}:${String(kh.minutes).padStart(2, "0")}`;
}

function formatDurationRuHours(start: Date, end: Date): string {
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  if (!Number.isFinite(rounded) || rounded <= 0) return "0ч";
  if (rounded === Math.trunc(rounded)) return `${Math.trunc(rounded)}ч`;
  return `${String(rounded).replace(".", ",")}ч`;
}

export type ScheduleGridGuardRow = {
  guardId: string;
  displayName: string;
  isAssigned: boolean;
};

export type QuickAssignDraft = {
  guardId?: string;
  dateIso: string;
  shiftKind: ShiftKind;
  editingShiftId?: string;
  replaceShiftId?: string;
  replacedGuardName?: string;
  startTime?: string;
  endTime?: string;
  postId?: string | null;
};

export type IncidentDraft = {
  shiftId: string;
  objectId: string;
  guardId: string;
  guardName: string;
  dateIso: string;
  startTime: string;
  endTime: string;
  shiftKind: ShiftKind;
};

export type ObjectMonthScheduleGridProps = {
  objectId: string;
  objectName: string;
  posts: ObjectPost[];
  viewYear: number;
  viewMonth0: number;
  monthLabel: string;
  redirectMonth: string;
  days: number[];
  dayColumnMetaByDay: Map<number, DayColumnMeta>;
  monthPlan: Record<number, ExpectedShifts>;
  monthPlanByPost?: Record<string, Record<number, ExpectedShifts>>;
  expectedShiftsByPostId?: Record<string, Record<string, ExpectedShifts>>;
  guardsByPost: Record<string, ScheduleGridGuardRow[]>;
  shiftsByGuardAndDay: Record<string, Record<number, Shift[]>>;
  monthShifts: Shift[];
  expectedShiftsByDateIso: Record<string, ExpectedShifts>;
  operationalDayStartTime: string;
  canWrite: boolean;
  canManageOperationalDay: boolean;
  bulkCreateShiftsAction?: (
    formData: FormData,
  ) => Promise<{ created: number; skipped: Array<{ objectId: string; dateIso: string; reason: string }> } | void>;
  onShiftMonth: (delta: number) => void;
  onOpenGuardPreview: (
    payload: { guardId: string; anchorDateIso: string; displayName: string },
    anchorEl: HTMLElement,
  ) => void;
  onCloseGuardPreview: () => void;
  onQuickAssign: (draft: QuickAssignDraft) => void;
  onIncidentDraft: (draft: IncidentDraft) => void;
};

export function ObjectMonthScheduleGrid({
  objectId,
  objectName,
  posts,
  viewYear,
  viewMonth0,
  monthLabel,
  redirectMonth,
  days,
  dayColumnMetaByDay,
  monthPlan,
  monthPlanByPost,
  expectedShiftsByPostId,
  guardsByPost,
  shiftsByGuardAndDay,
  monthShifts,
  expectedShiftsByDateIso,
  operationalDayStartTime,
  canWrite,
  canManageOperationalDay,
  bulkCreateShiftsAction,
  onShiftMonth,
  onOpenGuardPreview,
  onCloseGuardPreview,
  onQuickAssign,
  onIncidentDraft,
}: ObjectMonthScheduleGridProps) {
  const router = useRouter();
  const [operationalDayDraft, setOperationalDayDraft] = useState(operationalDayStartTime);
  const [isSavingOperationalDay, setIsSavingOperationalDay] = useState(false);

  useEffect(() => {
    setOperationalDayDraft(operationalDayStartTime);
  }, [operationalDayStartTime]);

  const operationalDayDirty = operationalDayDraft !== operationalDayStartTime;

  const guardsForExport = useMemo(() => {
    const seen = new Set<string>();
    const rows: ScheduleGridGuardRow[] = [];
    for (const section of Object.values(guardsByPost)) {
      for (const row of section) {
        if (seen.has(row.guardId)) continue;
        seen.add(row.guardId);
        rows.push(row);
      }
    }
    return rows.sort((a, b) => (a.displayName || "").localeCompare(b.displayName || "", "ru-RU"));
  }, [guardsByPost]);

  const firstPostId = posts[0]?.id ?? null;

  async function saveOperationalDayStartTime(nextTime?: string) {
    const value = nextTime ?? operationalDayDraft;
    setIsSavingOperationalDay(true);
    try {
      const monthStr = `${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}`;
      const fd = new FormData();
      fd.set("objectId", objectId);
      fd.set("month", monthStr);
      fd.set("operationalDayStartTime", value);
      const result = await upsertObjectMonthlySettingAction(fd);
      if (!result.ok) {
        toast({
          title: "Не сохранено",
          message: result.error,
          variant: "error",
          durationMs: 6500,
        });
        return;
      }
      setOperationalDayDraft(value);
      toast({
        title: "Операционные сутки обновлены",
        message: `Для ${monthLabel}: ${value} – ${value} (+1)`,
        variant: "success",
      });
      router.refresh();
    } finally {
      setIsSavingOperationalDay(false);
    }
  }

  const [dragSource, setDragSource] = useState<{
    shiftId: string;
    guardId: string;
    sourceDateIso: string;
    startTime: string;
    endTime: string;
    shiftKind: ShiftKind;
    guardName: string;
    postId: string | null;
  } | null>(null);
  const [dragTargetIso, setDragTargetIso] = useState<string | null>(null);
  const dragTargetIsoRef = useRef<string | null>(null);
  const [shiftDeleteFocus, setShiftDeleteFocus] = useState<{ guardId: string; day: number } | null>(null);
  const [gridHover, setGridHover] = useState<ScheduleGridHover | null>(null);
  const [exportDialog, setExportDialog] = useState<ScheduleExportFormat | null>(null);

  useEffect(() => {
    if (!shiftDeleteFocus) return;
    const focusedGuardId = shiftDeleteFocus.guardId;
    const focusedDay = shiftDeleteFocus.day;

    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const cell = target.closest("td[data-guard-id][data-day]");
      if (cell) {
        const guardId = cell.getAttribute("data-guard-id");
        const day = Number(cell.getAttribute("data-day"));
        if (guardId === focusedGuardId && Number.isFinite(day) && day === focusedDay) {
          return;
        }
      }
      setShiftDeleteFocus(null);
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, [shiftDeleteFocus]);

  useEffect(() => {
    if (!dragSource) return;
    function onMove(event: MouseEvent) {
      const el = document.elementFromPoint(event.clientX, event.clientY);
      const td = el?.closest("td[data-day-iso][data-guard-id]") as HTMLElement | null;
      if (!td) {
        dragTargetIsoRef.current = null;
        setDragTargetIso(null);
        return;
      }
      const guardId = td.getAttribute("data-guard-id");
      const dayIso = td.getAttribute("data-day-iso");
      const isEmpty = td.getAttribute("data-empty") === "true";
      if (!guardId || !dayIso) return;
      if (guardId !== dragSource!.guardId) return;
      if (dayIso === dragSource!.sourceDateIso) return;
      if (!isEmpty) {
        dragTargetIsoRef.current = null;
        setDragTargetIso(null);
        return;
      }
      dragTargetIsoRef.current = dayIso;
      setDragTargetIso(dayIso);
    }
    function onUp() {
      const targetIso = dragTargetIsoRef.current;
      const source = dragSource;
      setDragSource(null);
      dragTargetIsoRef.current = null;
      setDragTargetIso(null);
      if (!source || !targetIso || !bulkCreateShiftsAction) return;
      const dateLabel = formatDisplayDateFromIso(targetIso);
      const ok = window.confirm(
        `Назначить смену для «${source.guardName}» на ${dateLabel} (${source.startTime}–${source.endTime})?`,
      );
      if (!ok) return;
      const payload = [
        {
          objectId,
          guardId: source.guardId,
          shiftDate: targetIso,
          startTime: source.startTime,
          endTime: source.endTime,
          shiftKind: source.shiftKind,
          ...(source.postId ? { postId: source.postId } : {}),
        },
      ];
      void (async () => {
        const fd = new FormData();
        fd.set("items", JSON.stringify(payload));
        fd.set("redirect", `/objects/${objectId}?month=${redirectMonth}`);
        fd.set("scrollY", String(window.scrollY));
        fd.set("noRedirect", "true");
        try {
          const result = await bulkCreateShiftsAction(fd);
          if (result && result.created === 0 && result.skipped.length > 0) {
            toast({
              title: "Смена не назначена",
              message: result.skipped[0]?.reason ?? "Не удалось создать смену",
              variant: "error",
              durationMs: 6500,
            });
            return;
          }
          toast({
            title: "Смена назначена",
            message: "График обновлён без прокрутки страницы",
            variant: "success",
          });
          router.refresh();
        } catch (err) {
          toast({
            title: "Смена не назначена",
            message: err instanceof Error ? err.message : "Не удалось создать смену",
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
  }, [dragSource, bulkCreateShiftsAction, objectId, redirectMonth, router]);

  const replacementShiftIds = useMemo(() => {
    const ids = new Set<string>();
    for (const byDay of Object.values(shiftsByGuardAndDay)) {
      for (const dayShifts of Object.values(byDay)) {
        for (const shift of dayShifts) {
          if (shift.replacedByShiftId) ids.add(shift.replacedByShiftId);
        }
      }
    }
    return ids;
  }, [shiftsByGuardAndDay]);

  function expectedForCell(dateIso: string, postId: string | null): ExpectedShifts {
    if (postId && expectedShiftsByPostId?.[postId]?.[dateIso]) {
      return expectedShiftsByPostId[postId][dateIso];
    }
    return expectedShiftsByDateIso[dateIso] ?? defaultExpectedShiftsForDay();
  }

  function triggerQuickAssign(guardId: string, dateIso: string, postId: string | null = null) {
    setShiftDeleteFocus(null);
    const lastUsed = readLastUsedQuickAssign();
    const expected = expectedForCell(dateIso, postId);
    onQuickAssign({
      guardId,
      dateIso,
      shiftKind: resolveShiftKindForTemplate(expected, lastUsed?.shiftKind),
      startTime: lastUsed?.startTime,
      endTime: lastUsed?.endTime,
      postId,
    });
  }

  function shiftsOnDayForPost(d: number, postId: string | null): Shift[] {
    return Object.values(shiftsByGuardAndDay)
      .flatMap((g) => g[d] || [])
      .filter((s) => shiftMatchesPost(s.postId, postId, firstPostId));
  }

  function renderPlanRow(plan: Record<number, ExpectedShifts>, postId: string | null) {
    return (
      <tr className="bg-app-elevated/40 border-b-2 border-app-border">
        <td className="schedule-sticky-col border border-app-border p-1.5 font-bold text-accent-primary text-[9px] uppercase tracking-wider sm:p-2 sm:text-[10px]">
          План (осн/ус/мп/СтМ)
        </td>
        {days.map((d) => {
          const dayPlan = plan[d];
          const dayShifts = shiftsOnDayForPost(d, postId);
          const metrics = computeDayPlanMetrics(dayShifts, dayPlan);
          const totalMinutes = dayShifts
            .filter((s) => !s.isNoShow)
            .reduce((sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 60000, 0);
          const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
          const colMeta = dayColumnMetaByDay.get(d);

          if (!metrics) {
            return (
              <td
                key={d}
                data-schedule-col={d}
                className="border border-app-border p-1 text-center text-[10px] text-app-muted transition-[background-color] duration-75"
                style={mergeScheduleCellStyles(
                  colMeta ? buildScheduleDayColumnStyle(colMeta) : undefined,
                  scheduleGridColumnHoverStyle(gridHover, d),
                )}
              >
                —
              </td>
            );
          }

          const factColor = metrics.hoursShort > 0
            ? "text-accent-warning"
            : metrics.hoursOver > 0
              ? "text-accent-danger"
              : "text-accent-primary";
          const tooltipParts: string[] = [];
          if (metrics.expectedHoursRegular > 0) {
            tooltipParts.push(
              `Осн.: факт ${metrics.regularDayHours} / план ${metrics.expectedHoursRegular} ч (${metrics.regCount}${dayPlan.regular > 0 ? `/${dayPlan.regular}` : ""} см.)`,
            );
          }
          if (metrics.expectedReinforcement > 0 || metrics.reinforcementCount > 0) {
            tooltipParts.push(
              `Усил.: факт ${metrics.reinforcementDayHours} / план ${metrics.expectedReinforcementHours} ч (${formatTemplateCountWithHours(metrics.expectedReinforcement, metrics.reinforcementShiftHours, "чел.")})`,
            );
          }
          if (metrics.expectedRapidResponse > 0 || metrics.rapidResponseCount > 0) {
            tooltipParts.push(
              `МП: факт ${metrics.rapidResponseDayHours} / план ${metrics.expectedRapidResponseHours} ч`,
            );
          }
          if (metrics.expectedShiftLead > 0 || metrics.shiftLeadCount > 0) {
            tooltipParts.push(
              `СтМ: факт ${metrics.shiftLeadDayHours} / план ${metrics.expectedShiftLeadHours} ч`,
            );
          }
          tooltipParts.push(`Всего на дне: ${totalHours} ч`);
          if (metrics.hoursShort > 0) tooltipParts.push(`Недобор по часам: ${metrics.hoursShort} ч`);
          if (metrics.hoursOver > 0) tooltipParts.push(`Перебор по часам: ${metrics.hoursOver} ч`);

          return (
            <td
              key={d}
              data-schedule-col={d}
              className="border border-app-border p-1 text-center font-bold transition-[background-color] duration-75"
              style={mergeScheduleCellStyles(
                colMeta ? buildScheduleDayColumnStyle(colMeta) : undefined,
                scheduleGridColumnHoverStyle(gridHover, d),
              )}
            >
              <div className="flex flex-col items-center gap-0.5" title={tooltipParts.join("\n")}>
                {metrics.expectedHoursRegular > 0 ? (
                  <span className={`text-[11px] tabular-nums leading-tight ${factColor}`}>
                    {metrics.regularDayHours}/{metrics.expectedHoursRegular}
                  </span>
                ) : null}
                {metrics.expectedReinforcement > 0 || metrics.reinforcementCount > 0 ? (
                  <span
                    className={`text-[10px] tabular-nums leading-tight ${
                      metrics.reinforcementHoursShort > 0 || metrics.reinforcementHoursOver > 0
                        ? metrics.reinforcementHoursOver > 0
                          ? "text-accent-danger"
                          : "text-accent-warning"
                        : "text-accent-primary"
                    }`}
                  >
                    ус {metrics.reinforcementDayHours}/{metrics.expectedReinforcementHours}
                  </span>
                ) : null}
                {metrics.expectedRapidResponse > 0 || metrics.rapidResponseCount > 0 ? (
                  <span
                    className={`text-[10px] tabular-nums leading-tight ${
                      metrics.rapidResponseHoursShort > 0 || metrics.rapidResponseHoursOver > 0
                        ? "text-accent-warning"
                        : "text-accent-primary"
                    }`}
                  >
                    мп {metrics.rapidResponseDayHours}/{metrics.expectedRapidResponseHours}
                  </span>
                ) : null}
                {metrics.expectedShiftLead > 0 || metrics.shiftLeadCount > 0 ? (
                  <span
                    className={`text-[10px] tabular-nums leading-tight ${
                      metrics.shiftLeadHoursShort > 0 || metrics.shiftLeadHoursOver > 0
                        ? "text-accent-warning"
                        : "text-accent-primary"
                    }`}
                  >
                    СтМ {metrics.shiftLeadDayHours}/{metrics.expectedShiftLeadHours}
                  </span>
                ) : null}
              </div>
            </td>
          );
        })}
      </tr>
    );
  }

  function renderGuardsRows(postId: string | null) {
    const sectionGuards = guardsByPost[postId ?? ""] ?? [];
    if (sectionGuards.length === 0) {
      return (
        <tr>
          <td colSpan={days.length + 1} className="p-4 text-center text-app-muted italic text-xs">
            {posts.length > 0 ? "Штат поста не назначен" : "Нет назначенных смен в этом месяце"}
          </td>
        </tr>
      );
    }
    return sectionGuards.map((sg) => (
      <tr key={`${postId ?? "null"}-${sg.guardId}`} className="transition-[background-color] duration-75">
        <td
          className="schedule-sticky-col border border-app-border p-1.5 text-[11px] font-medium transition-[background-color] duration-75 sm:p-2 sm:text-xs"
          style={mergeScheduleCellStyles(
            { backgroundColor: designTokens.color.surface },
            scheduleGridRowHoverStyle(gridHover, sg.guardId),
          )}
        >
          <div 
            className="flex flex-col cursor-help"
            onMouseEnter={(e) => {
              const date = new Date(viewYear, viewMonth0, 1);
              const dateIso = toDateIsoKhabarovsk(date);
              onOpenGuardPreview(
                {
                  guardId: sg.guardId,
                  anchorDateIso: dateIso,
                  displayName: sg.displayName,
                },
                e.currentTarget
              );
            }}
            onMouseLeave={onCloseGuardPreview}
          >
            <span>{sg.displayName}</span>
            {!sg.isAssigned && (
              <span className="text-[9px] text-accent-warning leading-none">Вне штата</span>
            )}
          </div>
        </td>
        {days.map((d) => {
          const allDayShifts = shiftsByGuardAndDay[sg.guardId]?.[d] || [];
          const dayShifts = allDayShifts.filter((s) => shiftMatchesPost(s.postId, postId, firstPostId));
          const colMeta = dayColumnMetaByDay.get(d);
          const dateIso = colMeta?.dateIso ?? toDateIsoKhabarovsk(new Date(viewYear, viewMonth0, d));
          const deleteFocus =
            shiftDeleteFocus?.guardId === sg.guardId && shiftDeleteFocus?.day === d;
          const isCellHovered = gridHover?.guardId === sg.guardId && gridHover?.day === d;
          const isDragTarget =
            dragTargetIso === dateIso && dragSource?.guardId === sg.guardId;
          return (
            <td
              key={d}
              data-guard-id={sg.guardId}
              data-day={d}
              data-day-iso={dateIso}
              data-empty={dayShifts.length === 0 ? "true" : "false"}
              className={`group/cell relative overflow-visible border border-app-border p-1 text-center min-h-[2.75rem] align-top transition-[background-color,z-index] duration-75 ${
                canWrite ? "cursor-pointer" : ""
              } ${
                deleteFocus
                  ? "z-[25] ring-1 ring-accent-primary/50"
                  : isCellHovered
                    ? "z-[15]"
                    : "z-0"
              }`}
              style={mergeScheduleCellStyles(
                colMeta
                  ? buildScheduleDayColumnStyle(colMeta, { isDragTarget })
                  : isDragTarget
                    ? {
                        boxShadow: `inset 0 0 0 2px ${designTokens.color.accent.primary}`,
                        backgroundColor: `${designTokens.color.accent.primary}10`,
                      }
                    : undefined,
                scheduleGridCellHoverStyle(gridHover, sg.guardId, d),
              )}
              onMouseEnter={() => setGridHover({ guardId: sg.guardId, day: d })}
              onClick={() => {
                if (!canWrite) return;
                if (dayShifts.length === 0) {
                  triggerQuickAssign(sg.guardId, dateIso, postId);
                  return;
                }
                setShiftDeleteFocus((f) =>
                  f?.guardId === sg.guardId && f?.day === d ? null : { guardId: sg.guardId, day: d },
                );
              }}
            >
              <div className="relative flex min-h-[2.5rem] flex-col gap-0.5">
                {[...dayShifts]
                  .sort((a, b) => {
                    const t = a.startsAt.getTime() - b.startsAt.getTime();
                    if (t !== 0) return t;
                    return a.id.localeCompare(b.id);
                  })
                  .map((s) => {
                    const cardStyle: CSSProperties = {};
                    let surface = "border";
                    if (s.isNoShow) {
                      cardStyle.textDecoration = "line-through";
                      if (s.shiftKind === "Reinforcement") {
                        surface = "border-2";
                        cardStyle.backgroundColor = designTokens.color.shift.reinforcementCellBg;
                        cardStyle.borderColor = designTokens.color.accent.danger;
                      } else if (s.shiftKind === "RapidResponse") {
                        surface = "border-2";
                        cardStyle.backgroundColor = designTokens.color.shift.mobilePostCellBg;
                        cardStyle.borderColor = designTokens.color.accent.warning;
                      } else if (s.shiftKind === "ShiftLead") {
                        surface = "border-2";
                        cardStyle.backgroundColor = designTokens.color.shiftKind.ShiftLead.bg;
                        cardStyle.borderColor = designTokens.color.shiftKind.ShiftLead.border;
                      } else {
                        surface = "border border-app-border bg-app-elevated/80";
                      }
                    } else if (s.shiftKind === "Reinforcement") {
                      surface = "border-2";
                      cardStyle.backgroundColor = designTokens.color.shift.reinforcementCellBg;
                      cardStyle.borderColor = designTokens.color.accent.danger;
                    } else if (s.shiftKind === "RapidResponse") {
                      surface = "border-2";
                      cardStyle.backgroundColor = designTokens.color.shift.mobilePostCellBg;
                      cardStyle.borderColor = designTokens.color.accent.warning;
                    } else if (s.shiftKind === "ShiftLead") {
                      surface = "border-2";
                      cardStyle.backgroundColor = designTokens.color.shiftKind.ShiftLead.bg;
                      cardStyle.borderColor = designTokens.color.shiftKind.ShiftLead.border;
                    } else {
                      surface = "border";
                      cardStyle.backgroundColor = designTokens.color.shift.regularCellBg;
                      cardStyle.borderColor = designTokens.color.border;
                    }
                    return (
                      <div
                        key={s.id}
                        className={`group/shift relative flex flex-col items-center rounded p-0.5 ${surface}`}
                        style={cardStyle}
                      >
                        {canWrite && bulkCreateShiftsAction && !s.isNoShow && !deleteFocus ? (
                          <button
                            type="button"
                            title="Тяните, чтобы скопировать смену в другие дни строки"
                            aria-label="Перетащить смену по другим дням"
                            className="schedule-drag-handle absolute right-0 top-0 z-[15] hidden h-5 w-5 cursor-grab items-center justify-center rounded-sm border border-app-border bg-app-surface text-[10px] leading-none text-app-muted opacity-30 shadow-sm transition-opacity active:cursor-grabbing group-hover/cell:opacity-100"
                            onMouseDown={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setShiftDeleteFocus(null);
                              setDragSource({
                                shiftId: s.id,
                                guardId: sg.guardId,
                                sourceDateIso: dateIso,
                                startTime: toTimeKh(s.startsAt),
                                endTime: toTimeKh(s.endsAt),
                                shiftKind: s.shiftKind,
                                guardName: sg.displayName,
                                postId,
                              });
                              dragTargetIsoRef.current = null;
                              setDragTargetIso(null);
                            }}
                          >
                            ⋮⋮
                          </button>
                        ) : null}
                        {canWrite && deleteFocus ? (
                          <div
                            className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex items-start justify-center gap-0.5 px-0.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!s.isNoShow && !s.incidentRecordedAt ? (
                              <button
                                type="button"
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface shadow-sm outline-none transition hover:bg-accent-warning/15 focus-visible:ring-2 focus-visible:ring-accent-warning/50"
                                style={{ color: designTokens.color.accent.warning }}
                                title="Инцидент по смене"
                                aria-label="Инцидент по смене"
                                onClick={() => {
                                  onIncidentDraft({
                                    shiftId: s.id,
                                    objectId: objectId,
                                    guardId: s.guardId,
                                    guardName: sg.displayName,
                                    dateIso,
                                    startTime: toTimeKh(s.startsAt),
                                    endTime: toTimeKh(s.endsAt),
                                    shiftKind: s.shiftKind,
                                  });
                                  setShiftDeleteFocus(null);
                                }}
                              >
                                <AlertTriangle className="size-3" strokeWidth={2.25} aria-hidden />
                              </button>
                            ) : (
                              <span className="inline-block h-5 w-5 shrink-0" aria-hidden />
                            )}
                            {!s.isNoShow && !s.incidentRecordedAt ? (
                              <button
                                type="button"
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface shadow-sm outline-none transition hover:bg-accent-primary/15 focus-visible:ring-2 focus-visible:ring-accent-primary/50"
                                style={{ color: designTokens.color.accent.primary }}
                                title="Редактировать смену"
                                aria-label="Редактировать смену"
                                onClick={() => {
                                  setShiftDeleteFocus(null);
                                  onQuickAssign({
                                    editingShiftId: s.id,
                                    guardId: s.guardId,
                                    dateIso: scheduleShiftColumnDateIso(s, operationalDayStartTime),
                                    shiftKind: s.shiftKind,
                                    startTime: toTimeKh(s.startsAt),
                                    endTime: toTimeKh(s.endsAt),
                                    postId,
                                  });
                                }}
                              >
                                <Pencil className="size-3" strokeWidth={2.25} aria-hidden />
                              </button>
                            ) : (
                              <span className="inline-block h-5 w-5 shrink-0" aria-hidden />
                            )}
                            {canWrite ? (
                              <form
                                action={deleteShiftAction}
                                className="shrink-0"
                                onSubmit={async (e) => {
                                  if (!confirmDeleteShift(s)) {
                                    e.preventDefault();
                                    return;
                                  }
                                  e.preventDefault();
                                  const form = e.currentTarget;
                                  const fd = new FormData(form);
                                  fd.set("scrollY", String(Math.round(window.scrollY)));
                                  fd.set("noRedirect", "true");
                                  try {
                                    await deleteShiftAction(fd);
                                    setShiftDeleteFocus(null);
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
                                <input type="hidden" name="shiftId" value={s.id} />
                                <input type="hidden" name="noRedirect" value="true" />
                                <input
                                  type="hidden"
                                  name="redirect"
                                  value={`/objects/${objectId}?month=${redirectMonth}`}
                                />
                                <input type="hidden" name="scrollY" defaultValue="0" />
                                <button
                                  type="submit"
                                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-app-border bg-app-surface shadow-sm outline-none transition hover:bg-accent-danger/15 focus-visible:ring-2 focus-visible:ring-accent-danger/50"
                                  style={{ color: designTokens.color.accent.danger }}
                                  title="Удалить смену"
                                  aria-label="Удалить смену"
                                >
                                  <Trash2 className="size-3" strokeWidth={2.25} />
                                </button>
                              </form>
                            ) : (
                              <span className="inline-block h-5 w-5 shrink-0" aria-hidden />
                            )}
                          </div>
                        ) : null}
                        <span className="text-[10px] font-semibold tabular-nums leading-none">
                          {formatDurationRuHours(s.startsAt, s.endsAt)}
                        </span>
                        {s.isNoShow ? (
                          <button
                            type="button"
                            className="text-[9px] text-app-muted leading-none outline-none hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary/40"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canWrite) return;
                              setShiftDeleteFocus(null);
                              onQuickAssign({
                                dateIso,
                                replaceShiftId: s.id,
                                replacedGuardName: sg.displayName,
                                startTime: toTimeKh(s.startsAt),
                                endTime: toTimeKh(s.endsAt),
                                shiftKind: resolveShiftKindForTemplate(
                                  expectedForCell(dateIso, postId),
                                  s.shiftKind,
                                ),
                                postId,
                              });
                            }}
                            title="Назначить замену по инциденту"
                          >
                            {getHoursKhabarovsk(s.startsAt)}-{getHoursKhabarovsk(s.endsAt)}
                          </button>
                        ) : (
                          <span className="text-[9px] text-app-muted leading-none">
                            {getHoursKhabarovsk(s.startsAt)}-{getHoursKhabarovsk(s.endsAt)}
                          </span>
                        )}
                        {s.isNoShow ? (
                          <span
                            className="mt-0.5 text-[8px] font-semibold uppercase leading-none"
                            style={{ color: designTokens.color.accent.danger }}
                          >
                            невыход
                          </span>
                        ) : null}
                        {replacementShiftIds.has(s.id) ? (
                          <span
                            className="mt-0.5 text-[8px] font-semibold uppercase leading-none"
                            style={{ color: designTokens.color.accent.primary }}
                          >
                            замена
                          </span>
                        ) : null}
                        {s.isNoShow && s.replacedByShiftId ? (
                          <span
                            className="mt-0.5 text-[8px] font-semibold uppercase leading-none"
                            style={{ color: designTokens.color.accent.success }}
                          >
                            заменён
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                {canWrite && !shiftDeleteFocus ? (
                  dayShifts.length === 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerQuickAssign(sg.guardId, dateIso, postId);
                      }}
                      className="schedule-cell-add-btn invisible absolute left-0.5 top-0.5 z-10 flex size-5 items-center justify-center rounded-full bg-accent-primary text-white shadow-sm hover:scale-110 group-hover/cell:visible sm:size-4"
                      title="Назначить смену"
                      aria-label="Назначить смену"
                    >
                      <Plus className="size-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerQuickAssign(sg.guardId, dateIso, postId);
                      }}
                      className="schedule-cell-add-btn invisible mt-0.5 flex h-5 w-full shrink-0 items-center justify-center rounded border border-app-border bg-app-elevated/95 text-accent-primary shadow-sm transition hover:border-accent-primary hover:bg-accent-primary/10 group-hover/cell:visible"
                      title="Добавить смену"
                      aria-label="Добавить смену"
                    >
                      <Plus className="size-3" />
                    </button>
                  )
                ) : null}
              </div>
            </td>
          );
        })}
      </tr>
    ));
  }

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-3 shadow-glow sm:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-accent-primary">
          <Calendar className="size-5" />
          <h2 className="text-lg font-semibold">График смен</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Button
            type="button"
            size="sm"
            className="h-8 border-accent-primary bg-accent-primary px-3 text-xs uppercase tracking-wide text-white hover:bg-accent-primary-hover"
            onClick={() => setExportDialog("jpg")}
            title="Экспорт графика в JPG"
          >
            JPG
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 border-accent-success bg-accent-success px-3 text-xs uppercase tracking-wide text-white hover:opacity-90"
            onClick={() => setExportDialog("xlsx")}
            title="Экспорт графика в Excel"
          >
            EXLS
          </Button>
          <span className="text-sm font-medium capitalize">{monthLabel}</span>
          <div className="flex items-center gap-1">
            <Button onClick={() => onShiftMonth(-1)} variant="secondary" size="icon">
              <ChevronLeft className="size-4" />
            </Button>
            <Button onClick={() => onShiftMonth(1)} variant="secondary" size="icon">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-button border px-3 py-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between" style={{ borderColor: `${designTokens.color.accent.primary}44`, backgroundColor: `${designTokens.color.accent.primary}08` }}>
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">
            Операционные сутки
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-app-text">
            {operationalDayDraft} – {operationalDayDraft} (+1)
          </p>
          <p className="mt-1 text-[11px] leading-snug text-app-muted">
            Суточная смена и шкала назначения для {monthLabel}.
          </p>
        </div>

        {canManageOperationalDay ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1">
              <label htmlFor={`operational-day-${objectId}`} className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                Начало суток
              </label>
              <input
                id={`operational-day-${objectId}`}
                type="time"
                step={900}
                value={operationalDayDraft}
                disabled={isSavingOperationalDay}
                onChange={(event) => setOperationalDayDraft(event.target.value)}
                className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm tabular-nums outline-none focus:border-accent-primary disabled:opacity-60"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 pb-0.5">
              {(["08:00", "09:00"] as const).map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={isSavingOperationalDay}
                  onClick={() => {
                    setOperationalDayDraft(preset);
                    void saveOperationalDayStartTime(preset);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                    operationalDayDraft === preset
                      ? "border-accent-primary bg-accent-primary text-white"
                      : "border-app-border bg-app-surface text-app-text hover:bg-app-bg"
                  }`}
                >
                  {preset.slice(0, 2)}–{preset.slice(0, 2)}
                </button>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!operationalDayDirty || isSavingOperationalDay}
              onClick={() => void saveOperationalDayStartTime()}
            >
              {isSavingOperationalDay ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-app-muted">Изменение — у администратора или планировщика.</p>
        )}
      </div>

      <div className="max-w-full rounded-button border border-app-border">
        <div
          className="app-h-scroll"
          onMouseLeave={() => setGridHover(null)}
        >
        <table className="w-max min-w-full border-collapse text-xs">
          <thead>
            <tr className="bg-app-elevated/50">
              <th className="schedule-sticky-col border border-app-border p-1.5 text-left min-w-[6.5rem] sm:min-w-[150px] sm:p-2">
                Охранник
              </th>
              {days.map((d) => {
                const meta = dayColumnMetaByDay.get(d);
                const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
                const dateObj = new Date(viewYear, viewMonth0, d);
                const headerStyle = meta ? buildScheduleDayColumnStyle(meta) : undefined;
                if (meta?.isToday && headerStyle) {
                  headerStyle.boxShadow = `inset 0 -3px 0 0 ${designTokens.color.accent.primary}`;
                }
                return (
                  <th
                    key={d}
                    data-schedule-col={d}
                    className="border border-app-border p-1 text-center min-w-[2.5rem] sm:min-w-[45px] transition-[background-color] duration-75"
                    style={mergeScheduleCellStyles(
                      headerStyle,
                      scheduleGridColumnHoverStyle(gridHover, d),
                    )}
                  >
                    <div className="flex flex-col">
                      <span
                        style={
                          meta?.isToday
                            ? { color: designTokens.color.accent.primary, fontWeight: 700 }
                            : undefined
                        }
                      >
                        {d}
                      </span>
                      <span className="text-[10px] font-normal text-app-muted">
                        {weekdays[getDayKhabarovsk(dateObj)]}
                      </span>
                      {meta?.isHoliday ? (
                        <span
                          className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          style={{ color: designTokens.color.shift.holidayTo }}
                        >
                          празд.
                        </span>
                      ) : meta?.isToday ? (
                        <span
                          className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider"
                          style={{ color: designTokens.color.accent.primary }}
                        >
                          сегодня
                        </span>
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
            {posts.length === 0 ? renderPlanRow(monthPlan, null) : null}
          </thead>
          <tbody>
            {posts.length > 0 ? (
              posts.map((post) => (
                <Fragment key={post.id}>
                  <tr>
                    <td
                      colSpan={days.length + 1}
                      className="bg-app-elevated/60 p-2 text-center text-sm font-bold text-app-text"
                    >
                      {post.name}
                    </td>
                  </tr>
                  {renderPlanRow(monthPlanByPost?.[post.id] ?? monthPlan, post.id)}
                  {renderGuardsRows(post.id)}
                </Fragment>
              ))
            ) : (
              renderGuardsRows(null)
            )}
          </tbody>
          <tfoot className="sticky bottom-0 z-20">
            <tr className="bg-app-elevated/95 backdrop-blur-sm shadow-[0_-2px_8px_rgb(15_23_42/0.06)]">
              <th className="schedule-sticky-col schedule-sticky-corner border border-app-border p-1.5 text-left min-w-[6.5rem] text-[9px] font-semibold uppercase tracking-wider text-app-muted sm:min-w-[150px] sm:p-2 sm:text-[10px]">
                Дата
              </th>
              {days.map((d) => {
                const meta = dayColumnMetaByDay.get(d);
                const weekdays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
                const dateObj = new Date(viewYear, viewMonth0, d);
                const headerStyle = meta ? buildScheduleDayColumnStyle(meta) : undefined;
                if (meta?.isToday && headerStyle) {
                  headerStyle.boxShadow = `inset 0 3px 0 0 ${designTokens.color.accent.primary}`;
                }
                return (
                  <th
                    key={`footer-${d}`}
                    data-schedule-col={d}
                    className="border border-app-border bg-app-elevated/95 p-1 text-center min-w-[2.5rem] sm:min-w-[45px]"
                    style={headerStyle}
                  >
                    <div className="flex flex-col">
                      <span
                        style={
                          meta?.isToday
                            ? { color: designTokens.color.accent.primary, fontWeight: 700 }
                            : undefined
                        }
                      >
                        {d}
                      </span>
                      <span className="text-[10px] font-normal text-app-muted">
                        {weekdays[getDayKhabarovsk(dateObj)]}
                      </span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </tfoot>
        </table>
        </div>
      </div>

      {dragSource ? (
        <motion.div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-button border border-accent-primary bg-app-surface px-4 py-2 text-xs font-medium text-app-text shadow-glow"
        >
          Потяните на пустой день в строке охранника и отпустите — смена назначится только на этот день.
        </motion.div>
      ) : null}

      <details className="group mt-4 rounded-card border border-app-border bg-app-elevated/70 p-4 text-sm text-app-text">
        <summary className="flex cursor-pointer items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
          <Info className="size-4 text-accent-primary" aria-hidden />
          <h3 className="font-semibold">Как работать с графиком</h3>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-app-muted group-open:hidden">показать</span>
          <span className="ml-auto hidden text-[10px] uppercase tracking-wider text-app-muted group-open:inline">скрыть</span>
        </summary>
        <div className="mt-3 grid gap-2 text-xs leading-relaxed text-app-muted md:grid-cols-2">
          <div className="flex gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-primary text-[11px] font-bold text-white">
              +
            </span>
            <p>
              Чтобы назначить смену, нажмите на пустую ячейку (на телефоне) или наведите на ячейку и нажмите
              круг с плюсом (на компьютере).
            </p>
          </div>
          <div className="flex gap-2">
            <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
              <span
                className="flex size-5 items-center justify-center rounded-full border bg-app-surface"
                style={{ color: designTokens.color.accent.warning, borderColor: designTokens.color.border }}
              >
                <AlertTriangle className="size-3" aria-hidden />
              </span>
              <span
                className="flex size-5 items-center justify-center rounded-full border bg-app-surface"
                style={{ color: designTokens.color.accent.primary, borderColor: designTokens.color.border }}
              >
                <Pencil className="size-3" aria-hidden />
              </span>
              <span
                className="flex size-5 items-center justify-center rounded-full border bg-app-surface"
                style={{ color: designTokens.color.accent.danger, borderColor: designTokens.color.border }}
              >
                <Trash2 className="size-3" aria-hidden />
              </span>
            </span>
            <p>
              Нажмите на ячейку со сменой — появятся иконки инцидента, редактирования (охранник, время, тип) и
              удаления. Для смены с невыходом нажмите на время, чтобы назначить замену, или на ячейку — чтобы
              удалить запись об инциденте.
            </p>
          </div>
          {bulkCreateShiftsAction ? (
            <div className="flex gap-2">
              <span className="mt-0.5 shrink-0 rounded border border-app-border bg-app-surface px-1.5 py-0.5 text-[10px] font-semibold text-app-muted">
                ⋮⋮
              </span>
              <p>
                Потяните за ⋮⋮ на карточке и отпустите на нужном пустом дне в той же строке — одна смена с тем же
                временем.
              </p>
            </div>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-2 md:col-span-2">
            <div className="flex items-center gap-2">
              <span
                className="h-5 w-10 shrink-0 rounded border-2"
                style={{
                  backgroundColor: designTokens.color.shift.reinforcementCellBg,
                  borderColor: designTokens.color.accent.danger,
                }}
                aria-hidden
              />
              <span>Красная ячейка — смена усиления.</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="h-5 w-10 shrink-0 rounded border-2"
                style={{
                  backgroundColor: designTokens.color.shift.mobilePostCellBg,
                  borderColor: designTokens.color.accent.warning,
                }}
                aria-hidden
              />
              <span>Жёлтая ячейка — смена мобильного поста (МП).</span>
            </div>
          </div>
        </div>
      </details>

      {exportDialog ? (
        <ScheduleExportDialog
          open
          format={exportDialog}
          objectId={objectId}
          objectName={objectName}
          viewYear={viewYear}
          viewMonth0={viewMonth0}
          monthLabel={monthLabel}
          guardsForGrid={guardsForExport}
          monthShifts={monthShifts}
          operationalDayStartTime={operationalDayStartTime}
          onClose={() => setExportDialog(null)}
        />
      ) : null}
    </section>

  );
}
