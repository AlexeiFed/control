/**
 * Назначение файла: API-выгрузка табеля Т-13 по кураторам в CSV (Excel-friendly).
 * Доступ: только роли с правом curators:manage.
 */

import { z } from "zod";
import { assertPermission } from "../../../../../../lib/auth/rbac";
import { requireSession } from "../../../../../../lib/auth/session";
import { buildCuratorT13Csv } from "../../../../../../lib/curators/t13-export";
import { listCuratorDailyTotalsInRange } from "../../../../../../lib/operations/curators-repository";
import { toDateTimeKhabarovsk } from "../../../../../../lib/format/display-date";

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period: z.enum(["month", "fortnight"]).optional(),
});

export async function GET(request: Request) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const url = new URL(request.url);
  const parsed = querySchema.parse({
    start: url.searchParams.get("start"),
    end: url.searchParams.get("end"),
    period: url.searchParams.get("period") ?? undefined,
  });

  const startDate = toDateTimeKhabarovsk(parsed.start, "00:00");
  const endDate = toDateTimeKhabarovsk(parsed.end, "23:59");
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate > endDate) {
    return new Response("Invalid date range", { status: 400 });
  }

  // Ограничиваем диапазон двумя месяцами, чтобы не перегружать выгрузку.
  const rangeDays = Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  if (rangeDays > 62) {
    return new Response("Date range is too large", { status: 400 });
  }

  const dailyRows = await listCuratorDailyTotalsInRange(parsed.start, parsed.end);
  const entries = dailyRows.map((row) => ({
    curatorId: row.curatorId,
    curatorName: `${row.curatorLastName} ${row.curatorFirstName}`.trim(),
    workDate: row.workDate,
    totalHours: row.totalHours,
    totalRub: row.totalRub,
  }));

  const periodLabel =
    parsed.period === "fortnight"
      ? `2 недели (${parsed.start}..${parsed.end})`
      : `Месяц (${parsed.start}..${parsed.end})`;

  const csv = buildCuratorT13Csv({
    startInclusive: parsed.start,
    endInclusive: parsed.end,
    periodLabel,
    entries,
  });

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="t13-curators-${parsed.start}_${parsed.end}.csv"`,
    },
  });
}
