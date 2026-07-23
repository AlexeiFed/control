import { unstable_cache } from "next/cache";
import { hasPermission, type Role } from "../auth/rbac";
import { formatDisplayDateFromIso, formatWeekdayDayLabel, getMondayWeekStartKhabarovsk, toDateIsoKhabarovsk } from "../format/display-date";
import {
  listGuardsForMedicalCommissionReminders,
  listGuardsForPeriodicCheckReminders,
  listGuardsWithBirthdayToday,
} from "./guards-repository";
import { getSchedulerSnapshot, listPendingIncidentReplacements } from "./scheduler-repository";
import { listShiftTemplatesForObjectIds } from "./shift-templates-repository";
import { filterShortagesByStoredDismissals } from "./schedule-shortage-dismissals-repository";
import { buildExpectedShiftsByObjectAndDay, civilDateKeyFromDate } from "../scheduling/object-shift-templates";
import { computeScheduleShortages } from "../scheduling/schedule-shortage";
import type { IncidentCategory } from "../scheduling/types";

export type GlobalAlertIncidentItem = {
  shiftId: string;
  objectName: string;
  shiftDateKey: string;
  guardName: string;
  category: IncidentCategory;
  comment: string;
};

export type GlobalAlertComplianceItem = {
  guardId: string;
  guardName: string;
  reminderKind?: "expiry" | "personal_card";
  passedOn?: string;
  passedOnDisplay: string;
  expiryIso?: string;
  expiryDisplay: string;
};

export type GlobalAlertDayShortage = {
  dateIso: string;
  dayLabel: string;
  hoursShort: number;
  reinforcementShort: number;
  rapidResponseShort: number;
  shiftLeadShort: number;
  expectedHoursRegular: number;
  regularDayHours: number;
};

export type GlobalAlertObjectShortage = {
  objectId: string;
  objectName: string;
  totalHoursShort: number;
  totalReinforcementShort: number;
  totalRapidResponseShort: number;
  totalShiftLeadShort: number;
  days: GlobalAlertDayShortage[];
};

export type GlobalAlertBirthdayItem = {
  guardId: string;
  guardName: string;
  birthDate: string;
  birthDateDisplay: string;
  ageYears: number;
};

export type GlobalAlertsPayload = {
  incidentItems: GlobalAlertIncidentItem[] | null;
  canDismissIncidentAlerts: boolean;
  periodicItems: GlobalAlertComplianceItem[] | null;
  medicalItems: GlobalAlertComplianceItem[] | null;
  birthdayItems: GlobalAlertBirthdayItem[] | null;
  shortages: GlobalAlertObjectShortage[] | null;
  canDismissShortages: boolean;
  weekStartIso: string | null;
};

async function loadGlobalAlertsForRole(role: Role): Promise<GlobalAlertsPayload> {
  const canSchedule = hasPermission(role, "schedule:read");
  const canGuards = hasPermission(role, "guards:manage");

  const [incidentItems, periodicRows, medicalRows, birthdayRows, shortagesPart] = await Promise.all([
    canSchedule ? listPendingIncidentReplacements() : Promise.resolve(null),
    canGuards ? listGuardsForPeriodicCheckReminders() : Promise.resolve(null),
    canGuards ? listGuardsForMedicalCommissionReminders() : Promise.resolve(null),
    canGuards ? listGuardsWithBirthdayToday() : Promise.resolve(null),
    canSchedule ? loadScheduleShortages() : Promise.resolve(null),
  ]);

  return {
    incidentItems: incidentItems
      ? incidentItems.map((item) => ({
          shiftId: item.shiftId,
          objectName: item.objectName,
          shiftDateKey: item.shiftDateKey,
          guardName: item.guardName,
          category: item.category,
          comment: item.comment,
        }))
      : null,
    canDismissIncidentAlerts: hasPermission(role, "schedule:write"),
    periodicItems: periodicRows
      ? periodicRows.map((row) => {
          const isPersonalCard = row.reminderKind === "personal_card";
          const referenceIso = isPersonalCard
            ? (row.personalCardAssignedOn ?? row.passedOn)
            : (row.periodicCheckPassedOn ?? row.passedOn);
          return {
            guardId: row.guardId,
            guardName: `${row.lastName} ${row.firstName}`,
            reminderKind: row.reminderKind,
            passedOn: referenceIso,
            passedOnDisplay: formatDisplayDateFromIso(referenceIso),
            expiryIso: row.expiryIso,
            expiryDisplay: formatDisplayDateFromIso(row.expiryIso),
          };
        })
      : null,
    medicalItems: medicalRows
      ? medicalRows.map((row) => ({
          guardId: row.guardId,
          guardName: `${row.lastName} ${row.firstName}`,
          passedOn: row.passedOn,
          passedOnDisplay: formatDisplayDateFromIso(row.passedOn),
          expiryIso: row.expiryIso,
          expiryDisplay: formatDisplayDateFromIso(row.expiryIso),
        }))
      : null,
    birthdayItems: birthdayRows
      ? birthdayRows.map((row) => ({
          guardId: row.guardId,
          guardName: [row.lastName, row.firstName, row.middleName].filter(Boolean).join(" "),
          birthDate: row.birthDate,
          birthDateDisplay: formatDisplayDateFromIso(row.birthDate),
          ageYears: row.ageYears,
        }))
      : null,
    shortages: shortagesPart?.shortages ?? null,
    canDismissShortages: hasPermission(role, "schedule:write"),
    weekStartIso: shortagesPart?.weekStartIso ?? null,
  };
}

async function loadScheduleShortages(): Promise<{
  shortages: GlobalAlertObjectShortage[];
  weekStartIso: string;
}> {
  const weekStart = getMondayWeekStartKhabarovsk();
  const visibleDayCount = 7;
  const weekDayIsos = Array.from({ length: visibleDayCount }, (_, index) =>
    civilDateKeyFromDate(new Date(weekStart.getTime() + index * 24 * 60 * 60_000)),
  );
  const weekDays = Array.from({ length: visibleDayCount }, (_, index) => {
    const date = new Date(weekStart.getTime() + index * 24 * 60 * 60_000);
    return {
      iso: toDateIsoKhabarovsk(date),
      label: formatWeekdayDayLabel(date),
    };
  });

  const snapshot = await getSchedulerSnapshot(weekStart);
  const objectIds = snapshot.objects.map((o) => o.id);
  const templates =
    objectIds.length > 0 ? await listShiftTemplatesForObjectIds(objectIds) : [];
  const expectedShiftsByObjectDay = buildExpectedShiftsByObjectAndDay(objectIds, weekDayIsos, templates);
  const rawShortages = computeScheduleShortages(
    snapshot.objects,
    snapshot.shifts,
    expectedShiftsByObjectDay,
    weekDays,
  );
  const shortages = await filterShortagesByStoredDismissals({
    objectIds,
    weekDayIsos,
    objects: snapshot.objects,
    shifts: snapshot.shifts,
    expectedByObjectDay: expectedShiftsByObjectDay,
    rawShortages,
  });

  return { shortages, weekStartIso: toDateIsoKhabarovsk(weekStart) };
}

const getGlobalAlertsCached = unstable_cache(
  (role: string) => loadGlobalAlertsForRole(role as Role),
  ["global-alerts:v3"],
  {
    tags: ["global-alerts", "scheduler", "shifts", "guards", "directory"],
    revalidate: 180,
  },
);

export async function getGlobalAlerts(role: Role): Promise<GlobalAlertsPayload> {
  return getGlobalAlertsCached(role);
}
