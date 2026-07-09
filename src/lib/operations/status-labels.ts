import type {
  GuardEmploymentType,
  GuardLicenseType,
  GuardPosition,
  GuardStatus,
  IncidentCategory,
  RateUnit,
  ShiftKind,
} from "../scheduling/types";

export const guardStatusLabels: Record<GuardStatus, string> = {
  Active: "Активен",
  Sick: "Болеет",
  OnVacation: "В отпуске",
  Inactive: "Неактивен",
  Dismissed: "Уволен",
};

export const objectStatusLabels = {
  Active: "Активен",
  Inactive: "Неактивен",
} as const;

export const objectStatusOptions: Array<{ value: "Active" | "Inactive"; label: string }> = [
  { value: "Active", label: objectStatusLabels.Active },
  { value: "Inactive", label: objectStatusLabels.Inactive },
];

export const guardStatusOptions: Array<{ value: GuardStatus; label: string }> = [
  { value: "Active", label: guardStatusLabels.Active },
  { value: "Sick", label: guardStatusLabels.Sick },
  { value: "OnVacation", label: guardStatusLabels.OnVacation },
  { value: "Inactive", label: guardStatusLabels.Inactive },
  { value: "Dismissed", label: guardStatusLabels.Dismissed },
];

export const guardPositionLabels: Record<GuardPosition, string> = {
  ShiftLead: "Старший смены",
  Guard: "Охранник",
  Curator: "Куратор",
};

export const guardLicenseLabels: Record<GuardLicenseType, string> = {
  None: "Б/У",
  Licensed: "У",
};

export const guardEmploymentLabels: Record<GuardEmploymentType, string> = {
  Employed: "Трудоустроен",
  Unemployed: "Не трудоустроен",
};

export const shiftKindLabels: Record<ShiftKind, string> = {
  Regular: "Обычная",
  Reinforcement: "Усиление",
  RapidResponse: "МП",
  ShiftLead: "Старший смены",
};

export const shiftKindShortLabels: Record<ShiftKind, string> = {
  Regular: "осн",
  Reinforcement: "усил",
  RapidResponse: "мп",
  ShiftLead: "СтМ",
};

export const incidentCategoryLabels: Record<IncidentCategory, string> = {
  FullNoShow: "Полный невыход",
  LeftWork: "Ушёл с работы",
  DrunkOnDuty: "Нарушение на посту",
  Other: "Иное",
};

export const rateUnitLabels: Record<RateUnit, string> = {
  Hour: "За час",
  Shift: "За смену",
};
