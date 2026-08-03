import { assertPermission } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import { getTimesheetRowsForExport, parseTimesheetExportUrl } from "../../../../../lib/accounting/timesheet-export-server";
import { exportClientInvoiceCsv } from "../../../../../lib/scheduling/timesheet";

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "invoice:export");
  assertPermission(session.user.role, "holidays:read");

  const url = new URL(request.url);
  const { rows, resolveOperationalDateIso } = await getTimesheetRowsForExport(parseTimesheetExportUrl(url));
  const csv = exportClientInvoiceCsv(rows, resolveOperationalDateIso);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="invoice-client.csv"',
    },
  });
}
