import { Suspense } from "react";
import { GuardHistoryCard } from "./guard-history-card";
import { GuardScheduleSection } from "./guard-schedule-section";
import { GuardServiceRecordSection } from "./guard-service-record-section";
import {
  listGuardServiceHistory,
  listGuardShiftHistoryInRange,
  type GuardDetails,
} from "../../lib/operations/guards-repository";
import { calculateShiftHours } from "../../lib/scheduling/hour-calculator";
import {
  addDaysToIsoDate,
  formatDisplayDateFromIso,
  formatMonthYearLongRu,
  getKhabarovskComponents,
  khabarovskMonthRangeContaining,
  khabarovskWeekRangeContaining,
  toDateIsoKhabarovsk,
} from "../../lib/format/display-date";

type AssignedObject = GuardDetails["objects"][number];

function formatDayMonthShort(isoDate: string): string {
  const formatted = formatDisplayDateFromIso(isoDate);
  const parts = formatted.split(".");
  if (parts.length < 2) return formatted;
  return `${parts[0]}.${parts[1]}`;
}

function sumHours(shifts: Array<{ startsAt: Date; endsAt: Date }>) {
  const totalHours = shifts.reduce((sum, shift) => {
    const hours = calculateShiftHours({ startsAt: shift.startsAt, endsAt: shift.endsAt });
    return sum + hours.totalHours;
  }, 0);
  return { totalHours: Math.round(totalHours * 100) / 100 };
}

function HoursCardsSkeleton({ weekTitle, monthTitle }: { weekTitle: string; monthTitle: string }) {
  return (
    <>
      <article className="animate-pulse rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold text-app-muted">{weekTitle}</h2>
        <div className="mt-3 h-9 w-24 rounded bg-app-border/40" />
      </article>
      <article className="animate-pulse rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold text-app-muted">{monthTitle}</h2>
        <div className="mt-3 h-9 w-24 rounded bg-app-border/40" />
      </article>
    </>
  );
}

function HistorySkeleton() {
  return (
    <div className="animate-pulse rounded-card border border-app-border bg-app-elevated p-4">
      <div className="mb-4 h-6 w-40 rounded bg-app-border/40" />
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-14 rounded bg-app-border/40" />
        ))}
      </div>
    </div>
  );
}

async function GuardProfileHoursCards({
  guardId,
  initialDate,
  weekCardTitle,
  monthCardTitle,
}: {
  guardId: string;
  initialDate: string;
  weekCardTitle: string;
  monthCardTitle: string;
}) {
  const weekRange = khabarovskWeekRangeContaining(initialDate);
  const monthRange = khabarovskMonthRangeContaining(initialDate);
  const [weekShifts, monthShifts] = await Promise.all([
    listGuardShiftHistoryInRange(guardId, weekRange.start, weekRange.endExclusive),
    listGuardShiftHistoryInRange(guardId, monthRange.start, monthRange.endExclusive),
  ]);
  const weekStats = sumHours(weekShifts);
  const monthStats = sumHours(monthShifts);

  return (
    <>
      <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold text-app-muted">{weekCardTitle}</h2>
        <p className="mt-2 text-2xl font-extrabold text-accent-primary sm:mt-3 sm:text-3xl">
          {weekStats.totalHours} ч
        </p>
      </article>
      <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
        <h2 className="text-xs font-semibold text-app-muted">{monthCardTitle}</h2>
        <p className="mt-2 text-2xl font-extrabold text-accent-primary sm:mt-3 sm:text-3xl">
          {monthStats.totalHours} ч
        </p>
      </article>
    </>
  );
}

async function GuardProfileHistoryDeferred({ guardId }: { guardId: string }) {
  const serviceHistory = await listGuardServiceHistory(guardId);
  return <GuardHistoryCard entries={serviceHistory} />;
}

/** Часы / история / график — после shell; календарь грузит месяц на клиенте. */
export function GuardProfileDeferredSections({
  guardId,
  assignedObjects,
  initialDate,
}: {
  guardId: string;
  assignedObjects: AssignedObject[];
  initialDate: string;
}) {
  const weekRange = khabarovskWeekRangeContaining(initialDate);
  const weekEndIso = addDaysToIsoDate(toDateIsoKhabarovsk(weekRange.start), 6);
  const weekCardTitle = `За неделю (${formatDayMonthShort(toDateIsoKhabarovsk(weekRange.start))}–${formatDayMonthShort(weekEndIso)})`;
  const monthKh = getKhabarovskComponents(new Date(`${initialDate}T12:00:00+10:00`));
  const monthCardTitle = `За месяц (${formatMonthYearLongRu(monthKh.year, monthKh.month0).replace(/\s*г\.?\s*$/, "").toLowerCase()})`;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-app-muted">
            Закрепленные объекты
          </h2>
          <ul className="mt-2 space-y-1 text-sm font-semibold text-app-text sm:mt-3">
            {assignedObjects.length > 0 ? (
              assignedObjects.map((object) => (
                <li key={object.id} className="list-inside list-disc">
                  {object.name}
                </li>
              ))
            ) : (
              <li className="font-normal text-app-muted">Нет закрепленных объектов</li>
            )}
          </ul>
        </article>
        <Suspense
          fallback={<HoursCardsSkeleton weekTitle={weekCardTitle} monthTitle={monthCardTitle} />}
        >
          <GuardProfileHoursCards
            guardId={guardId}
            initialDate={initialDate}
            weekCardTitle={weekCardTitle}
            monthCardTitle={monthCardTitle}
          />
        </Suspense>
      </div>

      <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense fallback={<HistorySkeleton />}>
            <GuardProfileHistoryDeferred guardId={guardId} />
          </Suspense>
        </div>
        <div>
          <GuardServiceRecordSection guardId={guardId} />
        </div>
      </div>

      <GuardScheduleSection
        guardId={guardId}
        assignedObjects={assignedObjects}
        initialDate={initialDate}
      />
    </>
  );
}
