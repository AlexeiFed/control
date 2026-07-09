import { assertPermission } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import { buildPayrollTuExportData } from "../../../../../lib/accounting/payroll-tu-server";
import { buildPayrollTuWorkbook } from "../../../../../lib/accounting/payroll-tu-xlsx";
import { PAYROLL_TU_PERIODS, type PayrollTuPeriod } from "../../../../../lib/accounting/payroll-tu";
import { parseTimesheetExportUrl } from "../../../../../lib/accounting/timesheet-export-server";
import { payrollTuPeriodFilenameSuffix } from "../../../../../lib/payroll/advance-period";

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "payroll:export");
  assertPermission(session.user.role, "timesheet:read");
  assertPermission(session.user.role, "holidays:read");

  const url = new URL(request.url);
  const periodRaw = url.searchParams.get("period")?.trim() ?? "month";
  if (!(PAYROLL_TU_PERIODS as readonly string[]).includes(periodRaw)) {
    return new Response("Укажите period=first, period=second или period=month", { status: 400 });
  }
  const period = periodRaw as PayrollTuPeriod;

  const parsed = parseTimesheetExportUrl(url);
  if (!parsed.month) {
    return new Response("Выберите месяц в фильтре табеля", { status: 400 });
  }
  if (parsed.week) {
    return new Response("Для выгрузки «Зарплата ТУ» выберите месяц (без недели)", { status: 400 });
  }

  const { data } = await buildPayrollTuExportData({
    year: parsed.month.year,
    monthIndex0: parsed.month.monthIndex,
    rangeStart: parsed.rangeStart,
    rangeEnd: parsed.rangeEnd,
  });

  if (data.officeRows.length === 0 && data.guardRows.length === 0) {
    return new Response("Нет трудоустроенных сотрудников за выбранный месяц", { status: 404 });
  }

  const buffer = await buildPayrollTuWorkbook(data, period);
  const monthKey = `${parsed.month.year}-${String(parsed.month.monthIndex + 1).padStart(2, "0")}`;
  const periodSuffix = payrollTuPeriodFilenameSuffix(period, parsed.month.year, parsed.month.monthIndex);
  const filename = `zarplata_tu_${monthKey}${periodSuffix}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
