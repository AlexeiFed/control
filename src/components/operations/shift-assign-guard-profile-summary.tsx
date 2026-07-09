"use client";

import { useMemo } from "react";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import { designTokens } from "../../lib/design-tokens";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
} from "../../lib/operations/status-labels";
import { mapGuardLicenseForRates } from "../../lib/scheduling/guard-profile";
import type { Guard, ShiftKind } from "../../lib/scheduling/types";
import { guardHasMatchingRateRulesForProfile } from "../../lib/rates/shift-rate-selection";

export type ShiftAssignGuardProfileSummaryProps = {
  guard: Guard | null;
  objectId: string;
  rateRules: readonly ObjectRateRuleRecord[];
  shiftKind: ShiftKind;
  shiftDateIso: string;
  holidayDateKeys: ReadonlySet<string>;
};

export function ShiftAssignGuardProfileSummary({
  guard,
  objectId,
  rateRules,
  shiftKind,
  shiftDateIso,
  holidayDateKeys,
}: ShiftAssignGuardProfileSummaryProps) {
  const hasMatchingRules = useMemo(() => {
    if (!guard) return true;
    return guardHasMatchingRateRulesForProfile(
      rateRules,
      objectId,
      guard,
      shiftKind,
      shiftDateIso,
      holidayDateKeys,
    );
  }, [guard, rateRules, objectId, shiftKind, shiftDateIso, holidayDateKeys]);

  if (!guard) return null;

  const licenseLabel = guardLicenseLabels[mapGuardLicenseForRates(guard)];

  return (
    <div
      className="rounded-button border px-3 py-2.5"
      style={{
        borderColor: designTokens.color.border,
        backgroundColor: designTokens.color.surfaceElevated,
      }}
    >
      <dl className="grid gap-1 text-xs sm:grid-cols-3 sm:gap-x-4">
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Должность</dt>
          <dd className="mt-0.5 font-medium text-app-text">{guardPositionLabels[guard.position]}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Удостоверение</dt>
          <dd className="mt-0.5 font-medium text-app-text">{licenseLabel}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">Трудоустройство</dt>
          <dd className="mt-0.5 font-medium text-app-text">{guardEmploymentLabels[guard.employmentType]}</dd>
        </div>
      </dl>
      {!hasMatchingRules ? (
        <p
          className="mt-2.5 text-xs font-bold leading-snug"
          style={{ color: designTokens.color.accent.danger }}
        >
          Правило ставки для данного охранника отсутствует
        </p>
      ) : null}
    </div>
  );
}
