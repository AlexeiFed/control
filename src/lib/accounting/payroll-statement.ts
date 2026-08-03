import type { PayrollHalf } from "../payroll/advance-period";
import { dateIsoBelongsToHalf } from "../payroll/advance-period";
import { getDaysInMonth } from "../format/display-date";
import type { GuardAdvanceTotals } from "../operations/advances-repository";
import type { TimesheetRow } from "../scheduling/timesheet";
import { DEFAULT_SHIFT_TIMEZONE, localDateKeyInTimeZone } from "../scheduling/local-date-key";

export type PayrollStatementRow = {
  guardName: string;
  totalSalaryRub: number;
  advanceRub: number;
  fineCount: number;
  toPayRub: number | null;
};

export type PayrollStatementSheet = {
  objectId: string;
  objectName: string;
  objectAddress: string;
  rows: PayrollStatementRow[];
};

/** Название месяца в верхнем регистре по выбранному месяцу табеля. */
export function payrollMonthNameUpperRu(year: number, monthIndex0: number): string {
  if (!Number.isFinite(year) || monthIndex0 < 0 || monthIndex0 > 11) return "";
  return new Date(Date.UTC(year, monthIndex0, 15))
    .toLocaleDateString("ru-RU", { month: "long", timeZone: "UTC" })
    .toLocaleUpperCase("ru-RU");
}

export function formatPayrollStatementPeriodLabel(
  year: number,
  monthIndex0: number,
  half: PayrollHalf,
): string {
  const month = payrollMonthNameUpperRu(year, monthIndex0);
  if (half === "first") return `за ${month} 1-15, ${year}г.`;
  const lastDay = getDaysInMonth(year, monthIndex0);
  return `за ${month} ${16}-${lastDay}, ${year}г.`;
}

export function formatPayrollStatementFooter(year: number, monthIndex0: number): string {
  const month = payrollMonthNameUpperRu(year, monthIndex0);
  return `${month} ${year} года`;
}

export function buildPayrollStatementSubtitle(
  objectName: string,
  objectAddress: string,
  year: number,
  monthIndex0: number,
  half: PayrollHalf,
): string {
  const period = formatPayrollStatementPeriodLabel(year, monthIndex0, half);
  return (
    `получения заработной платы сотрудниками службы контроля объекта ${objectName}, ` +
    `расположенного по адресу: ${objectAddress} ${period}`
  );
}

type ObjectInfo = { id: string; name: string; address: string };

export function buildPayrollStatementSheets(input: {
  rows: TimesheetRow[];
  objects: ObjectInfo[];
  half: PayrollHalf;
  year: number;
  monthIndex0: number;
  guardIdByName: Map<string, string>;
  advancesByGuardId: Map<string, GuardAdvanceTotals>;
  objectIdFilter?: string;
  resolveOperationalDateIso?: (row: TimesheetRow) => string;
}): PayrollStatementSheet[] {
  const objects =
    input.objectIdFilter != null && input.objectIdFilter !== ""
      ? input.objects.filter((o) => o.id === input.objectIdFilter)
      : input.objects;

  const sheets: PayrollStatementSheet[] = [];
  const month = { year: input.year, monthIndex0: input.monthIndex0 };

  for (const object of objects) {
    const byGuard = new Map<
      string,
      { guardName: string; salaryCents: number; incidents: number }
    >();

    for (const row of input.rows) {
      const sameObject =
        row.objectId != null ? row.objectId === object.id : row.objectName === object.name;
      if (!sameObject) continue;
      const dateIso =
        input.resolveOperationalDateIso?.(row) ??
        localDateKeyInTimeZone(new Date(row.startsAt), DEFAULT_SHIFT_TIMEZONE);
      if (!dateIsoBelongsToHalf(dateIso, input.half, month)) {
        continue;
      }

      const current = byGuard.get(row.guardName) ?? {
        guardName: row.guardName,
        salaryCents: 0,
        incidents: 0,
      };
      current.salaryCents += row.guardAmountCents;
      current.incidents += row.incidentsCount;
      byGuard.set(row.guardName, current);
    }

    if (byGuard.size === 0) continue;

    const statementRows: PayrollStatementRow[] = Array.from(byGuard.values())
      .sort((a, b) => a.guardName.localeCompare(b.guardName, "ru-RU"))
      .map((entry) => {
        const guardId = input.guardIdByName.get(entry.guardName);
        const advances = guardId ? input.advancesByGuardId.get(guardId) : undefined;
        const advanceRub =
          input.half === "first" ? (advances?.firstHalfRub ?? 0) : (advances?.secondHalfRub ?? 0);
        const totalSalaryRub = Math.round((entry.salaryCents / 100) * 100) / 100;
        const toPayRub =
          entry.incidents > 0
            ? null
            : Math.max(0, Math.round((totalSalaryRub - advanceRub) * 100) / 100);

        return {
          guardName: entry.guardName,
          totalSalaryRub,
          advanceRub: advanceRub > 0 ? advanceRub : 0,
          fineCount: entry.incidents,
          toPayRub,
        };
      });

    sheets.push({
      objectId: object.id,
      objectName: object.name,
      objectAddress: object.address,
      rows: statementRows,
    });
  }

  return sheets.sort((a, b) => a.objectName.localeCompare(b.objectName, "ru-RU"));
}
