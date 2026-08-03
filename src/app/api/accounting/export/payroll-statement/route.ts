import { assertPermission } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import {
  getTimesheetRowsForExport,
  parseTimesheetExportUrl,
} from "../../../../../lib/accounting/timesheet-export-server";
import { buildPayrollStatementSheets } from "../../../../../lib/accounting/payroll-statement";
import { buildPayrollStatementWorkbook } from "../../../../../lib/accounting/payroll-statement-xlsx";
import { padTimesheetQueryRange } from "../../../../../lib/accounting/timesheet-operational-day";
import { sumAdvancesByGuardForMonth } from "../../../../../lib/operations/advances-repository";
import { getTimesheetSnapshot } from "../../../../../lib/operations/scheduler-repository";
import type { PayrollHalf } from "../../../../../lib/payroll/advance-period";
import { PAYROLL_HALVES } from "../../../../../lib/payroll/advance-period";

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "payroll:export");
  assertPermission(session.user.role, "holidays:read");

  const url = new URL(request.url);
  const periodHalfRaw = url.searchParams.get("periodHalf")?.trim() ?? "";
  if (!(PAYROLL_HALVES as readonly string[]).includes(periodHalfRaw)) {
    return new Response("Укажите periodHalf=first или periodHalf=second", { status: 400 });
  }
  const periodHalf = periodHalfRaw as PayrollHalf;

  const parsed = parseTimesheetExportUrl(url);
  if (!parsed.month) {
    return new Response("Выберите месяц в фильтре табеля", { status: 400 });
  }

  const snapshotRange = padTimesheetQueryRange(parsed.rangeStart, parsed.rangeEnd);
  const [{ rows, resolveOperationalDateIso }, snapshot, advancesByGuardId] = await Promise.all([
    getTimesheetRowsForExport(parsed),
    getTimesheetSnapshot(snapshotRange.start, snapshotRange.end, {
      guardId: parsed.guardId || undefined,
      objectId: parsed.objectId || undefined,
    }),
    sumAdvancesByGuardForMonth(parsed.month.year, parsed.month.monthIndex),
  ]);

  if (!resolveOperationalDateIso) {
    return new Response("Не удалось разрешить операционные сутки", { status: 500 });
  }

  const guardIdByName = new Map(snapshot.guards.map((g) => [g.name, g.id] as const));
  const sheets = buildPayrollStatementSheets({
    rows,
    objects: snapshot.objects.map((o) => ({ id: o.id, name: o.name, address: o.address })),
    half: periodHalf,
    year: parsed.month.year,
    monthIndex0: parsed.month.monthIndex,
    guardIdByName,
    advancesByGuardId,
    objectIdFilter: parsed.objectId || undefined,
    resolveOperationalDateIso,
  });

  if (sheets.length === 0) {
    return new Response("Нет смен за выбранный период", { status: 404 });
  }

  const buffer = await buildPayrollStatementWorkbook(
    sheets,
    parsed.month.year,
    parsed.month.monthIndex,
    periodHalf,
  );

  const monthKey = `${parsed.month.year}-${String(parsed.month.monthIndex + 1).padStart(2, "0")}`;
  const halfSuffix = periodHalf === "first" ? "1-15" : "16-31";
  const objectSuffix = parsed.objectId ? "" : "_all";
  const filename = `vedomost_${monthKey}_${halfSuffix}${objectSuffix}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
