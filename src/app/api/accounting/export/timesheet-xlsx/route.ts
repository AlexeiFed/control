import { assertPermission } from "../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../lib/auth/session";
import { getTimesheetRowsForExport, parseTimesheetExportUrl } from "../../../../../lib/accounting/timesheet-export-server";
import {
  buildTimesheetGuardPositionLabel,
  buildTimesheetObjectWorkbook,
  type TimesheetObjectWorkbookSheet,
} from "../../../../../lib/accounting/timesheet-object-xlsx";
import {
  loadTimesheetOperationalDayContext,
  monthKeysForPayrollMonth,
  padTimesheetQueryRange,
} from "../../../../../lib/accounting/timesheet-operational-day";
import { listGuardPersonalCardAssignedOnByIds } from "../../../../../lib/operations/guards-repository";
import { listObjectTimesheetApprovalsByIds } from "../../../../../lib/operations/objects-repository";
import { getTimesheetSnapshot } from "../../../../../lib/operations/scheduler-repository";
import { operationalDayMonthKey } from "../../../../../lib/scheduling/operational-day-anchors";
import { normalizeOperationalAnchorTime } from "../../../../../lib/scheduling/operational-day-timeline";

function parseObjectIdsParam(url: URL): Set<string> | null {
  const raw = url.searchParams.get("objectIds")?.trim() ?? "";
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return ids.length > 0 ? new Set(ids) : null;
}

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "timesheet:read");
  assertPermission(session.user.role, "holidays:read");

  const url = new URL(request.url);
  const parsed = parseTimesheetExportUrl(url);
  if (!parsed.month) {
    return new Response("Выберите месяц в фильтре табеля", { status: 400 });
  }
  if (parsed.week) {
    return new Response("Для Excel-табеля выберите месяц (без недели)", { status: 400 });
  }

  const selectedObjectIds = parseObjectIdsParam(url);

  const snapshotRange = padTimesheetQueryRange(parsed.rangeStart, parsed.rangeEnd);
  const [{ rows }, snapshot] = await Promise.all([
    getTimesheetRowsForExport(parsed),
    getTimesheetSnapshot(snapshotRange.start, snapshotRange.end, {
      guardId: parsed.guardId || undefined,
    }),
  ]);

  const personalCards = await listGuardPersonalCardAssignedOnByIds(snapshot.guards.map((g) => g.id));

  const profileDateIso = `${parsed.month.year}-${String(parsed.month.monthIndex + 1).padStart(2, "0")}-15`;
  const guardPositionByName = new Map(
    snapshot.guards.map((guard) => {
      const resolved = snapshot.profileResolver.resolveGuardAt(guard, profileDateIso);
      return [
        guard.name,
        buildTimesheetGuardPositionLabel({
          position: resolved.position,
          employmentType: resolved.employmentType,
          personalCardAssignedOn: personalCards.get(guard.id),
        }),
      ] as const;
    }),
  );

  const objects = selectedObjectIds
    ? snapshot.objects.filter((o) => selectedObjectIds.has(o.id))
    : snapshot.objects;

  const objectIdSet = new Set(objects.map((o) => o.id));
  const objectNameSet = new Set(objects.map((o) => o.name));
  const rowsFiltered = rows.filter((r) =>
    r.objectId ? objectIdSet.has(r.objectId) : objectNameSet.has(r.objectName),
  );
  const approvalsByObjectId = await listObjectTimesheetApprovalsByIds(objects.map((o) => o.id));

  const monthKey = `${parsed.month.year}-${String(parsed.month.monthIndex + 1).padStart(2, "0")}`;
  const { objectDefaultById, monthlyByKey } = await loadTimesheetOperationalDayContext(
    objects,
    monthKeysForPayrollMonth(parsed.month.year, parsed.month.monthIndex),
  );

  const sheets: TimesheetObjectWorkbookSheet[] = objects
    .map((o) => {
      const approvalRow = approvalsByObjectId.get(o.id);
      const monthlyAnchor = monthlyByKey.get(operationalDayMonthKey(o.id, monthKey));
      return {
        objectName: o.name,
        objectAddress: o.address ?? "",
        operationalDayStartTime:
          monthlyAnchor ??
          objectDefaultById.get(o.id) ??
          normalizeOperationalAnchorTime(o.operationalDayStartTime),
        rows: rowsFiltered.filter((r) =>
          r.objectId ? r.objectId === o.id : r.objectName === o.name,
        ),
        approval: {
          directorName: approvalRow?.timesheetDirectorName ?? "",
          directorRole: approvalRow?.timesheetDirectorRole ?? "",
          siteManagerEnabled: approvalRow?.timesheetSiteManagerEnabled ?? false,
        },
      };
    })
    .filter((s) => s.rows.length > 0);

  if (sheets.length === 0) {
    return new Response("Нет смен за выбранный период", { status: 404 });
  }

  const buffer = await buildTimesheetObjectWorkbook(
    sheets,
    parsed.month.year,
    parsed.month.monthIndex,
    guardPositionByName,
  );
  const filename = `tabel_${monthKey}${selectedObjectIds ? "" : "_all"}.xlsx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}
