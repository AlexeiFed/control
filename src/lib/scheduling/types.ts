export type GuardStatus = "Active" | "Sick" | "OnVacation" | "Inactive" | "Dismissed";

export type GuardPosition = "ShiftLead" | "Guard" | "Curator";
export type GuardLicenseType = "None" | "Licensed";
export type GuardEmploymentType = "Employed" | "Unemployed";
export type ShiftKind = "Regular" | "Reinforcement" | "RapidResponse" | "ShiftLead";

/** Устаревший `ReinforcementDay` в БД приводим к общему усилению. */
export function normalizeShiftKindFromDb(raw: string | null | undefined): ShiftKind {
  if (raw === "ReinforcementDay") return "Reinforcement";
  if (raw === "Regular" || raw === "Reinforcement" || raw === "RapidResponse" || raw === "ShiftLead") return raw;
  return "Regular";
}

export type IncidentCategory = "FullNoShow" | "LeftWork" | "DrunkOnDuty" | "Other";

export type RateUnit = "Hour" | "Shift";

export type Guard = {
  id: string;
  name: string;
  status: GuardStatus;
  phone: string;
  position: GuardPosition;
  /** `None` (Б/У) или `Licensed` (У) для любой должности. */
  licenseType: GuardLicenseType | null;
  employmentType: GuardEmploymentType;
  isTrainee: boolean;
  traineeUntil: Date | null;
  hasCar: boolean;
};

export type SecurityObject = {
  id: string;
  name: string;
  address: string;
  status: "Active" | "Inactive";
  /** HH:mm — начало операционных суток (сутки anchor→anchor). */
  operationalDayStartTime: string;
};

export type Shift = {
  id: string;
  guardId: string;
  objectId: string;
  postId?: string | null;
  startsAt: Date;
  endsAt: Date;
  shiftKind: ShiftKind;
  manualClientRateCents: number | null;
  manualGuardRateCents: number | null;
  manualRateUnit: RateUnit | null;
  manualRateReason: string;
  isNoShow: boolean;
  incidentCategory: IncidentCategory | null;
  incidentComment: string;
  incidentWorkedUntilAt: Date | null;
  incidentRecordedAt: Date | null;
  replacedByShiftId: string | null;
  /** Явно выбранное правило ставки (нестандартный интервал). */
  selectedRateRuleId: string | null;
};

export type ShiftLog = {
  id: string;
  shiftId: string;
  authorUserId: string;
  authorName?: string;
  objectName?: string;
  guardName?: string;
  shiftStartsAt?: Date;
  shiftEndsAt?: Date;
  createdAt: Date;
  note: string;
  incidentLevel: "None" | "Info" | "Warning" | "Critical";
};

/** Минимальный профиль охранника для графика до полной синхронизации с БД. */
export function createSchedulerGuard(base: { id: string; name: string; status: GuardStatus }): Guard {
  return {
    ...base,
    phone: "",
    position: "Guard",
    licenseType: "None",
    employmentType: "Unemployed",
    isTrainee: false,
    traineeUntil: null,
    hasCar: false,
  };
}

export function createSchedulerShift(
  base: Pick<Shift, "id" | "guardId" | "objectId" | "startsAt" | "endsAt"> & { postId?: string | null },
): Shift {
  return {
    ...base,
    postId: base.postId ?? null,
    shiftKind: "Regular",
    manualClientRateCents: null,
    manualGuardRateCents: null,
    manualRateUnit: null,
    manualRateReason: "",
    isNoShow: false,
    incidentCategory: null,
    incidentComment: "",
    incidentWorkedUntilAt: null,
    incidentRecordedAt: null,
    replacedByShiftId: null,
    selectedRateRuleId: null,
  };
}
