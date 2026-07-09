import { z } from "zod";
import type { GuardEmploymentType, GuardLicenseType } from "../scheduling/types";

export function parseOptionalIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

export const optionalIsoDateSchema = z.preprocess(parseOptionalIsoDate, z.string().nullable());

export const licenseGradeSchema = z.preprocess(
  (v) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return null;
    const n = Number(s);
    return Number.isInteger(n) ? n : NaN;
  },
  z.union([z.null(), z.number().int().refine((n) => n === 4 || n === 5 || n === 6, { message: "Разряд 4, 5 или 6" })]),
);

export const guardComplianceFieldsSchema = z.object({
  medicalCommissionPassedOn: optionalIsoDateSchema,
  periodicCheckPassedOn: optionalIsoDateSchema,
  personalCardAssignedOn: optionalIsoDateSchema,
  employedOn: optionalIsoDateSchema,
  licenseGrade: licenseGradeSchema,
  licenseValidUntil: optionalIsoDateSchema,
});

export type GuardComplianceFieldsParsed = z.infer<typeof guardComplianceFieldsSchema>;

export function refineGuardCompliance(
  data: {
    employmentType: GuardEmploymentType;
    licenseType: GuardLicenseType;
    employedOn: string | null;
    licenseGrade: number | null;
    licenseValidUntil: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (data.employmentType === "Employed" && !data.employedOn) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Укажите дату официального трудоустройства",
      path: ["employedOn"],
    });
  }
  if (data.licenseType === "Licensed") {
    if (data.licenseGrade == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите разряд",
        path: ["licenseGrade"],
      });
    }
    if (!data.licenseValidUntil) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите дату окончания действия разряда",
        path: ["licenseValidUntil"],
      });
    }
  }
}
