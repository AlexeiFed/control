/**
 * Страница редактирования и управления конкретным объектом.
 * Позволяет изменять адрес, описание, управлять охранниками, праздниками и графиком.
 */

import { notFound } from "next/navigation";
import { z } from "zod";
import { assertPermission, hasPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { getObject } from "../../../lib/operations/objects-repository";
import { listGuardDisplayNamesByIds } from "../../../lib/operations/guards-repository";
import { listObjectRateRulesForObjects } from "../../../lib/operations/object-rate-rules-repository";
import { listShiftTemplatesForObjectIds } from "../../../lib/operations/shift-templates-repository";
import { buildExpectedShiftsForLocalMonth } from "../../../lib/scheduling/object-shift-templates";
import { getObjectOperationalDayStartTimeForMonth } from "../../../lib/operations/objects-repository";
import { listObjectHolidays } from "../../../lib/operations/object-holidays-repository";
import { getObjectPosts, ensureMonthlyPostsInherited } from "../../../lib/operations/object-posts-repository";
import { listMonthlyPostGuardsByObject } from "../../../lib/operations/object-monthly-post-guards-repository";
import {
  listScheduledGuardsByObjectForLocalMonth,
  listShiftsForObjectInLocalMonth,
  listShiftsInLocalRange,
} from "../../../lib/operations/scheduler-repository";
import { listObjects } from "../../../lib/operations/objects-repository";
import { bulkCreateShiftsAction } from "../../scheduler/actions";
import { ObjectDetailViewLazy } from "../../../components/operations/object-detail-view-lazy";
import { getKhabarovskComponents } from "../../../lib/format/display-date";
import { loadHolidayDateSetForLocalRange } from "../../../lib/rates/holiday-calendar";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ month?: string; error?: string; success?: string; scrollY?: string }>;
};

export default async function ObjectDetailPage({ params, searchParams }: PageProps) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const object = await getObject(id);
  if (!object) {
    notFound();
  }

  const canReadRates = hasPermission(session.user.role, "rates:read");
  const canAssignShifts = hasPermission(session.user.role, "schedule:write");
  const searchParamsResolved = await searchParams;
  const monthParam = searchParamsResolved.month;
  const error = searchParamsResolved.error;
  const success = searchParamsResolved.success;
  const scrollYRaw = searchParamsResolved.scrollY;
  const initialScrollY =
    scrollYRaw && /^\d+$/.test(scrollYRaw) ? Number(scrollYRaw) : undefined;

  const kh = getKhabarovskComponents(new Date());
  const year = monthParam ? parseInt(monthParam.split("-")[0]) : kh.year;
  const month0 = monthParam ? parseInt(monthParam.split("-")[1]) - 1 : kh.month0;
  const monthStart = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0) - 10 * 3600_000);
  const monthEndExclusive = new Date(Date.UTC(year, month0 + 1, 1, 0, 0, 0, 0) - 10 * 3600_000);

  const monthKey = `${year}-${String(month0 + 1).padStart(2, "0")}`;

  await ensureMonthlyPostsInherited(id, monthKey);

  const [templates, rateRules, objectHolidays, scheduledGuardsMap, shifts, monthAvailabilityShifts, globalHolidayDateKeys, posts, operationalDayStartTime, monthlyPostGuardsByPostId] =
    await Promise.all([
      listShiftTemplatesForObjectIds([id]),
      canReadRates || canAssignShifts ? listObjectRateRulesForObjects([id]) : Promise.resolve([]),
      listObjectHolidays(id),
      listScheduledGuardsByObjectForLocalMonth([id], year, month0),
      listShiftsForObjectInLocalMonth(id, year, month0),
      listShiftsInLocalRange(monthStart, monthEndExclusive),
      loadHolidayDateSetForLocalRange(monthStart, monthEndExclusive),
      getObjectPosts(id, monthKey),
      getObjectOperationalDayStartTimeForMonth(id, monthKey),
      listMonthlyPostGuardsByObject(id, monthKey),
    ]);

  const gridGuardIds = [...new Set([...object.guardIds, ...shifts.map((s) => s.guardId)])];
  const gridGuardNames = await listGuardDisplayNamesByIds(gridGuardIds);

  const expectedShiftsByDateIso = buildExpectedShiftsForLocalMonth(id, year, month0, templates);
  const scheduledGuards = scheduledGuardsMap[id] ?? [];

  return (
    <main className="min-h-screen bg-app-bg p-3 text-app-text sm:p-6">
      <ObjectDetailViewLazy
        object={object}
        posts={posts}
        gridGuardNames={gridGuardNames}
        rateRules={rateRules}
        expectedShiftsByDateIso={expectedShiftsByDateIso}
        shiftTemplates={templates}
        currentRole={session.user.role}
        objectHolidays={objectHolidays}
        globalHolidayDateKeys={[...globalHolidayDateKeys]}
        scheduledGuards={scheduledGuards}
        shifts={shifts}
        monthAvailabilityShifts={monthAvailabilityShifts}
        viewYear={year}
        viewMonth0={month0}
        error={error}
        success={success}
        initialScrollY={initialScrollY}
        bulkCreateShiftsAction={bulkCreateShiftsAction}
        operationalDayStartTime={operationalDayStartTime}
        monthlyPostGuardsByPostId={monthlyPostGuardsByPostId}
      />
    </main>
  );
}
