import {
  candidateDayMinutesOnDate,
  findDailyHoursExceeded,
  findGuardTimeOverlap,
  formatMinutesAsHours,
  guardMergedDayMinutesByDate,
  listOtherObjectShiftsOnDate,
  remainingDayMinutes,
  segmentOverlapsInterval,
  type OtherObjectDayShift,
} from "./guard-daily-load";
import { formatCompactTimeRangeLocal } from "../format/display-date";

type GuardLike = {
  id: string;
  status?: string;
};

type ShiftLike = {
  id: string;
  guardId: string;
  objectId: string;
  startsAt: Date;
  endsAt: Date;
  isNoShow?: boolean;
};

type ShiftInterval = {
  startsAt: Date;
  endsAt: Date;
  objectId?: string;
};

type AvailabilityOptions = {
  replaceShiftId?: string;
  excludeGuardId?: string;
  /** Текущий объект назначения — для подсказки о сменах на других объектах. */
  currentObjectId?: string;
  /** Локальный день назначения `YYYY-MM-DD`. */
  assignmentDateIso?: string;
};

export function listAvailableGuardsForShiftInterval<TGuard extends GuardLike>(
  guards: ReadonlyArray<TGuard>,
  shifts: ReadonlyArray<ShiftLike>,
  interval: ShiftInterval,
  options: AvailabilityOptions = {},
): TGuard[] {
  return listGuardsWithAvailability(guards, shifts, interval, options)
    .filter((item) => item.available)
    .map((item) => item.guard);
}

/**
 * Расширенный вариант: возвращает всех охранников с флагом доступности и причиной недоступности.
 * Пересечение по времени запрещено на любом объекте; суточный лимит — 24 ч.
 */
export type GuardAvailabilityReason =
  | "Sick"
  | "OnVacation"
  | "Inactive"
  | "Dismissed"
  | "ConflictingShift"
  | "DailyHoursExceeded";

export type GuardAvailability<TGuard> = {
  guard: TGuard;
  available: boolean;
  reason?: GuardAvailabilityReason;
  /** Если занят сменой — её начало/конец и объект. */
  conflictStart?: Date;
  conflictEnd?: Date;
  conflictObjectId?: string;
  /** Смены на других объектах в день назначения (пересекающиеся по времени с интервалом). */
  otherObjectShifts?: OtherObjectDayShift[];
  /** Объединённая нагрузка охранника в день назначения (без двойного счёта). */
  assignmentDayUsedMinutes?: number;
  /** Сколько минут ещё можно назначить в этот день (без учёта текущего интервала). */
  remainingDayMinutes?: number;
  /** Минуты текущего интервала в день назначения. */
  candidateDayMinutes?: number;
};

export function listGuardsWithAvailability<TGuard extends GuardLike>(
  guards: ReadonlyArray<TGuard>,
  shifts: ReadonlyArray<ShiftLike>,
  interval: ShiftInterval,
  options: AvailabilityOptions = {},
): GuardAvailability<TGuard>[] {
  const objectId = interval.objectId ?? options.currentObjectId ?? "";
  const assignmentDateIso = options.assignmentDateIso;
  const out: GuardAvailability<TGuard>[] = [];

  for (const guard of guards) {
    if (options.excludeGuardId && guard.id === options.excludeGuardId) continue;
    const status = guard.status;
    if (status === "Sick") {
      out.push({ guard, available: false, reason: "Sick" });
      continue;
    }
    if (status === "OnVacation") {
      out.push({ guard, available: false, reason: "OnVacation" });
      continue;
    }
    if (status === "Inactive") {
      out.push({ guard, available: false, reason: "Inactive" });
      continue;
    }
    if (status === "Dismissed") {
      out.push({ guard, available: false, reason: "Dismissed" });
      continue;
    }

    const otherObjectShiftsAll =
      assignmentDateIso && objectId
        ? listOtherObjectShiftsOnDate(
            guard.id,
            assignmentDateIso,
            objectId,
            shifts,
            options.replaceShiftId,
          )
        : undefined;

    const otherObjectShifts = otherObjectShiftsAll?.filter((shift) =>
      segmentOverlapsInterval(
        shift.segmentStartsAt,
        shift.segmentEndsAt,
        interval.startsAt,
        interval.endsAt,
      ),
    );

    const assignmentDayUsedMinutes =
      assignmentDateIso !== undefined
        ? guardMergedDayMinutesByDate(guard.id, shifts, options.replaceShiftId)[assignmentDateIso] ?? 0
        : undefined;

    const timeOverlap = findGuardTimeOverlap(
      guard.id,
      interval.startsAt,
      interval.endsAt,
      shifts,
      options.replaceShiftId,
      { assignmentDateIso },
    );

    if (timeOverlap) {
      out.push({
        guard,
        available: false,
        reason: "ConflictingShift",
        conflictStart: timeOverlap.startsAt,
        conflictEnd: timeOverlap.endsAt,
        conflictObjectId: timeOverlap.objectId,
        otherObjectShifts,
        assignmentDayUsedMinutes,
      });
      continue;
    }

    const dailyExceeded = findDailyHoursExceeded(
      guard.id,
      interval.startsAt,
      interval.endsAt,
      shifts,
      options.replaceShiftId,
    );

    const remaining =
      assignmentDateIso !== undefined
        ? remainingDayMinutes(guard.id, assignmentDateIso, shifts, options.replaceShiftId)
        : undefined;

    const candidateDayMinutes =
      assignmentDateIso !== undefined
        ? candidateDayMinutesOnDate(interval.startsAt, interval.endsAt, assignmentDateIso)
        : undefined;

    if (dailyExceeded) {
      out.push({
        guard,
        available: false,
        reason: "DailyHoursExceeded",
        otherObjectShifts,
        assignmentDayUsedMinutes,
        remainingDayMinutes: remaining,
        candidateDayMinutes,
      });
      continue;
    }

    out.push({
      guard,
      available: true,
      otherObjectShifts,
      assignmentDayUsedMinutes,
      remainingDayMinutes: remaining,
      candidateDayMinutes,
    });
  }
  return out;
}

type GuardAvailabilityMessageItem = Pick<
  GuardAvailability<unknown>,
  | "available"
  | "reason"
  | "conflictStart"
  | "conflictEnd"
  | "conflictObjectId"
  | "assignmentDayUsedMinutes"
  | "remainingDayMinutes"
  | "candidateDayMinutes"
>;

function formatGuardUnavailabilityDetail(
  item: GuardAvailabilityMessageItem,
  objectNameById: ReadonlyMap<string, string>,
): string {
  switch (item.reason) {
    case "Sick":
      return "больничный";
    case "OnVacation":
      return "отпуск";
    case "Inactive":
      return "неактивен";
    case "Dismissed":
      return "уволен";
    case "ConflictingShift": {
      const objectName = item.conflictObjectId
        ? objectNameById.get(item.conflictObjectId) ?? "другой объект"
        : "другой объект";
      const range =
        item.conflictStart && item.conflictEnd
          ? formatCompactTimeRangeLocal(item.conflictStart, item.conflictEnd)
          : "пересечение по времени";
      return `пересечение со сменой на «${objectName}» ${range}`;
    }
    case "DailyHoursExceeded": {
      const usedMinutes = item.assignmentDayUsedMinutes ?? 0;
      const candidateMinutes = item.candidateDayMinutes ?? 0;
      const remainingMinutes = item.remainingDayMinutes ?? 0;
      const used = formatMinutesAsHours(usedMinutes);
      const candidate = formatMinutesAsHours(candidateMinutes);
      const remaining = formatMinutesAsHours(remainingMinutes);

      if (remainingMinutes <= 0) {
        return `за сутки уже ${used} ч — свободных часов нет`;
      }
      return `за сутки уже ${used} ч, эта смена ${candidate} ч — лимит 24 ч (свободно ${remaining} ч)`;
    }
    default:
      return "недоступен";
  }
}

/** Точное сообщение, почему охранник недоступен в выбранный интервал. */
export function formatGuardAvailabilityMessage(
  guardDisplayName: string,
  item: GuardAvailabilityMessageItem,
  objectNameById: ReadonlyMap<string, string>,
): string | null {
  if (item.available) return null;
  return `${guardDisplayName}: ${formatGuardUnavailabilityDetail(item, objectNameById)}.`;
}

/** Подсказка, почему охранник из строки графика недоступен, когда подобран другой. */
export function formatRequestedGuardSubstitutionHint(
  guardDisplayName: string,
  item: GuardAvailabilityMessageItem,
  objectNameById: ReadonlyMap<string, string>,
  selectedGuardDisplayName?: string,
): string | null {
  if (item.available) return null;

  const detail = formatGuardUnavailabilityDetail(item, objectNameById);
  const prefix = `В строке — ${guardDisplayName}: ${detail}`;
  if (selectedGuardDisplayName) {
    return `${prefix}. Назначен ${selectedGuardDisplayName}.`;
  }
  return `${prefix}.`;
}
