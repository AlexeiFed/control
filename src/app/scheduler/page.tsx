import { SchedulerGridLazy } from "../../components/operations/scheduler-grid-lazy";
import { ShiftLogPanelLazy } from "../../components/operations/shift-log-panel-lazy";
import { assertPermission, hasPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { loadHolidayDateSetForLocalRange } from "../../lib/rates/holiday-calendar";
import { listObjectRateRulesForObjects } from "../../lib/operations/object-rate-rules-repository";
import { listGuardObjectIdsByGuardId } from "../../lib/operations/guards-repository";
import { listProfilePeriodsForGuards } from "../../lib/operations/guard-profile-periods-repository";
import {
  getSchedulerSnapshot,
  listScheduledGuardsByObjectForLocalMonth,
} from "../../lib/operations/scheduler-repository";
import { listShiftTemplatesForObjectIds } from "../../lib/operations/shift-templates-repository";
import { buildCurrentWeekValidShortageDismissKeySet } from "../../lib/operations/schedule-shortage-dismissals-repository";
import { listManagedUsers } from "../../lib/auth/user-service";
import { formatMonthYearLongRu, toDateIso, getKhabarovskComponents, toDateIsoKhabarovsk } from "../../lib/format/display-date";
import { buildExpectedShiftsByObjectAndDay, civilDateKeyFromDate } from "../../lib/scheduling/object-shift-templates";
import { bulkCreateShiftsAction, cloneObjectWeekShiftsAction, createShiftAction, createShiftLogAction } from "./actions";

type SchedulerPageProps = {
  searchParams?: Promise<{ week?: string; error?: string; success?: string; scrollY?: string }>;
};

export default async function SchedulerPage({ searchParams }: SchedulerPageProps) {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:read");
  assertPermission(session.user.role, "holidays:read");
  const canReadRates = hasPermission(session.user.role, "rates:read");
  const canAssignShifts = hasPermission(session.user.role, "schedule:write");
  const params = (await searchParams) ?? {};
  
  // Рассчитываем начало недели в Хабаровском часовом поясе (UTC+10)
  const weekStart = parseWeekStartKhabarovsk(params.week);
  
  const visibleDayCount = 14;
  const weekEndExclusive = new Date(weekStart.getTime() + visibleDayCount * 24 * 60 * 60 * 1000);
  const weekDayIsos = Array.from({ length: visibleDayCount }, (_, index) =>
    civilDateKeyFromDate(new Date(weekStart.getTime() + index * 24 * 60 * 60 * 1000)),
  );
  const [snapshot, holidayDateKeys] = await Promise.all([
    getSchedulerSnapshot(weekStart),
    loadHolidayDateSetForLocalRange(weekStart, weekEndExclusive),
  ]);
  const objectIds = snapshot.objects.map((o) => o.id);
  const rateRules =
    (canReadRates || canAssignShifts) && objectIds.length > 0 ? await listObjectRateRulesForObjects(objectIds) : [];
  const rateRulesByObjectId: Record<string, (typeof rateRules)[number][]> = {};
  for (const rule of rateRules) {
    if (!rateRulesByObjectId[rule.objectId]) rateRulesByObjectId[rule.objectId] = [];
    rateRulesByObjectId[rule.objectId]!.push(rule);
  }
  const [templates, guardsScheduledByObjectMonth, guardObjectIdsByGuardId, profilePeriods, shortageDismissState] =
    await Promise.all([
      objectIds.length > 0 ? listShiftTemplatesForObjectIds(objectIds) : Promise.resolve([]),
      listScheduledGuardsByObjectForLocalMonth(
        objectIds, 
        getKhabarovskComponents(weekStart).year, 
        getKhabarovskComponents(weekStart).month0
      ),
      listGuardObjectIdsByGuardId(),
      snapshot.guards.length > 0
        ? listProfilePeriodsForGuards(snapshot.guards.map((g) => g.id))
        : Promise.resolve([]),
      objectIds.length > 0
        ? buildCurrentWeekValidShortageDismissKeySet(objectIds)
        : Promise.resolve({ weekDayIsos: [] as string[], validKeys: new Set<string>() }),
    ]);
  const expectedShiftsByObjectDay = buildExpectedShiftsByObjectAndDay(objectIds, weekDayIsos, templates);
  const dismissedShortageKeys = Array.from(shortageDismissState.validKeys);
  const users = await listManagedUsers();
  const userMap = new Map(users.map((u) => [u.id, u.name]));
  const enrichedLogs = snapshot.logs.map(log => ({
    ...log,
    authorName: userMap.get(log.authorUserId) || "Неизвестный",
  }));
  const kh = getKhabarovskComponents(weekStart);
  const objectMonthTitle = formatMonthYearLongRu(kh.year, kh.month0);
  return (
    <main
      className="grid min-h-screen gap-4 bg-app-bg p-3 text-app-text [--scheduler-page-padding:0.75rem] md:gap-6 md:p-6 md:[--scheduler-page-padding:1.5rem]"
      style={{
        paddingTop:
          "calc(var(--scheduler-page-padding) + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
      }}
    >
      <SchedulerGridLazy
        guards={snapshot.guards}
        objects={snapshot.objects}
        shifts={snapshot.shifts}
        holidayDateKeys={holidayDateKeys}
        rateRulesByObjectId={rateRulesByObjectId}
        profilePeriods={profilePeriods}
        expectedShiftsByObjectDay={expectedShiftsByObjectDay}
        guardsScheduledOnObjectByMonth={guardsScheduledByObjectMonth}
        guardObjectIdsByGuardId={guardObjectIdsByGuardId}
        objectMonthTitle={objectMonthTitle}
        currentRole={session.user.role}
        weekStart={weekStart}
        createShiftAction={createShiftAction}
        createShiftLogAction={createShiftLogAction}
        cloneObjectWeekShiftsAction={cloneObjectWeekShiftsAction}
        bulkCreateShiftsAction={bulkCreateShiftsAction}
        dismissedShortageKeys={dismissedShortageKeys}
        errorMessage={params.error}
        successMessage={(() => {
          const s = params.success;
          if (!s) return undefined;
          if (s === "shift-created") return "Смена успешно назначена";
          if (s === "incident-recorded") return "Инцидент зафиксирован";
          if (s === "shift-deleted") return "Смена удалена";
          const parseStats = (prefix: string, label: string): string | undefined => {
            if (!s.startsWith(prefix)) return undefined;
            const rest = s.slice(prefix.length);
            const [createdRaw, totalRaw] = rest.split("/");
            const created = Number(createdRaw);
            const total = totalRaw ? Number(totalRaw) : created;
            if (!Number.isFinite(created) || !Number.isFinite(total)) return undefined;
            return total > created
              ? `${label}: ${created}/${total} (${total - created} пропущено — конфликты или дубли)`
              : `${label}: ${created}`;
          };
          return (
            parseStats("clone-week:", "Скопировано смен") ??
            parseStats("bulk-create:", "Создано смен")
          );
        })()}
        initialScrollY={params.scrollY && /^\d+$/.test(params.scrollY) ? Number(params.scrollY) : undefined}
      />
      <ShiftLogPanelLazy
        logs={enrichedLogs}
        currentRole={session.user.role}
      />
    </main>
  );
}

/**
 * Парсит начало недели или возвращает текущий понедельник в Хабаровске (UTC+10).
 * Важно для гидратации: сервер и клиент должны сойтись в том, какой сегодня день в Хабаровске.
 */
function parseWeekStartKhabarovsk(value?: string): Date {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    if (y && m && d) {
      // Интерпретируем как 00:00:00 в Хабаровске
      const date = new Date(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+10:00`);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  // Текущее время в Хабаровске через хелпер
  const kh = getKhabarovskComponents(new Date());
  
  // Рассчитываем смещение до понедельника (1)
  // В JS dayOfWeek: 0 (Вс), 1 (Пн), ..., 6 (Сб)
  const mondayOffset = kh.dayOfWeek === 0 ? -6 : 1 - kh.dayOfWeek;
  
  // Возвращаем полночь понедельника в Хабаровске
  const startDayComponents = getKhabarovskComponents(new Date(Date.now() + mondayOffset * 24 * 3600_000));
  return new Date(`${startDayComponents.year}-${String(startDayComponents.month0 + 1).padStart(2, "0")}-${String(startDayComponents.date).padStart(2, "0")}T00:00:00+10:00`);
}
