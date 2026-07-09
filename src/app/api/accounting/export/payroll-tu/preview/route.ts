import { assertPermission } from "../../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../../lib/auth/session";
import { buildPayrollTuExportData } from "../../../../../../lib/accounting/payroll-tu-server";
import { parseTimesheetExportUrl } from "../../../../../../lib/accounting/timesheet-export-server";
import { halfPeriodShortRu } from "../../../../../../lib/payroll/advance-period";

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "payroll:export");
  assertPermission(session.user.role, "timesheet:read");
  assertPermission(session.user.role, "holidays:read");

  const url = new URL(request.url);
  const parsed = parseTimesheetExportUrl(url);
  if (!parsed.month) {
    return Response.json({ error: "Выберите месяц в фильтре табеля" }, { status: 400 });
  }
  if (parsed.week) {
    return Response.json({ error: "Для выгрузки «Зарплата ТУ» выберите месяц (без недели)" }, { status: 400 });
  }

  const { preview } = await buildPayrollTuExportData({
    year: parsed.month.year,
    monthIndex0: parsed.month.monthIndex,
    rangeStart: parsed.rangeStart,
    rangeEnd: parsed.rangeEnd,
  });

  return Response.json({
    ...preview,
    firstHalfLabel: halfPeriodShortRu("first", parsed.month.year, parsed.month.monthIndex),
    secondHalfLabel: halfPeriodShortRu("second", parsed.month.year, parsed.month.monthIndex),
  });
}
