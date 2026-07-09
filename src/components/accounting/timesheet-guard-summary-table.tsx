"use client";

import { useState, type JSX, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AttendanceIncidentLine } from "../../lib/scheduling/timesheet";
import { designTokens } from "../../lib/design-tokens";
import type { GuardPayrollHalfSummary } from "../../lib/payroll/timesheet-payroll-summary";
import { halfPeriodShortRu } from "../../lib/payroll/advance-period";
import {
  sortedShiftTypeRateLines,
  type GuardPeriodBreakdown,
  type PeriodHalfBreakdown,
  type ShiftTypeBucket,
} from "../../lib/payroll/timesheet-guard-period-summary";
import type {
  GuardPayrollHalfBreakdown,
  GuardPayrollHalfWithSegments,
  GuardRateSegmentInHalf,
} from "../../lib/payroll/timesheet-guard-profile-segments";
import { shiftKindShortLabels } from "../../lib/operations/status-labels";
import { TimesheetIncidentCell } from "./timesheet-incident-cell";

export type GuardObjectSummaryRow = {
  guardName: string;
  objectName: string;
  shiftsCount: number;
  totalHours: number;
  unworkedHoursTotal: number;
  regularHoursTotal: number;
  reinforcementHoursTotal: number;
  rapidResponseHoursTotal: number;
  holidayHours: number;
  incidentsCount: number;
  attendanceIncidents: AttendanceIncidentLine[];
  clientAmountCents: number;
  guardAmountCents: number;
  marginCents: number;
  unpricedShifts: number;
};

export type GuardObjectGroup = {
  guardName: string;
  items: GuardObjectSummaryRow[];
};

type TimesheetGuardSummaryTableProps = {
  groups: GuardObjectGroup[];
  showPayrollHalves: boolean;
  showPayroll: boolean;
  showFinance: boolean;
  payrollHalfByGuardName?: Map<string, GuardPayrollHalfSummary>;
  payrollHalfMonth?: { year: number; monthIndex0: number };
  objectFilterActive?: boolean;
  guardPeriodByName?: Map<string, GuardPeriodBreakdown>;
  guardPayrollHalfBreakdownByName?: Map<string, GuardPayrollHalfBreakdown>;
};

export function TimesheetGuardSummaryTable({
  groups,
  showPayrollHalves,
  showPayroll,
  showFinance,
  payrollHalfByGuardName,
  payrollHalfMonth,
  objectFilterActive = false,
  guardPeriodByName,
  guardPayrollHalfBreakdownByName,
}: TimesheetGuardSummaryTableProps) {
  const [expandedGuards, setExpandedGuards] = useState<Set<string>>(() => new Set());

  const periodFirst = payrollHalfMonth
    ? halfPeriodShortRu("first", payrollHalfMonth.year, payrollHalfMonth.monthIndex0)
    : "1–15";
  const periodSecond = payrollHalfMonth
    ? halfPeriodShortRu("second", payrollHalfMonth.year, payrollHalfMonth.monthIndex0)
    : "16–31";

  const summaryColSpan =
    10 + (showPayrollHalves ? 4 : 0) + (showPayroll ? 1 : 0) + (showFinance ? 1 : 0);

  const toggleGuard = (guardName: string) => {
    setExpandedGuards((prev) => {
      const next = new Set(prev);
      if (next.has(guardName)) next.delete(guardName);
      else next.add(guardName);
      return next;
    });
  };

  const rows = groups.flatMap((group) => {
    const isMulti = group.items.length > 1;
    const canExpand = isMulti || (objectFilterActive && (!!guardPeriodByName || !!guardPayrollHalfBreakdownByName));
    const isExpanded = canExpand && expandedGuards.has(group.guardName);
    const totals = aggregateGuardItems(group.items);
    const payroll = payrollHalfByGuardName?.get(group.guardName);
    const guardSalaryCents = group.items.reduce((sum, row) => sum + row.guardAmountCents, 0);
    const unpricedTotal = group.items.reduce((sum, row) => sum + row.unpricedShifts, 0);
    const hasUnpriced = showFinance && unpricedTotal > 0;
    const periodBreakdown = guardPeriodByName?.get(group.guardName);

    if (!canExpand) {
      const item = group.items[0]!;
      return [
        <GuardSummaryRow
          key={`${group.guardName}-single`}
          guardName={group.guardName}
          objectCell={<span className="text-app-muted">{item.objectName}</span>}
          item={item}
          showPayrollHalves={showPayrollHalves}
          showPayroll={showPayroll}
          showFinance={showFinance}
          payroll={payroll}
          guardSalaryCents={guardSalaryCents}
          unpricedTotal={unpricedTotal}
          hasUnpriced={hasUnpriced}
        />,
      ];
    }

    const result: JSX.Element[] = [
      <GuardSummaryRow
        key={`${group.guardName}-summary`}
        guardName={group.guardName}
        guardNameCell={
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-left font-medium outline-none transition hover:text-accent-primary focus-visible:ring-2 focus-visible:ring-accent-primary/40"
            onClick={() => toggleGuard(group.guardName)}
            aria-expanded={isExpanded}
          >
            {isExpanded ? (
              <ChevronDown className="size-4 shrink-0 text-app-muted" aria-hidden />
            ) : (
              <ChevronRight className="size-4 shrink-0 text-app-muted" aria-hidden />
            )}
            <span>{group.guardName}</span>
          </button>
        }
        objectCell={
          isMulti ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-left text-app-muted outline-none transition hover:text-app-text focus-visible:ring-2 focus-visible:ring-accent-primary/40"
              onClick={() => toggleGuard(group.guardName)}
              aria-expanded={isExpanded}
            >
              <span>{objectCountLabel(group.items.length)}</span>
            </button>
          ) : (
            <span className="text-app-muted">{group.items[0]?.objectName}</span>
          )
        }
        item={totals}
        showPayrollHalves={showPayrollHalves}
        showPayroll={showPayroll}
        showFinance={showFinance}
        payroll={payroll}
        guardSalaryCents={guardSalaryCents}
        unpricedTotal={unpricedTotal}
        hasUnpriced={hasUnpriced}
        rowClassName="font-medium"
      />,
    ];

    if (isExpanded) {
      if (isMulti) {
        for (const item of group.items) {
          result.push(
            <GuardSummaryRow
              key={`${group.guardName}-${item.objectName}`}
              guardName={group.guardName}
              objectCell={<span className="pl-6 text-app-muted">{item.objectName}</span>}
              item={item}
              showPayrollHalves={showPayrollHalves}
              showPayroll={showPayroll}
              showFinance={showFinance}
              hideGuardName
              hidePayrollColumns
              hasUnpriced={showFinance && item.unpricedShifts > 0}
              rowClassName="bg-app-elevated/40"
            />,
          );
        }
      }

      if (objectFilterActive && payrollHalfMonth) {
        result.push(
          <tr key={`${group.guardName}-period-detail`} className="border-t border-app-border bg-app-elevated/30">
            <td colSpan={summaryColSpan} className="px-4 py-4">
              <GuardPeriodBreakdownPanel
                breakdown={periodBreakdown}
                payrollHalfBreakdown={guardPayrollHalfBreakdownByName?.get(group.guardName)}
                periodFirst={periodFirst}
                periodSecond={periodSecond}
                showPayroll={showPayroll}
              />
            </td>
          </tr>,
        );
      }
    }

    return result;
  });

  return (
    <>
      <div className="hidden md:block app-scroll-table">
        <table className="w-full min-w-[1100px] text-left text-sm">
        <thead className="bg-app-elevated text-app-muted">
          <tr>
            <th className="px-4 py-3">Охранник</th>
            <th className="px-4 py-3">Объект</th>
            <th className="px-4 py-3 text-center">Смен</th>
            <th className="px-4 py-3 text-center">Всего</th>
            <th className="px-4 py-3 text-center">Не отраб.</th>
            <th className="px-4 py-3 text-center">Обыч</th>
            <th className="px-4 py-3 text-center">Усил</th>
            <th className="px-4 py-3 text-center">МП</th>
            <th className="px-4 py-3 text-center">Праздник</th>
            <th className="px-4 py-3 text-center">Инциденты</th>
            {showPayrollHalves ? (
              <>
                <th className="px-4 py-3 text-center">
                  <TwoLineHeader title="Аванс" subtitle={periodFirst} />
                </th>
                <th className="px-4 py-3 text-center">
                  <TwoLineHeader title="Аванс" subtitle={periodSecond} />
                </th>
                <th className="px-4 py-3 text-center">
                  <TwoLineHeader title="К выдаче" subtitle={periodFirst} />
                </th>
                <th className="px-4 py-3 text-center">
                  <TwoLineHeader title="К выдаче" subtitle={periodSecond} />
                </th>
              </>
            ) : null}
            {showPayroll ? (
              <th className="px-4 py-3 text-center">
                <TwoLineHeader title="Итого за" subtitle="месяц" />
              </th>
            ) : null}
            {showFinance ? <th className="px-4 py-3 text-center">Без ставки</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows}
          {groups.length === 0 ? (
            <tr className="border-t border-app-border">
              <td className="px-4 py-8 text-app-muted" colSpan={summaryColSpan}>
                Смены не найдены.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-xs text-app-muted">Смены не найдены.</p>
        ) : (
          groups.map((group) => (
            <GuardSummaryMobileCard
              key={group.guardName}
              group={group}
              expanded={expandedGuards.has(group.guardName)}
              onToggle={() => toggleGuard(group.guardName)}
              showPayrollHalves={showPayrollHalves}
              showPayroll={showPayroll}
              showFinance={showFinance}
              payroll={payrollHalfByGuardName?.get(group.guardName)}
              periodFirst={periodFirst}
              periodSecond={periodSecond}
              objectFilterActive={objectFilterActive}
              periodBreakdown={guardPeriodByName?.get(group.guardName)}
              payrollHalfBreakdown={guardPayrollHalfBreakdownByName?.get(group.guardName)}
            />
          ))
        )}
      </div>
    </>
  );
}

function GuardSummaryMobileCard({
  group,
  expanded,
  onToggle,
  showPayrollHalves,
  showPayroll,
  showFinance,
  payroll,
  periodFirst,
  periodSecond,
  objectFilterActive = false,
  periodBreakdown,
  payrollHalfBreakdown,
}: {
  group: GuardObjectGroup;
  expanded: boolean;
  onToggle: () => void;
  showPayrollHalves: boolean;
  showPayroll: boolean;
  showFinance: boolean;
  payroll?: GuardPayrollHalfSummary;
  periodFirst: string;
  periodSecond: string;
  objectFilterActive?: boolean;
  periodBreakdown?: GuardPeriodBreakdown;
  payrollHalfBreakdown?: GuardPayrollHalfBreakdown;
}) {
  const isMulti = group.items.length > 1;
  const canExpand = isMulti || (objectFilterActive && (!!periodBreakdown || !!payrollHalfBreakdown));
  const totals = aggregateGuardItems(group.items);
  const guardSalaryCents = group.items.reduce((sum, row) => sum + row.guardAmountCents, 0);
  const unpricedTotal = group.items.reduce((sum, row) => sum + row.unpricedShifts, 0);
  const hasUnpriced = showFinance && unpricedTotal > 0;

  return (
    <article
      className="rounded-card border border-app-border bg-app-bg text-xs"
      style={
        hasUnpriced ? { boxShadow: `inset 3px 0 0 0 ${designTokens.color.accent.warning}` } : undefined
      }
    >
      <button
        type="button"
        className="flex w-full items-start gap-2 p-3 text-left outline-none transition hover:bg-app-elevated/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary/40"
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? expanded : undefined}
        disabled={!canExpand}
      >
        {canExpand ? (
          expanded ? (
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-app-muted" aria-hidden />
          ) : (
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-app-muted" aria-hidden />
          )
        ) : (
          <span className="mt-0.5 size-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-app-text">{group.guardName}</p>
          {!expanded ? (
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
              {showPayrollHalves ? (
                <>
                  <MobileMoneyStat
                    label={`К выдаче ${periodFirst}`}
                    value={formatRubWhole(payroll?.toPayFirstHalfRub ?? 0)}
                  />
                  <MobileMoneyStat
                    label={`К выдаче ${periodSecond}`}
                    value={formatRubWhole(payroll?.toPaySecondHalfRub ?? 0)}
                  />
                </>
              ) : null}
              {showPayroll ? (
                <MobileMoneyStat label="Итого" value={formatRub(guardSalaryCents)} className="col-span-2" />
              ) : !showPayrollHalves ? (
                <MobileStat label="Всего" value={formatHours(totals.totalHours)} className="col-span-2" />
              ) : null}
            </dl>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-app-border px-3 pb-3 pt-2">
          <div className="flex items-start justify-between gap-2">
            {isMulti ? (
              <span className="text-[11px] text-app-muted">{objectCountLabel(group.items.length)}</span>
            ) : (
              <span className="truncate text-[11px] text-app-muted">{group.items[0]?.objectName}</span>
            )}
          </div>

          <GuardSummaryStats item={totals} />

          {showPayrollHalves ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-app-border pt-3">
              <MobileMoneyStat label={`Аванс ${periodFirst}`} value={formatRubWhole(payroll?.advanceFirstHalfRub ?? 0)} muted />
              <MobileMoneyStat label={`Аванс ${periodSecond}`} value={formatRubWhole(payroll?.advanceSecondHalfRub ?? 0)} muted />
              <MobileMoneyStat label={`К выдаче ${periodFirst}`} value={formatRubWhole(payroll?.toPayFirstHalfRub ?? 0)} />
              <MobileMoneyStat label={`К выдаче ${periodSecond}`} value={formatRubWhole(payroll?.toPaySecondHalfRub ?? 0)} />
            </dl>
          ) : null}

          {(showPayroll || showFinance) && (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-app-border pt-2">
              {showPayroll ? (
                <MobileMoneyStat label="Итого за месяц" value={formatRub(guardSalaryCents)} className="col-span-2" />
              ) : null}
              {showFinance ? (
                <MobileMoneyStat label="Без ставки" value={String(unpricedTotal)} muted />
              ) : null}
            </dl>
          )}

          {isMulti ? (
            <div className="space-y-2 border-t border-app-border pt-3">
              {group.items.map((item) => (
                <div key={item.objectName} className="rounded-button border border-app-border/70 bg-app-elevated/40 p-2.5">
                  <p className="truncate font-medium text-app-text">{item.objectName}</p>
                  <GuardSummaryStats item={item} compact />
                  {showFinance && item.unpricedShifts > 0 ? (
                    <p className="mt-1 text-[10px] text-accent-warning">Без ставки: {item.unpricedShifts}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {objectFilterActive && (periodBreakdown || payrollHalfBreakdown) ? (
            <div className="border-t border-app-border pt-3">
              <GuardPeriodBreakdownPanel
                breakdown={periodBreakdown}
                payrollHalfBreakdown={payrollHalfBreakdown}
                periodFirst={periodFirst}
                periodSecond={periodSecond}
                showPayroll={showPayroll}
                compact
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function GuardSummaryStats({ item, compact = false }: { item: GuardObjectSummaryRow; compact?: boolean }) {
  return (
    <dl className={`grid grid-cols-3 gap-x-2 gap-y-1.5 ${compact ? "mt-2" : ""}`}>
      <MobileStat label="Смен" value={String(item.shiftsCount)} muted />
      <MobileStat label="Всего" value={formatHours(item.totalHours)} />
      <MobileStat label="Не отраб." value={formatHours(item.unworkedHoursTotal)} muted />
      <MobileStat label="Обыч" value={formatHours(item.regularHoursTotal)} />
      <MobileStat label="Усил" value={formatHours(item.reinforcementHoursTotal)} />
      <MobileStat label="МП" value={formatHours(item.rapidResponseHoursTotal)} />
      <MobileStat label="Праздник" value={formatHours(item.holidayHours)} />
      <MobileStat
        label="Инц."
        value={<TimesheetIncidentCell count={item.incidentsCount} lines={item.attendanceIncidents} />}
        muted
        className="col-span-2"
      />
    </dl>
  );
}

function MobileStat({
  label,
  value,
  muted = false,
  className = "",
}: {
  label: string;
  value: ReactNode;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase text-app-muted">{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-app-muted" : "font-medium text-app-text"}`}>{value}</dd>
    </div>
  );
}

function MobileMoneyStat({
  label,
  value,
  muted = false,
  className = "",
}: {
  label: string;
  value: string;
  muted?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-[10px] uppercase leading-snug text-app-muted">{label}</dt>
      <dd className={`tabular-nums ${muted ? "text-app-muted" : "font-semibold text-app-text"}`}>{value} ₽</dd>
    </div>
  );
}

function TwoLineHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <span className="flex flex-col items-center leading-tight">
      <span>{title}</span>
      <span className="text-[11px] font-normal">{subtitle}</span>
    </span>
  );
}

type GuardSummaryRowProps = {
  guardName: string;
  guardNameCell?: ReactNode;
  objectCell: ReactNode;
  item: GuardObjectSummaryRow;
  showPayrollHalves: boolean;
  showPayroll: boolean;
  showFinance: boolean;
  payroll?: GuardPayrollHalfSummary;
  guardSalaryCents?: number;
  unpricedTotal?: number;
  hasUnpriced?: boolean;
  hideGuardName?: boolean;
  hidePayrollColumns?: boolean;
  rowClassName?: string;
};

function GuardSummaryRow({
  guardName,
  guardNameCell,
  objectCell,
  item,
  showPayrollHalves,
  showPayroll,
  showFinance,
  payroll,
  guardSalaryCents = 0,
  unpricedTotal = 0,
  hasUnpriced = false,
  hideGuardName = false,
  hidePayrollColumns = false,
  rowClassName,
}: GuardSummaryRowProps) {
  return (
    <tr
      className={`border-t border-app-border ${rowClassName ?? ""}`}
      style={
        hasUnpriced ? { boxShadow: `inset 4px 0 0 0 ${designTokens.color.accent.warning}` } : undefined
      }
    >
      {hideGuardName ? (
        <td className="px-4 py-3" aria-hidden />
      ) : (
        <td className="px-4 py-3">{guardNameCell ?? <span className="font-medium">{guardName}</span>}</td>
      )}
      <td className="px-4 py-3">{objectCell}</td>
      <td className="px-4 py-3 text-center text-app-muted">{item.shiftsCount}</td>
      <td className="px-4 py-3 text-center">{formatHours(item.totalHours)}</td>
      <td className="px-4 py-3 text-center text-app-muted">{formatHours(item.unworkedHoursTotal)}</td>
      <td className="px-4 py-3 text-center">{formatHours(item.regularHoursTotal)}</td>
      <td className="px-4 py-3 text-center">{formatHours(item.reinforcementHoursTotal)}</td>
      <td className="px-4 py-3 text-center">{formatHours(item.rapidResponseHoursTotal)}</td>
      <td className="px-4 py-3 text-center">{formatHours(item.holidayHours)}</td>
      <td className="px-4 py-3 text-center text-app-muted">
        <TimesheetIncidentCell count={item.incidentsCount} lines={item.attendanceIncidents} />
      </td>
      {showPayrollHalves && !hidePayrollColumns ? (
        <>
          <td className="px-4 py-3 text-center tabular-nums text-app-muted">
            {formatRubWhole(payroll?.advanceFirstHalfRub ?? 0)}
          </td>
          <td className="px-4 py-3 text-center tabular-nums text-app-muted">
            {formatRubWhole(payroll?.advanceSecondHalfRub ?? 0)}
          </td>
          <td className="px-4 py-3 text-center tabular-nums">
            {formatRubWhole(payroll?.toPayFirstHalfRub ?? 0)}
          </td>
          <td className="px-4 py-3 text-center tabular-nums">
            {formatRubWhole(payroll?.toPaySecondHalfRub ?? 0)}
          </td>
        </>
      ) : showPayrollHalves ? (
        <>
          <td className="px-4 py-3" />
          <td className="px-4 py-3" />
          <td className="px-4 py-3" />
          <td className="px-4 py-3" />
        </>
      ) : null}
      {showPayroll && !hidePayrollColumns ? (
        <td className="px-4 py-3 text-center">{formatRub(guardSalaryCents)}</td>
      ) : showPayroll ? (
        <td className="px-4 py-3" />
      ) : null}
      {showFinance && !hidePayrollColumns ? (
        <td className="px-4 py-3 text-center text-app-muted">{unpricedTotal}</td>
      ) : showFinance ? (
        <td className="px-4 py-3" />
      ) : null}
    </tr>
  );
}

function aggregateGuardItems(items: GuardObjectSummaryRow[]): GuardObjectSummaryRow {
  const attendanceIncidents = items
    .flatMap((item) => item.attendanceIncidents)
    .sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());

  return {
    guardName: items[0]?.guardName ?? "",
    objectName: objectCountLabel(items.length),
    shiftsCount: items.reduce((sum, item) => sum + item.shiftsCount, 0),
    totalHours: round2(items.reduce((sum, item) => sum + item.totalHours, 0)),
    unworkedHoursTotal: round2(items.reduce((sum, item) => sum + item.unworkedHoursTotal, 0)),
    regularHoursTotal: round2(items.reduce((sum, item) => sum + item.regularHoursTotal, 0)),
    reinforcementHoursTotal: round2(items.reduce((sum, item) => sum + item.reinforcementHoursTotal, 0)),
    rapidResponseHoursTotal: round2(items.reduce((sum, item) => sum + item.rapidResponseHoursTotal, 0)),
    holidayHours: round2(items.reduce((sum, item) => sum + item.holidayHours, 0)),
    incidentsCount: items.reduce((sum, item) => sum + item.incidentsCount, 0),
    attendanceIncidents,
    clientAmountCents: items.reduce((sum, item) => sum + item.clientAmountCents, 0),
    guardAmountCents: items.reduce((sum, item) => sum + item.guardAmountCents, 0),
    marginCents: items.reduce((sum, item) => sum + item.marginCents, 0),
    unpricedShifts: items.reduce((sum, item) => sum + item.unpricedShifts, 0),
  };
}

function objectCountLabel(count: number): string {
  if (count === 1) return "1 объект";
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${count} объекта`;
  return `${count} объектов`;
}

function formatHours(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded} ч`;
}

function formatRub(cents: number): string {
  return (cents / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRubWhole(rubles: number): string {
  return rubles.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const SHIFT_TYPE_LABELS: Record<ShiftTypeBucket, string> = {
  regular: shiftKindShortLabels.Regular,
  reinforcement: shiftKindShortLabels.Reinforcement,
  rapidResponse: shiftKindShortLabels.RapidResponse,
};

function GuardPeriodBreakdownPanel({
  breakdown,
  payrollHalfBreakdown,
  periodFirst,
  periodSecond,
  showPayroll,
  compact = false,
}: {
  breakdown?: GuardPeriodBreakdown;
  payrollHalfBreakdown?: GuardPayrollHalfBreakdown;
  periodFirst: string;
  periodSecond: string;
  showPayroll: boolean;
  compact?: boolean;
}) {
  if (payrollHalfBreakdown) {
    return (
      <div className={`space-y-4 ${compact ? "text-[11px]" : "text-xs"}`}>
        <PayrollHalfDetailSection
          title={`Период ${periodFirst}`}
          half={payrollHalfBreakdown.first}
          showPayroll={showPayroll}
          compact={compact}
        />
        <PayrollHalfDetailSection
          title={`Период ${periodSecond}`}
          half={payrollHalfBreakdown.second}
          showPayroll={showPayroll}
          compact={compact}
        />
      </div>
    );
  }

  if (!breakdown) return null;

  return (
    <div className={`space-y-4 ${compact ? "text-[11px]" : "text-xs"}`}>
      <PeriodHalfSection
        title={`Период ${periodFirst}`}
        half={breakdown.first}
        showPayroll={showPayroll}
        compact={compact}
      />
      <PeriodHalfSection
        title={`Период ${periodSecond}`}
        half={breakdown.second}
        showPayroll={showPayroll}
        compact={compact}
      />
    </div>
  );
}

function PayrollHalfDetailSection({
  title,
  half,
  showPayroll,
  compact,
}: {
  title: string;
  half: GuardPayrollHalfWithSegments;
  showPayroll: boolean;
  compact: boolean;
}) {
  if (half.shiftsCount === 0) {
    return (
      <section>
        <h4 className="mb-2 font-semibold text-app-text">{title}</h4>
        <p className="text-app-muted">Смен нет</p>
      </section>
    );
  }

  return (
    <section className="rounded-button border border-app-border/70 bg-app-bg/60 p-3">
      <h4 className="mb-2 font-semibold text-app-text">{title}</h4>
      <p className="mb-3 text-app-muted">
        Смен: {half.shiftsCount} · Всего: {formatHours(half.totalHours)} · Не отраб.:{" "}
        {formatHours(half.unworkedHours)} · Праздник: {formatHours(half.holidayHours)}
        {showPayroll ? ` · Начислено: ${formatRub(half.guardAmountCents)} ₽` : null}
      </p>
      <div className="space-y-3">
        {half.segments.map((segment, index) => (
          <RateSegmentBlock
            key={`${segment.profileLabel}-${segment.rateSinceLabel ?? "base"}-${index}`}
            segment={segment}
            showPayroll={showPayroll}
            compact={compact}
            highlight={Boolean(segment.rateSinceLabel)}
          />
        ))}
      </div>
    </section>
  );
}

function RateSegmentBlock({
  segment,
  showPayroll,
  compact,
  highlight,
}: {
  segment: GuardRateSegmentInHalf;
  showPayroll: boolean;
  compact: boolean;
  highlight: boolean;
}) {
  return (
    <div
      className="rounded-button border border-app-border/60 bg-app-elevated/30 p-2.5"
      style={highlight ? { boxShadow: `inset 3px 0 0 0 ${designTokens.color.accent.warning}` } : undefined}
    >
      <p className="mb-2 text-app-muted">{segment.profileLabel}</p>
      <div className={`overflow-x-auto ${compact ? "" : "max-w-4xl"}`}>
        <table className="w-full min-w-[480px] text-left">
          <thead className="text-app-muted">
            <tr>
              <th className="px-2 py-1.5 font-normal">Тип</th>
              <th className="px-2 py-1.5 text-center font-normal">Смен</th>
              <th className="px-2 py-1.5 text-center font-normal">Часы</th>
              <th className="px-2 py-1.5 text-center font-normal">Праздник</th>
              {showPayroll ? <th className="px-2 py-1.5 text-center font-normal">Начислено</th> : null}
              {showPayroll ? <th className="px-2 py-1.5 text-center font-normal">₽/ч ставка</th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedShiftTypeRateLines(segment.byType).map(({ type, line }) => {
              const rateLabel =
                line.hourlyRateCents != null
                  ? `${(line.hourlyRateCents / 100).toLocaleString("ru-RU", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}${segment.rateSinceLabel ? ` (${segment.rateSinceLabel})` : ""}`
                  : "—";
              return (
                <tr key={`${type}-${line.hourlyRateCents ?? "none"}`} className="border-t border-app-border/50">
                  <td className="px-2 py-1.5 font-medium capitalize">{SHIFT_TYPE_LABELS[type]}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-app-muted">{line.shiftsCount}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{formatHours(line.hours)}</td>
                  <td className="px-2 py-1.5 text-center tabular-nums text-app-muted">
                    {line.holidayHours > 0 ? formatHours(line.holidayHours) : "—"}
                  </td>
                  {showPayroll ? (
                    <>
                      <td className="px-2 py-1.5 text-center tabular-nums">{formatRub(line.guardAmountCents)}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums font-medium text-app-text">{rateLabel}</td>
                    </>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PeriodHalfSection({
  title,
  half,
  showPayroll,
  compact,
}: {
  title: string;
  half: PeriodHalfBreakdown;
  showPayroll: boolean;
  compact: boolean;
}) {
  const hasData = half.shiftsCount > 0;
  if (!hasData) {
    return (
      <section>
        <h4 className="mb-2 font-semibold text-app-text">{title}</h4>
        <p className="text-app-muted">Смен нет</p>
      </section>
    );
  }

  return (
    <section>
      <h4 className="mb-2 font-semibold text-app-text">{title}</h4>
      <p className="mb-2 text-app-muted">
        Смен: {half.shiftsCount} · Всего: {formatHours(half.totalHours)} · Не отраб.: {formatHours(half.unworkedHours)} ·
        Праздник: {formatHours(half.holidayHours)}
        {showPayroll ? ` · Начислено: ${formatRub(half.guardAmountCents)} ₽` : null}
      </p>
      <div className={`overflow-x-auto rounded-button border border-app-border/70 ${compact ? "" : "max-w-4xl"}`}>
        <table className="w-full min-w-[520px] text-left">
          <thead className="bg-app-elevated/80 text-app-muted">
            <tr>
              <th className="px-3 py-2 font-normal">Тип</th>
              <th className="px-3 py-2 text-center font-normal">Смен</th>
              <th className="px-3 py-2 text-center font-normal">Часы</th>
              <th className="px-3 py-2 text-center font-normal">Праздник</th>
              {showPayroll ? <th className="px-3 py-2 text-center font-normal">Начислено</th> : null}
              {showPayroll ? <th className="px-3 py-2 text-center font-normal">₽/ч ставка</th> : null}
            </tr>
          </thead>
          <tbody>
            {sortedShiftTypeRateLines(half.byType).map(({ type, line }) => (
              <tr key={`${type}-${line.hourlyRateCents ?? "none"}`} className="border-t border-app-border/60">
                <td className="px-3 py-2 font-medium capitalize">{SHIFT_TYPE_LABELS[type]}</td>
                <td className="px-3 py-2 text-center tabular-nums text-app-muted">{line.shiftsCount}</td>
                <td className="px-3 py-2 text-center tabular-nums">{formatHours(line.hours)}</td>
                <td className="px-3 py-2 text-center tabular-nums text-app-muted">
                  {line.holidayHours > 0 ? formatHours(line.holidayHours) : "—"}
                </td>
                {showPayroll ? (
                  <>
                    <td className="px-3 py-2 text-center tabular-nums">{formatRub(line.guardAmountCents)}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-app-muted">
                      {line.hourlyRateCents != null
                        ? (line.hourlyRateCents / 100).toLocaleString("ru-RU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
