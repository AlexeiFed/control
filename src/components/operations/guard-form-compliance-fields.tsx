"use client";

import type { GuardEmploymentType, GuardLicenseType } from "../../lib/scheduling/types";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
} from "../../lib/operations/status-labels";

const licenseGradeOptions = [4, 5, 6] as const;

type GuardFormComplianceFieldsProps = {
  employmentType: GuardEmploymentType;
  onEmploymentTypeChange: (value: GuardEmploymentType) => void;
  licenseType: GuardLicenseType;
  onLicenseTypeChange: (value: GuardLicenseType) => void;
  defaults?: {
    medicalCommissionPassedOn?: string | null;
    periodicCheckPassedOn?: string | null;
    personalCardAssignedOn?: string | null;
    employedOn?: string | null;
    licenseGrade?: number | null;
    licenseValidUntil?: string | null;
  };
  /** Компактная сетка формы создания в реестре. */
  compact?: boolean;
};

const fieldClass =
  "rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary";
const compactFieldClass =
  "h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary";

export function GuardFormComplianceFields({
  employmentType,
  onEmploymentTypeChange,
  licenseType,
  onLicenseTypeChange,
  defaults,
  compact = false,
}: GuardFormComplianceFieldsProps) {
  const inputClass = compact ? compactFieldClass : fieldClass;
  const labelClass = compact
    ? "flex h-12 flex-col justify-center gap-0.5 text-xs text-app-muted"
    : "flex flex-col gap-1 text-sm";

  return (
    <>
      <label className={labelClass}>
        <span className="text-app-muted">Трудоустройство</span>
        <select
          name="employmentType"
          value={employmentType}
          onChange={(e) => onEmploymentTypeChange(e.target.value as GuardEmploymentType)}
          className={inputClass}
        >
          <option value="Employed">{guardEmploymentLabels.Employed}</option>
          <option value="Unemployed">{guardEmploymentLabels.Unemployed}</option>
        </select>
      </label>
      {employmentType === "Employed" ? (
        <label className={labelClass}>
          <span className="text-app-muted">Дата офиц. трудоустройства</span>
          <input
            type="date"
            name="employedOn"
            required
            defaultValue={defaults?.employedOn ?? ""}
            className={inputClass}
          />
        </label>
      ) : null}
      <label className={labelClass}>
        <span className="text-app-muted">Удостоверение</span>
        <select
          name="licenseType"
          value={licenseType}
          onChange={(e) => onLicenseTypeChange(e.target.value as GuardLicenseType)}
          className={inputClass}
        >
          <option value="None">{guardLicenseLabels.None}</option>
          <option value="Licensed">{guardLicenseLabels.Licensed}</option>
        </select>
      </label>
      {licenseType === "Licensed" ? (
        <>
          <label className={labelClass}>
            <span className="text-app-muted">Разряд</span>
            <select
              name="licenseGrade"
              required
              defaultValue={defaults?.licenseGrade != null ? String(defaults.licenseGrade) : ""}
              className={inputClass}
            >
              <option value="" disabled>
                —
              </option>
              {licenseGradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            <span className="text-app-muted">Разряд действует до</span>
            <input
              type="date"
              name="licenseValidUntil"
              required
              defaultValue={defaults?.licenseValidUntil ?? ""}
              className={inputClass}
            />
          </label>
        </>
      ) : null}
      <label className={labelClass}>
        <span className="text-app-muted">Медкомиссия</span>
        <input
          type="date"
          name="medicalCommissionPassedOn"
          defaultValue={defaults?.medicalCommissionPassedOn ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className="text-app-muted">Периодическая проверка</span>
        <input
          type="date"
          name="periodicCheckPassedOn"
          defaultValue={defaults?.periodicCheckPassedOn ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        <span className="text-app-muted">Личная карточка</span>
        <input
          type="date"
          name="personalCardAssignedOn"
          defaultValue={defaults?.personalCardAssignedOn ?? ""}
          className={inputClass}
        />
      </label>
    </>
  );
}
