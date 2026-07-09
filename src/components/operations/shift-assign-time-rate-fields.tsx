"use client";

import { useMemo } from "react";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import { designTokens } from "../../lib/design-tokens";
import { rateUnitLabels } from "../../lib/operations/status-labels";
import { buildQuickTimePresets, type QuickTimePreset } from "../../lib/scheduling/quick-time-presets";
import { offsetsToHmPair, presetToOffsets } from "../../lib/scheduling/operational-day-timeline";
import { ShiftOperationalDayTimeline } from "./shift-operational-day-timeline";
import type { Guard, RateUnit, Shift, ShiftKind } from "../../lib/scheduling/types";
import {
  buildRateRuleTimePresets,
  describeShiftRateAssignment,
  estimateCustomGuardAmountCents,
  estimateGuardAmountCentsForRule,
  findRateRuleById,
  formatRateRuleDaysOfWeekLabel,
  formatRublesFromCents,
  formatShiftRateAssignmentSummary,
  listManualSelectableRateRules,
  listRateRulesForGuardProfile,
  type RateRuleTimePreset,
  shiftDurationMinutesFromTimes,
  shiftHasStoredRateAssignment,
  shiftNeedsManualRateRuleSelection,
} from "../../lib/rates/shift-rate-selection";

export type ShiftAssignTimeRateFieldsProps = {
  objectId: string;
  operationalDayStartTime?: string;
  rateRules: readonly ObjectRateRuleRecord[];
  guard: Guard | null;
  shiftKind: ShiftKind;
  shiftDateIso: string;
  holidayDateKeys: ReadonlySet<string>;
  startTime: string;
  endTime: string;
  onStartTimeChange: (value: string) => void;
  onEndTimeChange: (value: string) => void;
  selectedRateRuleId: string;
  onSelectedRateRuleIdChange: (ruleId: string) => void;
  canSetCustomRate: boolean;
  showClientRate?: boolean;
  useCustomRate: boolean;
  onUseCustomRateChange: (value: boolean) => void;
  manualGuardRubles: string;
  onManualGuardRublesChange: (value: string) => void;
  manualClientRubles: string;
  onManualClientRublesChange: (value: string) => void;
  manualRateUnit: RateUnit;
  onManualRateUnitChange: (value: RateUnit) => void;
  manualRateReason: string;
  onManualRateReasonChange: (value: string) => void;
  /** Смена при редактировании — показываем сохранённую ставку/правило. */
  editingShift?: Shift | null;
  /** Уже назначенные смены охранника — подсветка занятости на шкале. */
  occupiedIntervals?: ReadonlyArray<{ startsAt: Date; endsAt: Date }>;
};

export function ShiftAssignTimeRateFields({
  objectId,
  operationalDayStartTime,
  rateRules,
  guard,
  shiftKind,
  shiftDateIso,
  holidayDateKeys,
  startTime,
  endTime,
  onStartTimeChange,
  onEndTimeChange,
  selectedRateRuleId,
  onSelectedRateRuleIdChange,
  canSetCustomRate,
  showClientRate = false,
  useCustomRate,
  onUseCustomRateChange,
  manualGuardRubles,
  onManualGuardRublesChange,
  manualClientRubles,
  onManualClientRublesChange,
  manualRateUnit,
  onManualRateUnitChange,
  manualRateReason,
  onManualRateReasonChange,
  editingShift = null,
  occupiedIntervals = [],
}: ShiftAssignTimeRateFieldsProps) {
  const durationMinutes = useMemo(
    () => shiftDurationMinutesFromTimes(shiftDateIso, startTime, endTime, operationalDayStartTime),
    [shiftDateIso, startTime, endTime, operationalDayStartTime],
  );

  const quickPresets = useMemo(
    () => buildQuickTimePresets(operationalDayStartTime),
    [operationalDayStartTime],
  );

  const timePresets = useMemo((): ReadonlyArray<QuickTimePreset | RateRuleTimePreset> => {
    if (!guard || rateRules.length === 0) return quickPresets;
    const fromRules = buildRateRuleTimePresets(
      rateRules,
      objectId,
      guard,
      shiftKind,
      shiftDateIso,
      holidayDateKeys,
    );
    return fromRules.length > 0 ? fromRules : quickPresets;
  }, [guard, rateRules, objectId, shiftKind, shiftDateIso, holidayDateKeys, quickPresets]);

  const manualRateRules = useMemo(() => {
    if (!guard) return { dayMatched: [], otherWeekdays: [] };
    return listManualSelectableRateRules(
      rateRules,
      objectId,
      guard,
      shiftKind,
      shiftDateIso,
      holidayDateKeys,
    );
  }, [guard, rateRules, objectId, shiftKind, shiftDateIso, holidayDateKeys]);

  const selectableRules = manualRateRules.dayMatched;
  const otherWeekdayRules = manualRateRules.otherWeekdays;

  const pinnedAssignedRules = useMemo(() => {
    if (!editingShift?.selectedRateRuleId) return [];
    const rule = findRateRuleById(rateRules, editingShift.selectedRateRuleId);
    if (!rule) return [];
    const listed =
      selectableRules.some((item) => item.id === rule.id) ||
      otherWeekdayRules.some((item) => item.id === rule.id);
    return listed ? [] : [rule];
  }, [editingShift?.selectedRateRuleId, rateRules, selectableRules, otherWeekdayRules]);

  const allManualSelectableCount =
    selectableRules.length + otherWeekdayRules.length + pinnedAssignedRules.length;

  const needsManualRate = useMemo(() => {
    if (!guard || rateRules.length === 0) return false;
    return shiftNeedsManualRateRuleSelection({
      objectId,
      guard,
      shiftKind,
      shiftDateIso,
      startTime,
      endTime,
      rules: rateRules,
      holidayDates: holidayDateKeys,
      manualClientRateCents: editingShift?.manualClientRateCents,
      manualGuardRateCents: editingShift?.manualGuardRateCents,
      operationalDayStartTime,
    });
  }, [
    guard,
    rateRules,
    objectId,
    shiftKind,
    shiftDateIso,
    startTime,
    endTime,
    holidayDateKeys,
    operationalDayStartTime,
    editingShift?.manualClientRateCents,
    editingShift?.manualGuardRateCents,
  ]);

  const showRateSelection = needsManualRate || shiftHasStoredRateAssignment(editingShift);

  const assignmentSummary = useMemo(() => {
    if (!editingShift || !guard) return null;
    return describeShiftRateAssignment(editingShift, guard, rateRules, holidayDateKeys);
  }, [editingShift, guard, rateRules, holidayDateKeys]);

  const customEstimateCents = useMemo(
    () => estimateCustomGuardAmountCents(manualGuardRubles, manualRateUnit, durationMinutes),
    [manualGuardRubles, manualRateUnit, durationMinutes],
  );

  function renderRateRuleOption(rule: ObjectRateRuleRecord, showWeekdays = false) {
    const amount = estimateGuardAmountCentsForRule(rule, durationMinutes);
    const checked = !useCustomRate && selectedRateRuleId === rule.id;
    const weekdaysLabel = showWeekdays ? formatRateRuleDaysOfWeekLabel(rule) : null;
    return (
      <label
        key={rule.id}
        className={`flex cursor-pointer items-start gap-2 rounded-button border px-2.5 py-2 text-xs transition ${
          checked ? "border-accent-primary bg-app-surface" : "border-app-border bg-app-bg/60"
        }`}
      >
        <input
          type="radio"
          name="rateRuleId"
          value={rule.id}
          checked={checked}
          onChange={() => {
            onUseCustomRateChange(false);
            onSelectedRateRuleIdChange(rule.id);
          }}
          className="mt-0.5"
        />
        <span className="leading-snug">
          <span className="font-medium text-app-text">{rule.name}</span>
          <span className="text-app-muted">
            {" "}
            · {formatRublesFromCents(rule.guardRateCents)} ₽/{rateUnitLabels[rule.rateUnit].toLowerCase()}
            {rule.startsAt && rule.endsAt ? ` · ${rule.startsAt.slice(0, 5)}–${rule.endsAt.slice(0, 5)}` : ""}
            {weekdaysLabel ? ` · ${weekdaysLabel}` : ""}
            {" · ≈ "}
            {formatRublesFromCents(amount)} ₽ за смену
          </span>
        </span>
      </label>
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-app-muted">
          {rateRules.length > 0 && guard ? "Время по ставкам:" : "Шаблон времени:"}
        </span>
        {timePresets.map((preset) => {
          const active = startTime === preset.startTime && endTime === preset.endTime;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                const { startOffset, endOffset } = presetToOffsets(
                  preset.startTime,
                  preset.endTime,
                  operationalDayStartTime,
                );
                const pair = offsetsToHmPair(shiftDateIso, startOffset, endOffset, operationalDayStartTime);
                onStartTimeChange(pair.startTime);
                onEndTimeChange(pair.endTime);
                if ("ruleIds" in preset && preset.ruleIds.length === 1) {
                  onUseCustomRateChange(false);
                  onSelectedRateRuleIdChange(preset.ruleIds[0]!);
                }
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active
                  ? "border-accent-primary bg-accent-primary text-white"
                  : "border-app-border bg-app-surface text-app-text hover:bg-app-bg"
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <ShiftOperationalDayTimeline
        shiftDateIso={shiftDateIso}
        operationalDayStartTime={operationalDayStartTime}
        startTime={startTime}
        endTime={endTime}
        onStartTimeChange={onStartTimeChange}
        onEndTimeChange={onEndTimeChange}
        occupiedIntervals={occupiedIntervals}
      />

      {assignmentSummary ? (
        <div
          className="rounded-button border px-3 py-2.5"
          style={{
            borderColor: `${designTokens.color.accent.primary}55`,
            backgroundColor: `${designTokens.color.accent.primary}10`,
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent-primary">
            Ставка при назначении
          </p>
          <p className="mt-1 text-xs leading-snug text-app-text">
            {formatShiftRateAssignmentSummary(assignmentSummary)}
          </p>
        </div>
      ) : null}

      {showRateSelection ? (
        <div
          className="grid gap-2 rounded-button border px-3 py-3"
          style={{
            borderColor: `${designTokens.color.accent.warning}55`,
            backgroundColor: `${designTokens.color.accent.warning}10`,
          }}
        >
          <p className="text-xs font-semibold text-app-text">Выберите ставку для этого интервала</p>
          <p className="text-[10px] text-app-muted leading-snug">
            Время не совпадает со стандартными интервалами ставок. Укажите тариф — расчёт пойдёт по его
            почасовой ставке на все {Math.round((durationMinutes / 60) * 10) / 10} ч смены.
          </p>
          <div className="grid gap-2">
            {pinnedAssignedRules.length > 0 ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                  Сохранённое правило
                </p>
                {pinnedAssignedRules.map((rule) => renderRateRuleOption(rule))}
              </>
            ) : null}

            {selectableRules.length > 0 ? (
              <>
                {otherWeekdayRules.length > 0 ? (
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                    На этот день
                  </p>
                ) : null}
                {selectableRules.map((rule) => renderRateRuleOption(rule))}
              </>
            ) : null}

            {otherWeekdayRules.length > 0 ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                  Другие дни недели
                </p>
                {otherWeekdayRules.map((rule) => renderRateRuleOption(rule, true))}
              </>
            ) : null}

            {canSetCustomRate ? (
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-button border px-2.5 py-2 text-xs transition ${
                  useCustomRate ? "border-accent-primary bg-app-surface" : "border-app-border bg-app-bg/60"
                }`}
              >
                <input
                  type="radio"
                  name="rateRuleId"
                  value=""
                  checked={useCustomRate}
                  onChange={() => {
                    onUseCustomRateChange(true);
                    onSelectedRateRuleIdChange("");
                  }}
                  className="mt-0.5"
                />
                <span className="w-full leading-snug">
                  <span className="font-medium text-app-text">Произвольная ставка для этой смены</span>
                  <span className="block text-app-muted">
                    Укажите сумму вручную — только для выбранной смены, без изменения тарифов объекта.
                  </span>
                </span>
              </label>
            ) : null}

            {useCustomRate && canSetCustomRate ? (
              <div className="ml-6 grid gap-3 rounded-button border border-app-border bg-app-surface/80 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                      Ставка охранника, ₽
                    </label>
                    <input
                      type="text"
                      name="manualGuardRubles"
                      inputMode="decimal"
                      value={manualGuardRubles}
                      onChange={(e) => onManualGuardRublesChange(e.target.value)}
                      placeholder="230,77"
                      required
                      className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    />
                  </div>
                  {showClientRate ? (
                    <div className="grid gap-1">
                      <label className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                        Ставка клиента, ₽
                      </label>
                      <input
                        type="text"
                        name="manualClientRubles"
                        inputMode="decimal"
                        value={manualClientRubles}
                        onChange={(e) => onManualClientRublesChange(e.target.value)}
                        placeholder="необязательно"
                        className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                      Единица расчёта
                    </label>
                    <select
                      name="manualRateUnit"
                      value={manualRateUnit}
                      onChange={(e) => onManualRateUnitChange(e.target.value as RateUnit)}
                      required
                      className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    >
                      <option value="Hour">За час</option>
                      <option value="Shift">За смену</option>
                    </select>
                  </div>
                  <div className="grid gap-1">
                    <label className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
                      Причина (необязательно)
                    </label>
                    <input
                      type="text"
                      name="manualRateReason"
                      value={manualRateReason}
                      onChange={(e) => onManualRateReasonChange(e.target.value)}
                      placeholder="Нестандартный интервал"
                      maxLength={200}
                      className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    />
                  </div>
                </div>
                {customEstimateCents != null ? (
                  <p className="text-[11px] text-app-muted">
                    ≈ {formatRublesFromCents(customEstimateCents)} ₽ за смену (
                    {rateUnitLabels[manualRateUnit].toLowerCase()})
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          {allManualSelectableCount === 0 && !canSetCustomRate ? (
            <p className="text-xs text-accent-danger">Нет подходящих ставок для этого охранника и типа смены.</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

export function shiftAssignShowRateSelection(params: {
  guard: Guard | null;
  rateRulesCount: number;
  editingShift: Shift | null | undefined;
  needsManualRate: boolean;
}): boolean {
  if (!params.guard || params.rateRulesCount === 0) return false;
  return params.needsManualRate || shiftHasStoredRateAssignment(params.editingShift);
}

export function shiftAssignSubmitDisabled(params: {
  guardId: string;
  showRateSelection: boolean;
  selectedRateRuleId: string;
  manualSelectableRulesCount: number;
  useCustomRate: boolean;
  manualGuardRubles: string;
  manualRateUnit: string;
}): boolean {
  if (!params.guardId) return true;
  if (params.showRateSelection) {
    if (params.useCustomRate) {
      return !params.manualGuardRubles.trim() || !params.manualRateUnit;
    }
    if (params.manualSelectableRulesCount === 0 && !params.selectedRateRuleId) return true;
    return !params.selectedRateRuleId;
  }
  return false;
}
