import React, { type ReactNode } from "react";
import type { AttendanceIncidentLine, TimesheetRow } from "../../lib/scheduling/timesheet";
import { ButtonLink, buttonVariants } from "../ui/button";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import { designTokens } from "../../lib/design-tokens";
import { formatDisplayDateTimeLocal } from "../../lib/format/display-date";
import { TimesheetGuardSummaryTable } from "./timesheet-guard-summary-table";
import { TimesheetIncidentCell } from "./timesheet-incident-cell";
import { TimesheetFilters } from "../../components/accounting/timesheet-filters";
import { PayrollExportButton } from "./payroll-export-button";
import { PayrollTuExportButton } from "./payroll-tu-export-button";
import { TimesheetXlsxExportButton } from "./timesheet-xlsx-export-button";
import type { GuardPayrollHalfSummary, ObjectPayrollHalfSummary } from "../../lib/payroll/timesheet-payroll-summary";
import { halfPeriodShortRu } from "../../lib/payroll/advance-period";
import type { GuardPeriodBreakdown } from "../../lib/payroll/timesheet-guard-period-summary";
import type { GuardPayrollHalfBreakdown } from "../../lib/payroll/timesheet-guard-profile-segments";

type TimesheetViewProps = {
  rows: TimesheetRow[];
  guardOptions: Array<{ id: string; name: string }>;
  objectOptions: Array<{ id: string; name: string }>;
  currentRole: Role;
  filters: {
    guardId?: string;
    objectId?: string;
    month?: string;
    week?: string;
    q?: string;
    unpriced?: string;
  };
  payrollHalfByGuardName?: Map<string, GuardPayrollHalfSummary>;
  payrollHalfMonth?: { year: number; monthIndex0: number };
  objectPayrollHalves?: ObjectPayrollHalfSummary[];
  guardPayrollHalfBreakdownByName?: Map<string, GuardPayrollHalfBreakdown>;
  /** Уже по операционным суткам (считается на сервере). */
  guardPeriodByName?: Map<string, GuardPeriodBreakdown>;
};

export function TimesheetView({
  rows,
  guardOptions,
  objectOptions,
  currentRole,
  filters,
  payrollHalfByGuardName,
  payrollHalfMonth,
  objectPayrollHalves,
  guardPayrollHalfBreakdownByName,
  guardPeriodByName: guardPeriodByNameProp,
}: TimesheetViewProps) {
  const showInvoiceExport = hasPermission(currentRole, "invoice:export");
  const showPayrollExport = hasPermission(currentRole, "payroll:export");
  const showPayrollTuExport = hasPermission(currentRole, "payroll:export");
  const showTimesheetXlsxExport = hasPermission(currentRole, "timesheet:read");
  const showPayrollAmounts = hasPermission(currentRole, "timesheet:read");
  const showMargin = showInvoiceExport && showPayrollExport;
  const showFinance = showPayrollAmounts || showInvoiceExport || showPayrollExport;
  const showPayroll = showPayrollAmounts;
  const showPayrollHalves = showPayrollAmounts && !!payrollHalfByGuardName && !!payrollHalfMonth;

  const toPayFirstLabel = payrollHalfMonth
    ? `К выдаче ${halfPeriodShortRu("first", payrollHalfMonth.year, payrollHalfMonth.monthIndex0)}`
    : "К выдаче 1–15";
  const toPaySecondLabel = payrollHalfMonth
    ? `К выдаче ${halfPeriodShortRu("second", payrollHalfMonth.year, payrollHalfMonth.monthIndex0)}`
    : "К выдаче 16–31";

  const objectPayrollRows = objectPayrollHalves ?? [];
  const objectPayrollTotalsRaw = objectPayrollRows.reduce(
    (acc, row) => {
      acc.toPayFirstHalfRub += row.toPayFirstHalfRub;
      acc.toPaySecondHalfRub += row.toPaySecondHalfRub;
      acc.totalMonthRub += row.totalMonthRub;
      return acc;
    },
    { toPayFirstHalfRub: 0, toPaySecondHalfRub: 0, totalMonthRub: 0 },
  );
  const objectPayrollTotals = {
    toPayFirstHalfRub: Math.round(objectPayrollTotalsRaw.toPayFirstHalfRub * 100) / 100,
    toPaySecondHalfRub: Math.round(objectPayrollTotalsRaw.toPaySecondHalfRub * 100) / 100,
    totalMonthRub: Math.round(objectPayrollTotalsRaw.totalMonthRub * 100) / 100,
  };

  const objectFilterActive = Boolean(filters.objectId?.trim());
  const guardObjectSummary = buildGuardObjectSummary(rows);
  const guardObjectGroups = groupGuardObjects(guardObjectSummary);
  const guardPeriodByName = objectFilterActive ? guardPeriodByNameProp : undefined;

  const detailShiftColSpan = 12 + (showPayroll ? 1 : 0) + (showFinance ? 1 : 0);

  // Group rows by post for the details table
  const rowsByPost = new Map<string, TimesheetRow[]>();
  for (const row of rows) {
    const key = row.postId ? `${row.postId}|${row.postName}` : "none|Без поста";
    const bucket = rowsByPost.get(key) ?? [];
    bucket.push(row);
    rowsByPost.set(key, bucket);
  }
  const postGroups = Array.from(rowsByPost.entries()).map(([key, postRows]) => {
    const [postId, postName] = key.split("|");
    return { postId: postId === "none" ? null : postId, postName, rows: postRows };
  });

  postGroups.sort((a, b) => (a.postName || "").localeCompare(b.postName || "", "ru-RU"));

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-3 shadow-glow sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.24em] text-accent-primary sm:text-sm">Бухгалтерия</p>
          <h1 className="mt-2 text-2xl font-semibold sm:mt-3 sm:text-3xl">Табель смен</h1>
          <p className="mt-2 text-xs text-app-muted sm:text-sm">
            Сводка часов по типам смен (обычные, усиление, МП) и праздничным минутам; суммы — при доступе к табелю, экспорт — отдельно по правам.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-3">
          <ButtonLink href="/dashboard" variant="secondary" className="justify-center">
            Назад
          </ButtonLink>
          <ButtonLink href="/accounting/timesheet" variant="secondary" className="justify-center">
            Сбросить
          </ButtonLink>
          {showInvoiceExport ? (
            <a
              href={buildExportHref(filters, "client")}
              className={`${buttonVariants()} col-span-2 justify-center sm:col-span-1`}
            >
              Счёт клиенту (CSV)
            </a>
          ) : null}
          {showPayrollExport ? (
            <div className="col-span-2 [&_button]:w-full sm:col-span-1 sm:[&_button]:w-auto">
              <PayrollExportButton filters={filters} monthContext={payrollHalfMonth} />
            </div>
          ) : null}
          {showPayrollTuExport ? (
            <div className="col-span-2 [&_button]:w-full sm:col-span-1 sm:[&_button]:w-auto">
              <PayrollTuExportButton filters={filters} />
            </div>
          ) : null}
          {showTimesheetXlsxExport ? (
            <div className="col-span-2 [&_button]:w-full sm:col-span-1 sm:[&_button]:w-auto">
              <TimesheetXlsxExportButton filters={filters} objectOptions={objectOptions} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        <TimesheetFilters guardOptions={guardOptions} objectOptions={objectOptions} filters={filters} />
      </div>

      {showPayrollHalves ? (
        <div className="mt-4 rounded-card border border-app-border sm:mt-6">
          <div className="bg-app-elevated px-3 py-2.5 sm:px-4 sm:py-3">
            <div className="text-sm font-semibold">Сводка по объектам</div>
            <div className="mt-1 text-xs text-app-muted">
              Начисления охранникам по объектам за выбранный месяц; учитывается фильтр по объекту.
            </div>
          </div>
          <div className="hidden md:block app-h-scroll">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-app-elevated text-app-muted">
                <tr>
                  <th className="px-4 py-3">Объект</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">{toPayFirstLabel}</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">{toPaySecondLabel}</th>
                  <th className="px-4 py-3 text-center whitespace-nowrap">Общая за месяц</th>
                </tr>
              </thead>
              <tbody>
                {objectPayrollRows.map((row) => (
                  <tr key={row.objectId ?? row.objectName} className="border-t border-app-border">
                    <td className="px-4 py-3 font-medium">{row.objectName}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{formatRubWhole(row.toPayFirstHalfRub)}</td>
                    <td className="px-4 py-3 text-center tabular-nums">{formatRubWhole(row.toPaySecondHalfRub)}</td>
                    <td className="px-4 py-3 text-center tabular-nums font-medium">
                      {formatRubWhole(row.totalMonthRub)}
                    </td>
                  </tr>
                ))}
                {objectPayrollRows.length === 0 ? (
                  <tr className="border-t border-app-border">
                    <td className="px-4 py-8 text-app-muted" colSpan={4}>
                      Смены не найдены.
                    </td>
                  </tr>
                ) : null}
              </tbody>
              {objectPayrollRows.length > 0 ? (
                <tfoot>
                  <tr className="border-t-2 border-app-border bg-app-elevated">
                    <td className="px-4 py-3 font-semibold">Итого</td>
                    <td className="px-4 py-3 text-center tabular-nums font-semibold">
                      {formatRubWhole(objectPayrollTotals.toPayFirstHalfRub)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums font-semibold">
                      {formatRubWhole(objectPayrollTotals.toPaySecondHalfRub)}
                    </td>
                    <td className="px-4 py-3 text-center tabular-nums font-semibold">
                      {formatRubWhole(objectPayrollTotals.totalMonthRub)}
                    </td>
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
          <div className="space-y-2 p-3 md:hidden">
            {objectPayrollRows.map((row) => (
              <article key={row.objectId ?? row.objectName} className="rounded-card border border-app-border bg-app-bg p-3 text-xs">
                <p className="font-semibold text-app-text">{row.objectName}</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <dt className="text-[10px] uppercase text-app-muted">{toPayFirstLabel}</dt>
                    <dd className="font-medium tabular-nums">{formatRubWhole(row.toPayFirstHalfRub)} ₽</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-app-muted">{toPaySecondLabel}</dt>
                    <dd className="font-medium tabular-nums">{formatRubWhole(row.toPaySecondHalfRub)} ₽</dd>
                  </div>
                  <div className="col-span-2 border-t border-app-border pt-2">
                    <dt className="text-[10px] uppercase text-app-muted">Общая за месяц</dt>
                    <dd className="text-sm font-semibold tabular-nums">{formatRubWhole(row.totalMonthRub)} ₽</dd>
                  </div>
                </dl>
              </article>
            ))}
            {objectPayrollRows.length > 0 ? (
              <article className="rounded-card border border-app-border bg-app-elevated p-3 text-xs">
                <p className="font-semibold text-app-text">Итого</p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2">
                  <div>
                    <dt className="text-[10px] uppercase text-app-muted">{toPayFirstLabel}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatRubWhole(objectPayrollTotals.toPayFirstHalfRub)} ₽
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase text-app-muted">{toPaySecondLabel}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatRubWhole(objectPayrollTotals.toPaySecondHalfRub)} ₽
                    </dd>
                  </div>
                  <div className="col-span-2 border-t border-app-border pt-2">
                    <dt className="text-[10px] uppercase text-app-muted">Общая за месяц</dt>
                    <dd className="text-sm font-semibold tabular-nums">
                      {formatRubWhole(objectPayrollTotals.totalMonthRub)} ₽
                    </dd>
                  </div>
                </dl>
              </article>
            ) : (
              <p className="px-1 py-6 text-center text-xs text-app-muted">Смены не найдены.</p>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-card border border-app-border sm:mt-6">
        <div className="bg-app-elevated px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-sm font-semibold">Сводка по охранникам</div>
          <div className="mt-1 text-xs text-app-muted">
            Сводная строка по охраннику
            {objectFilterActive
              ? "; развернуть — смены и часы по половинам месяца и типам смен."
              : "; при нескольких объектах — развернуть детализацию."}
          </div>
        </div>
        <TimesheetGuardSummaryTable
          groups={guardObjectGroups}
          showPayrollHalves={showPayrollHalves}
          showPayroll={showPayroll}
          showFinance={showFinance}
          payrollHalfByGuardName={payrollHalfByGuardName}
          payrollHalfMonth={payrollHalfMonth}
          objectFilterActive={objectFilterActive}
          guardPeriodByName={guardPeriodByName}
          guardPayrollHalfBreakdownByName={guardPayrollHalfBreakdownByName}
        />
      </div>

      <div className="mt-4 rounded-card border border-app-border sm:mt-6">
        <div className="bg-app-elevated px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="text-sm font-semibold">Все смены в выборке</div>
          <div className="mt-1 text-xs text-app-muted">Построчно: интервал, часы, при необходимости — суммы.</div>
        </div>
        <div className="hidden md:block app-h-scroll">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-app-elevated text-app-muted">
              <tr>
                <th className="px-4 py-3">Охранник</th>
                <th className="px-4 py-3">Объект</th>
                <th className="px-4 py-3">Пост</th>
                <th className="px-4 py-3">Начало</th>
                <th className="px-4 py-3">Конец</th>
                <th className="px-4 py-3 text-right">Всего</th>
                <th className="px-4 py-3 text-right">Не отраб.</th>
                <th className="px-4 py-3 text-right">Инц.</th>
                <th className="px-4 py-3 text-right">Обыч</th>
                <th className="px-4 py-3 text-right">Усил</th>
                <th className="px-4 py-3 text-right">Ночь</th>
                <th className="px-4 py-3 text-right">Праздник</th>
                {showPayroll ? <th className="px-4 py-3 text-right">Зарплата ₽</th> : null}
                {showFinance ? <th className="px-4 py-3 text-right">Ставка</th> : null}
              </tr>
            </thead>
            <tbody>
              {postGroups.map((group) => (
                <React.Fragment key={group.postId ?? "no-post"}>
                  <tr className="bg-app-bg text-app-muted">
                    <td colSpan={detailShiftColSpan} className="px-4 py-2 font-semibold">
                      Пост: {group.postName || "Без поста"}
                    </td>
                  </tr>
                  {group.rows.map((row, idx) => (
                    <tr
                      key={`${row.startsAt}-${row.endsAt}-${idx}`}
                      className="border-t border-app-border"
                      style={
                        showFinance && row.unpriced
                          ? { boxShadow: `inset 4px 0 0 0 ${designTokens.color.accent.warning}` }
                          : undefined
                      }
                    >
                      <td
                        className={`px-4 py-3 font-medium ${row.isNoShow ? "text-app-muted line-through" : ""}`}
                      >
                        {row.guardName}
                        {row.isNoShow ? (
                          <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-accent-danger">
                            инцидент
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-app-muted">{row.objectName}</td>
                      <td className="px-4 py-3 text-app-muted">{row.postName || "—"}</td>
                      <td className="px-4 py-3 text-app-muted">{formatShiftInstant(row.startsAt)}</td>
                      <td className="px-4 py-3 text-app-muted">{formatShiftInstant(row.endsAt)}</td>
                      <td className="px-4 py-3 text-right">{formatHours(row.totalHours)}</td>
                      <td className="px-4 py-3 text-right text-app-muted">{formatHours(row.unworkedHours)}</td>
                      <td className="px-4 py-3 text-right text-app-muted">
                        <TimesheetIncidentCell
                          count={row.incidentsCount}
                          lines={row.attendanceIncident ? [row.attendanceIncident] : []}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">{formatHours(row.regularHours)}</td>
                      <td className="px-4 py-3 text-right">{formatHours(row.reinforcementHours)}</td>
                      <td className="px-4 py-3 text-right">{formatHours(row.nightHours)}</td>
                      <td className="px-4 py-3 text-right">{formatHours(row.holidayHours)}</td>
                      {showPayroll ? <td className="px-4 py-3 text-right">{formatRub(row.guardAmountCents)}</td> : null}
                      {showFinance ? (
                        <td className="px-4 py-3 text-right text-app-muted">{row.unpriced ? "нет" : "есть"}</td>
                      ) : null}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {rows.length === 0 ? (
                <tr className="border-t border-app-border">
                  <td className="px-4 py-8 text-app-muted" colSpan={detailShiftColSpan}>
                    Нет строк.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="space-y-4 p-3 md:hidden">
          {postGroups.map((group) => (
            <div key={group.postId ?? "no-post-mobile"} className="space-y-2">
              <div className="text-xs font-semibold text-app-muted uppercase tracking-wider">
                Пост: {group.postName || "Без поста"}
              </div>
              {group.rows.map((row, idx) => (
                <article
                  key={`${row.startsAt}-${row.endsAt}-${idx}-mobile`}
                  className="rounded-card border border-app-border bg-app-bg p-3 text-xs"
                  style={
                    showFinance && row.unpriced
                      ? { boxShadow: `inset 3px 0 0 0 ${designTokens.color.accent.warning}` }
                      : undefined
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className={`truncate font-semibold ${row.isNoShow ? "text-app-muted line-through" : "text-app-text"}`}>
                        {row.guardName}
                      </p>
                      <p className="mt-0.5 truncate text-app-muted">{row.objectName}</p>
                      {row.postName ? <p className="mt-0.5 truncate text-[10px] text-app-muted">{row.postName}</p> : null}
                    </div>
                    {row.isNoShow ? (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-accent-danger">
                        инцидент
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-[11px] text-app-muted">
                    {formatShiftInstant(row.startsAt)} — {formatShiftInstant(row.endsAt)}
                  </p>
                  <dl className="mt-2 grid grid-cols-3 gap-x-2 gap-y-1.5">
                    <Stat label="Всего" value={formatHours(row.totalHours)} />
                    <Stat label="Не отраб." value={formatHours(row.unworkedHours)} muted />
                    <Stat
                      label="Инц."
                      value={
                        <TimesheetIncidentCell
                          count={row.incidentsCount}
                          lines={row.attendanceIncident ? [row.attendanceIncident] : []}
                        />
                      }
                      muted
                    />
                    <Stat label="Обыч" value={formatHours(row.regularHours)} />
                    <Stat label="Усил" value={formatHours(row.reinforcementHours)} />
                    <Stat label="Ночь" value={formatHours(row.nightHours)} />
                    <Stat label="Праздник" value={formatHours(row.holidayHours)} />
                    {showPayroll ? (
                      <Stat label="Зарплата" value={`${formatRub(row.guardAmountCents)} ₽`} className="col-span-2" />
                    ) : null}
                    {showFinance ? (
                      <Stat label="Ставка" value={row.unpriced ? "нет" : "есть"} muted />
                    ) : null}
                  </dl>
                </article>
              ))}
            </div>
          ))}
          {rows.length === 0 ? (
            <p className="px-1 py-6 text-center text-xs text-app-muted">Нет строк.</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function Stat({
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

function formatShiftInstant(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDisplayDateTimeLocal(d);
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

function buildExportHref(filters: TimesheetViewProps["filters"], kind: "client" | "payroll"): string {
  const params = new URLSearchParams();
  if (filters.guardId) params.set("guardId", filters.guardId);
  if (filters.objectId) params.set("objectId", filters.objectId);
  if (filters.month) params.set("month", filters.month);
  if (filters.week) params.set("week", filters.week);
  if (filters.q) params.set("q", filters.q);
  if (filters.unpriced === "1") params.set("unpriced", "1");
  const query = params.toString();
  const base = kind === "client" ? "/api/accounting/export/client" : "/api/accounting/export/payroll";
  return query ? `${base}?${query}` : base;
}

type GuardObjectSummaryRow = {
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

function buildGuardObjectSummary(rows: TimesheetRow[]): GuardObjectSummaryRow[] {
  const map = new Map<string, GuardObjectSummaryRow>();
  for (const row of rows) {
    const objectKey = row.objectId ?? `name:${row.objectName}`;
    const key = `${row.guardName}||${objectKey}`;
    const current = map.get(key) ?? {
      guardName: row.guardName,
      objectName: row.objectName,
      shiftsCount: 0,
      totalHours: 0,
      unworkedHoursTotal: 0,
      regularHoursTotal: 0,
      reinforcementHoursTotal: 0,
      rapidResponseHoursTotal: 0,
      holidayHours: 0,
      incidentsCount: 0,
      attendanceIncidents: [],
      clientAmountCents: 0,
      guardAmountCents: 0,
      marginCents: 0,
      unpricedShifts: 0,
    };
    if (row.objectName) current.objectName = row.objectName;
    current.shiftsCount += 1;
    current.totalHours = round2(current.totalHours + row.totalHours);
    current.unworkedHoursTotal = round2(current.unworkedHoursTotal + row.unworkedHours);
    current.regularHoursTotal = round2(current.regularHoursTotal + row.regularHours);
    current.reinforcementHoursTotal = round2(current.reinforcementHoursTotal + row.reinforcementHours);
    current.rapidResponseHoursTotal = round2(current.rapidResponseHoursTotal + row.rapidResponseHours);
    current.holidayHours = round2(current.holidayHours + row.holidayHours);
    if (row.attendanceIncident) {
      current.incidentsCount += 1;
      current.attendanceIncidents.push(row.attendanceIncident);
    }
    current.clientAmountCents += row.clientAmountCents;
    current.guardAmountCents += row.guardAmountCents;
    current.marginCents += row.marginCents;
    if (row.unpriced) current.unpricedShifts += 1;
    map.set(key, current);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      attendanceIncidents: row.attendanceIncidents.sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
      ),
    }))
    .sort((a, b) => {
    const guardCmp = (a.guardName || "").localeCompare(b.guardName || "", "ru-RU");
    if (guardCmp !== 0) return guardCmp;
    return (a.objectName || "").localeCompare(b.objectName || "", "ru-RU");
  });
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function groupGuardObjects(rows: GuardObjectSummaryRow[]): Array<{ guardName: string; items: GuardObjectSummaryRow[] }> {
  const groups = new Map<string, GuardObjectSummaryRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.guardName) ?? [];
    bucket.push(row);
    groups.set(row.guardName, bucket);
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => (a || "").localeCompare(b || "", "ru-RU"))
    .map(([guardName, items]) => ({ guardName, items }));
}
