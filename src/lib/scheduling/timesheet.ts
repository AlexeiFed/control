import { incidentCategoryLabels } from "../operations/status-labels";
import { computeShiftRateBreakdown, billableShiftWindow, type GuardRateContribution } from "../rates/rate-calculator";
import type { ObjectRateRuleRecord } from "../operations/object-rate-rules-repository";
import { DEFAULT_SHIFT_TIMEZONE, localDateKeyInTimeZone } from "../rates/holiday-calendar";
import type { GuardProfileResolver } from "../guards/profile-periods";
import { calculateShiftHours } from "./hour-calculator";
import type { Guard, SecurityObject, Shift, ShiftKind } from "./types";

export type AttendanceIncidentLine = {
  recordedAt: string;
  description: string;
  unworkedHours: number;
};

export type TimesheetRow = {
  guardName: string;
  /** Стабильный id объекта; группировка/ведомость по нему, не по имени. */
  objectId?: string;
  objectName: string;
  postId?: string | null;
  postName?: string | null;
  startsAt: string;
  endsAt: string;
  totalHours: number;
  nightHours: number;
  holidayHours: number;
  /** Полный невыход / частичная отработка (только FullNoShow и LeftWork). */
  incidentsCount: number;
  attendanceIncident: AttendanceIncidentLine | null;
  incidentLogLines: ReadonlyArray<{ createdAt: string; note: string }>;
  regularHours: number;
  reinforcementHours: number;
  /** Часы смен типа МП (RapidResponse) */
  rapidResponseHours: number;
  /** Запланированные часы смены без фактической отработки (невыход) */
  unworkedHours: number;
  isNoShow: boolean;
  clientAmountCents: number;
  guardAmountCents: number;
  marginCents: number;
  /** Минуты и сумма по тарифным ставкам охранника (без усреднения). */
  guardRateContributions?: ReadonlyArray<GuardRateContribution>;
  /** true, если для автоматической стороны были минуты без правила */
  unpriced: boolean;
};

type BuildTimesheetRowsInput = {
  guards: Guard[];
  objects: SecurityObject[];
  shifts: Shift[];
  holidayDates?: ReadonlySet<string>;
  incidentLogLinesByShiftId?: ReadonlyMap<string, ReadonlyArray<{ createdAt: string; note: string }>>;
  rateRulesByObjectId?: Record<string, ObjectRateRuleRecord[]>;
  postsByPostId?: ReadonlyMap<string, { id: string; name: string }>;
  timeZone?: string;
  profileResolver?: GuardProfileResolver;
};

export function buildTimesheetRows({
  guards,
  objects,
  shifts,
  holidayDates = new Set<string>(),
  incidentLogLinesByShiftId = new Map<string, ReadonlyArray<{ createdAt: string; note: string }>>(),
  rateRulesByObjectId = {},
  postsByPostId = new Map<string, { id: string; name: string }>(),
  timeZone = DEFAULT_SHIFT_TIMEZONE,
  profileResolver,
}: BuildTimesheetRowsInput): TimesheetRow[] {
  const guardById = new Map(guards.map((g) => [g.id, g] as const));
  const objectById = new Map(objects.map((o) => [o.id, o] as const));

  return shifts.map((shift) => {
    const baseGuard = guardById.get(shift.guardId);
    const shiftDate = localDateKeyInTimeZone(shift.startsAt, timeZone);
    const guard =
      baseGuard && profileResolver ? profileResolver.resolveGuardAt(baseGuard, shiftDate) : baseGuard;
    const object = objectById.get(shift.objectId);
    const totalMin = shiftDurationMinutes(shift);
    const scheduledHours = Math.round((totalMin / 60) * 100) / 100;

    const postName = shift.postId ? postsByPostId.get(shift.postId)?.name : null;

    const window = billableShiftWindow(shift);
    if (shift.isNoShow && !window) {
      const unworkedHours = scheduledHours;
      return buildTimesheetRow({
        shift,
        guard,
        object,
        postName,
        startsAt: shift.startsAt.toISOString(),
        endsAt: shift.endsAt.toISOString(),
        totalHours: 0,
        nightHours: 0,
        holidayHours: 0,
        regularHours: 0,
        reinforcementHours: 0,
        rapidResponseHours: 0,
        unworkedHours,
        isNoShow: true,
        clientAmountCents: 0,
        guardAmountCents: 0,
        marginCents: 0,
        guardRateContributions: [],
        unpriced: false,
        incidentLogLinesByShiftId,
      });
    }

    const billingShift: Shift =
      shift.isNoShow && window
        ? { ...shift, startsAt: window.start, endsAt: window.end, isNoShow: false }
        : shift;

    const hours = calculateShiftHours({
      startsAt: billingShift.startsAt,
      endsAt: billingShift.endsAt,
      holidayDates,
      timeZone,
    });

    const rules = rateRulesByObjectId[shift.objectId] ?? [];
    const billMin = shiftDurationMinutes(billingShift);
    const th = Math.round((billMin / 60) * 100) / 100;
    const kindHours = splitHoursByShiftKind(shift.shiftKind, th);
    const pricing =
      guard && object
        ? computeShiftRateBreakdown(shift, guard, rules, holidayDates, timeZone)
        : {
            clientAmountCents: 0,
            guardAmountCents: 0,
            marginCents: 0,
            regularHours: kindHours.regularHours,
            reinforcementHours: kindHours.reinforcementHours + kindHours.rapidResponseHours,
            unpricedMinutes: billingShift.startsAt < billingShift.endsAt ? billMin : 0,
            guardRateContributions: [],
          };

    const unworkedHours =
      shift.isNoShow && window ? Math.round(((totalMin - billMin) / 60) * 100) / 100 : 0;

    const netKindHours = round2(Math.max(0, hours.totalHours - hours.holidayHours));
    const workedKindHours = splitHoursByShiftKind(shift.shiftKind, netKindHours);

    return buildTimesheetRow({
      shift,
      guard,
      object,
      postName,
      startsAt: shift.startsAt.toISOString(),
      endsAt: shift.endsAt.toISOString(),
      totalHours: hours.totalHours,
      nightHours: hours.nightHours,
      holidayHours: hours.holidayHours,
      regularHours: workedKindHours.regularHours,
      reinforcementHours: workedKindHours.reinforcementHours,
      rapidResponseHours: workedKindHours.rapidResponseHours,
      unworkedHours,
      isNoShow: shift.isNoShow,
      clientAmountCents: pricing.clientAmountCents,
      guardAmountCents: pricing.guardAmountCents,
      marginCents: pricing.marginCents,
      guardRateContributions: pricing.guardRateContributions,
      unpriced: pricing.unpricedMinutes > 0,
      incidentLogLinesByShiftId,
    });
  });
}

type BuildTimesheetRowInput = {
  shift: Shift;
  guard: Guard | undefined;
  object: SecurityObject | undefined;
  postName: string | null | undefined;
  startsAt: string;
  endsAt: string;
  totalHours: number;
  nightHours: number;
  holidayHours: number;
  regularHours: number;
  reinforcementHours: number;
  rapidResponseHours: number;
  unworkedHours: number;
  isNoShow: boolean;
  clientAmountCents: number;
  guardAmountCents: number;
  marginCents: number;
  guardRateContributions?: ReadonlyArray<GuardRateContribution>;
  unpriced: boolean;
  incidentLogLinesByShiftId: ReadonlyMap<string, ReadonlyArray<{ createdAt: string; note: string }>>;
};

function buildTimesheetRow(input: BuildTimesheetRowInput): TimesheetRow {
  const attendanceIncident = buildAttendanceIncident(input.shift, input.unworkedHours);
  return {
    guardName: input.guard?.name ?? input.shift.guardId,
    objectId: input.shift.objectId,
    objectName: input.object?.name ?? input.shift.objectId,
    postId: input.shift.postId,
    postName: input.postName ?? null,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    totalHours: input.totalHours,
    nightHours: input.nightHours,
    holidayHours: input.holidayHours,
    incidentsCount: attendanceIncident ? 1 : 0,
    attendanceIncident,
    incidentLogLines: input.incidentLogLinesByShiftId.get(input.shift.id) ?? [],
    regularHours: input.regularHours,
    reinforcementHours: input.reinforcementHours,
    rapidResponseHours: input.rapidResponseHours,
    unworkedHours: input.unworkedHours,
    isNoShow: input.isNoShow,
    clientAmountCents: input.clientAmountCents,
    guardAmountCents: input.guardAmountCents,
    marginCents: input.marginCents,
    guardRateContributions: input.guardRateContributions ?? [],
    unpriced: input.unpriced,
  };
}

function buildAttendanceIncident(shift: Shift, unworkedHours: number): AttendanceIncidentLine | null {
  if (shift.incidentCategory === "FullNoShow" || shift.incidentCategory === "LeftWork") {
    const label = incidentCategoryLabels[shift.incidentCategory];
    const description = shift.incidentComment?.trim()
      ? `${label}: ${shift.incidentComment.trim()}`
      : label;

    return {
      recordedAt: shift.startsAt.toISOString(),
      description,
      unworkedHours: round2(unworkedHours),
    };
  }

  if (shift.isNoShow && unworkedHours > 0) {
    return {
      recordedAt: shift.startsAt.toISOString(),
      description: "Невыход",
      unworkedHours: round2(unworkedHours),
    };
  }

  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function shiftDurationMinutes(shift: Shift): number {
  return Math.max(0, Math.floor((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000));
}

function splitHoursByShiftKind(
  shiftKind: ShiftKind,
  totalHours: number,
): { regularHours: number; reinforcementHours: number; rapidResponseHours: number } {
  if (shiftKind === "Regular") {
    return { regularHours: totalHours, reinforcementHours: 0, rapidResponseHours: 0 };
  }
  if (shiftKind === "Reinforcement") {
    return { regularHours: 0, reinforcementHours: totalHours, rapidResponseHours: 0 };
  }
  return { regularHours: 0, reinforcementHours: 0, rapidResponseHours: totalHours };
}

export type TimesheetCsvDateResolver = (row: TimesheetRow) => string;

/** Счёт клиенту: без сумм зарплаты сотрудника. */
export function exportClientInvoiceCsv(
  rows: TimesheetRow[],
  resolveOperationalDateIso?: TimesheetCsvDateResolver,
): string {
  const header = [
    "охранник",
    "объект",
    "дата опер. суток",
    "начало смены",
    "конец смены",
    "всего часов",
    "не отработано ч",
    "обычные ч",
    "усиление ч",
    "ночных часов",
    "праздничных часов",
    "инциденты",
    "клиент коп",
    "нет ставки",
  ];

  const lines = rows.map((row) =>
    [
      row.guardName,
      row.objectName,
      resolveOperationalDateIso?.(row) ?? "",
      row.startsAt,
      row.endsAt,
      String(row.totalHours),
      String(row.unworkedHours),
      String(row.regularHours),
      String(row.reinforcementHours),
      String(row.nightHours),
      String(row.holidayHours),
      String(row.incidentsCount),
      String(row.clientAmountCents),
      row.unpriced ? "да" : "нет",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

/** Зарплата сотрудникам: без клиентских сумм и маржи. */
export function exportPayrollCsv(
  rows: TimesheetRow[],
  resolveOperationalDateIso?: TimesheetCsvDateResolver,
): string {
  const header = [
    "охранник",
    "объект",
    "дата опер. суток",
    "начало смены",
    "конец смены",
    "всего часов",
    "не отработано ч",
    "обычные ч",
    "усиление ч",
    "ночных часов",
    "праздничных часов",
    "инциденты",
    "сотрудник коп",
    "нет ставки",
  ];

  const lines = rows.map((row) =>
    [
      row.guardName,
      row.objectName,
      resolveOperationalDateIso?.(row) ?? "",
      row.startsAt,
      row.endsAt,
      String(row.totalHours),
      String(row.unworkedHours),
      String(row.regularHours),
      String(row.reinforcementHours),
      String(row.nightHours),
      String(row.holidayHours),
      String(row.incidentsCount),
      String(row.guardAmountCents),
      row.unpriced ? "да" : "нет",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

/** Полный CSV (все суммы) — для совместимости и тестов. */
export function exportTimesheetCsv(rows: TimesheetRow[]): string {
  const header = [
    "охранник",
    "объект",
    "начало смены",
    "конец смены",
    "всего часов",
    "не отработано ч",
    "обычных ч (усил)",
    "усиление ч",
    "ночных часов",
    "праздничных часов",
    "инциденты",
    "клиент коп",
    "сотрудник коп",
    "маржа коп",
    "нет ставки",
  ];

  const lines = rows.map((row) =>
    [
      row.guardName,
      row.objectName,
      row.startsAt,
      row.endsAt,
      String(row.totalHours),
      String(row.unworkedHours),
      String(row.regularHours),
      String(row.reinforcementHours),
      String(row.nightHours),
      String(row.holidayHours),
      String(row.incidentsCount),
      String(row.clientAmountCents),
      String(row.guardAmountCents),
      String(row.marginCents),
      row.unpriced ? "да" : "нет",
    ]
      .map(escapeCsvCell)
      .join(","),
  );

  return [header.join(","), ...lines].join("\n");
}

function escapeCsvCell(value: string): string {
  if (!/[",\n]/.test(value)) return value;
  return `"${value.replaceAll('"', '""')}"`;
}
