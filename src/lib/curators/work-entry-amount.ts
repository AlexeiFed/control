export type CuratorWorkType =
  | "RouteObjects"
  | "NightInspection"
  | "ReplacementShift"
  | "MonthlySalary"
  | "ScheduleRegular"
  | "ScheduleReinforcement"
  | "ScheduleRapidResponse";

export const SCHEDULE_CURATOR_WORK_TYPES = [
  "ScheduleRegular",
  "ScheduleReinforcement",
  "ScheduleRapidResponse",
] as const satisfies readonly CuratorWorkType[];

export function isScheduleCuratorWorkType(workType: CuratorWorkType): boolean {
  return (SCHEDULE_CURATOR_WORK_TYPES as readonly string[]).includes(workType);
}

export type ComputeOptions = {
  isBaseIncluded?: boolean;
  customHourlyRate?: number | null;
  /** Фиксированная сумма оклада по должности (MonthlySalary). */
  monthlySalaryRub?: number | null;
};

export const curatorWorkTypeLabels: Record<CuratorWorkType, string> = {
  RouteObjects: "Выход на маршрут по объектам",
  NightInspection: "Ночная проверка объектов",
  ReplacementShift: "Замена охранника в смене",
  MonthlySalary: "Оклад по должности",
  ScheduleRegular: "Смена на объекте (из графика)",
  ScheduleReinforcement: "Усиление (из графика)",
  ScheduleRapidResponse: "МП (из графика)",
};

/** Тарифы начислений (₽), хранятся в БД; значения по умолчанию — до первой миграции. */
export type CuratorTariffs = {
  routeBaseRub: number;
  routeHourlyRub: number;
  nightInspectionRub: number;
  replacementHourlyRub: number;
  /** Фиксированная доплата куратору за час дежурства (смена, усиление, МП из графика). */
  scheduleRegularHourlyRub: number;
};

export const DEFAULT_CURATOR_TARIFFS: CuratorTariffs = {
  routeBaseRub: 500,
  routeHourlyRub: 265,
  nightInspectionRub: 3000,
  replacementHourlyRub: 200,
  scheduleRegularHourlyRub: 25,
};

/** Алиасы к дефолтам (тесты, обратная совместимость). */
export const ROUTE_BASE_RUB = DEFAULT_CURATOR_TARIFFS.routeBaseRub;
export const ROUTE_HOURLY_RUB = DEFAULT_CURATOR_TARIFFS.routeHourlyRub;
export const NIGHT_INSPECTION_RUB = DEFAULT_CURATOR_TARIFFS.nightInspectionRub;
export const REPLACEMENT_HOURLY_RUB = DEFAULT_CURATOR_TARIFFS.replacementHourlyRub;

export function computeCuratorEntryRub(
  workType: CuratorWorkType,
  hours: number | null,
  tariffs: CuratorTariffs = DEFAULT_CURATOR_TARIFFS,
  options: ComputeOptions = {},
): number {
  const { isBaseIncluded = true, customHourlyRate = null, monthlySalaryRub = null } = options;

  switch (workType) {
    case "RouteObjects": {
      if (hours == null || hours <= 0) return 0;
      const base = isBaseIncluded ? tariffs.routeBaseRub : 0;
      return Math.round(base + tariffs.routeHourlyRub * hours);
    }
    case "MonthlySalary":
      return monthlySalaryRub != null && monthlySalaryRub > 0 ? Math.round(monthlySalaryRub) : 0;
    case "NightInspection":
      return tariffs.nightInspectionRub;
    case "ReplacementShift": {
      if (hours == null || hours <= 0) return 0;
      const rate = customHourlyRate ?? tariffs.replacementHourlyRub;
      return Math.round(rate * hours);
    }
    case "ScheduleReinforcement":
    case "ScheduleRapidResponse":
    case "ScheduleRegular":
      return 0;
    default: {
      const _exhaustive: never = workType;
      return _exhaustive;
    }
  }
}
