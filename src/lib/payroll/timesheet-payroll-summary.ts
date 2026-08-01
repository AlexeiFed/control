import { shiftBelongsToHalf, type PayrollMonthContext } from "../payroll/advance-period";
import type { GuardAdvanceTotals } from "../operations/advances-repository";
import type { TimesheetRow } from "../scheduling/timesheet";

export type GuardPayrollHalfSummary = {
  guardId: string;
  guardName: string;
  earnedFirstHalfCents: number;
  earnedSecondHalfCents: number;
  advanceFirstHalfRub: number;
  advanceSecondHalfRub: number;
  toPayFirstHalfRub: number;
  toPaySecondHalfRub: number;
  salaryCents: number;
};

export function buildGuardPayrollHalfSummaries(input: {
  rows: TimesheetRow[];
  guardIdByName: Map<string, string>;
  advancesByGuardId: Map<string, GuardAdvanceTotals>;
  month: PayrollMonthContext;
}): Map<string, GuardPayrollHalfSummary> {
  const earned = new Map<string, { first: number; second: number; name: string }>();

  for (const row of input.rows) {
    const guardId = input.guardIdByName.get(row.guardName);
    if (!guardId) continue;
    const current = earned.get(guardId) ?? { first: 0, second: 0, name: row.guardName };
    if (shiftBelongsToHalf(row.startsAt, "first", input.month)) {
      current.first += row.guardAmountCents;
    } else if (shiftBelongsToHalf(row.startsAt, "second", input.month)) {
      current.second += row.guardAmountCents;
    }
    earned.set(guardId, current);
  }

  const result = new Map<string, GuardPayrollHalfSummary>();
  for (const [guardId, totals] of earned) {
    const advances = input.advancesByGuardId.get(guardId) ?? { firstHalfRub: 0, secondHalfRub: 0 };
    const earnedFirstRub = totals.first / 100;
    const earnedSecondRub = totals.second / 100;
    const toPayFirstHalfRub = Math.max(0, Math.round((earnedFirstRub - advances.firstHalfRub) * 100) / 100);
    const toPaySecondHalfRub = Math.max(0, Math.round((earnedSecondRub - advances.secondHalfRub) * 100) / 100);

    result.set(guardId, {
      guardId,
      guardName: totals.name,
      earnedFirstHalfCents: totals.first,
      earnedSecondHalfCents: totals.second,
      advanceFirstHalfRub: advances.firstHalfRub,
      advanceSecondHalfRub: advances.secondHalfRub,
      toPayFirstHalfRub,
      toPaySecondHalfRub,
      salaryCents: totals.first + totals.second,
    });
  }

  return result;
}

export function payrollHalfSummaryByGuardName(
  summaries: Map<string, GuardPayrollHalfSummary>,
): Map<string, GuardPayrollHalfSummary> {
  const byName = new Map<string, GuardPayrollHalfSummary>();
  for (const summary of summaries.values()) {
    byName.set(summary.guardName, summary);
  }
  return byName;
}

export type ObjectPayrollHalfSummary = {
  objectId?: string;
  objectName: string;
  toPayFirstHalfRub: number;
  toPaySecondHalfRub: number;
  totalMonthRub: number;
};

/** Сумма начислений охранникам по объекту за полупериоды (без вычета авансов — они на уровне охранника). */
export function buildObjectPayrollHalfSummaries(
  rows: TimesheetRow[],
  month: PayrollMonthContext,
): ObjectPayrollHalfSummary[] {
  const earned = new Map<string, { objectId?: string; objectName: string; first: number; second: number }>();

  for (const row of rows) {
    const key = row.objectId ?? `name:${row.objectName}`;
    const current = earned.get(key) ?? {
      objectId: row.objectId,
      objectName: row.objectName,
      first: 0,
      second: 0,
    };
    // Актуальное имя побеждает (после rename снапшоты могут отличаться).
    if (row.objectName) current.objectName = row.objectName;
    if (shiftBelongsToHalf(row.startsAt, "first", month)) {
      current.first += row.guardAmountCents;
    } else if (shiftBelongsToHalf(row.startsAt, "second", month)) {
      current.second += row.guardAmountCents;
    }
    earned.set(key, current);
  }

  return Array.from(earned.values())
    .map((totals) => ({
      objectId: totals.objectId,
      objectName: totals.objectName,
      toPayFirstHalfRub: Math.round((totals.first / 100) * 100) / 100,
      toPaySecondHalfRub: Math.round((totals.second / 100) * 100) / 100,
      totalMonthRub: Math.round(((totals.first + totals.second) / 100) * 100) / 100,
    }))
    .sort((a, b) => (a.objectName || "").localeCompare(b.objectName || "", "ru-RU"));
}
