"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { isValidGuardLicenseForPosition } from "../../lib/scheduling/guard-profile";
import type { GuardLicenseType, GuardPosition } from "../../lib/scheduling/types";
import { isValidRuPhone, normalizeRuPhoneForStorage } from "../../lib/format/phone-ru";
import {
  isValidUniformSizeStored,
  normalizeUniformIssuedFields,
  parseUniformCondition,
  parseUniformSizeFormValue,
  UNIFORM_HEIGHT_MAX,
  UNIFORM_HEIGHT_MIN,
} from "../../lib/format/uniform";
import {
  guardComplianceFieldsSchema,
  optionalIsoDateSchema,
  parseOptionalIsoDate,
  refineGuardCompliance,
} from "../../lib/guards/guard-compliance-schema";
import {
  assignGuardProfilePeriod,
  type AssignGuardProfilePeriodInput,
} from "../../lib/operations/guard-profile-periods-repository";
import {
  assignGuardToObject,
  clearGuardObjects,
  createGuard,
  deleteGuard,
  getGuardDetails,
  isGuardAssignedToObject,
  listGuardObjectAssignments,
  returnGuardToWork,
  setGuardObjects,
  unassignGuardFromObject,
  updateGuardProfile,
  updateGuardStatus,
} from "../../lib/operations/guards-repository";
import type { GuardProfilePeriodKind } from "../../lib/guards/profile-periods";
import { canReturnGuardToWork } from "../../lib/guards/return-to-work";
import {
  revalidateAfterGuardStatusChange,
  revalidateGuardComplianceAlerts,
} from "../../lib/scheduling/revalidate-after-mutation";

const positionSchema = z.enum(["ShiftLead", "Guard", "Curator"]);
const employmentSchema = z.enum(["Employed", "Unemployed"]);
const licenseSchema = z.enum(["None", "Licensed"]);

function parseTraineeUntil(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function licenseForDb(licenseRaw: unknown): GuardLicenseType {
  const parsed = licenseSchema.safeParse(licenseRaw);
  return parsed.success ? parsed.data : "None";
}

const optionalPhoneSchema = z.preprocess(
  (v) => normalizeRuPhoneForStorage(typeof v === "string" ? v : ""),
  z.string().refine((value) => isValidRuPhone(value), {
    message: "Укажите телефон полностью: +7 (XXX) XXX XX XX",
  }),
);

const optionalUniformIntSchema = (min: number, max: number) =>
  z.preprocess((v) => {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s) return null;
    const n = Number(s);
    return Number.isInteger(n) ? n : NaN;
  }, z.union([z.null(), z.number().int().min(min).max(max)]));

const uniformSizeSchema = z.preprocess(
  (v) => parseUniformSizeFormValue(v),
  z.union([
    z.null(),
    z.number().int().refine(isValidUniformSizeStored, {
      message: "Укажите буквенный или числовой размер формы",
    }),
  ]),
);
const uniformHeightSchema = optionalUniformIntSchema(UNIFORM_HEIGHT_MIN, UNIFORM_HEIGHT_MAX);

const assignObjectIdsSchema = z.preprocess(
  (val) => {
    if (val == null) return [];
    const list = Array.isArray(val) ? val : [val];
    return list.map((item) => String(item).trim()).filter(Boolean);
  },
  z.array(z.string().uuid()),
);

const createGuardSchema = z
  .object({
    firstName: z.string().trim().min(1),
    middleName: z.string().trim().optional().default(""),
    lastName: z.string().trim().min(1),
    phone: optionalPhoneSchema,
    contactPhone: optionalPhoneSchema,
    uniformSize: uniformSizeSchema,
    uniformHeight: uniformHeightSchema,
    status: z.enum(["Active", "Sick", "OnVacation", "Inactive", "Dismissed"]),
    dismissedOn: optionalIsoDateSchema,
    position: positionSchema,
    licenseType: licenseSchema.optional(),
    employmentType: employmentSchema,
    traineeUntil: z.string().optional(),
    assignObjectIds: assignObjectIdsSchema,
    birthDate: optionalIsoDateSchema,
  })
  .merge(guardComplianceFieldsSchema)
  .superRefine((data, ctx) => {
    const lic = licenseForDb(data.licenseType);
    if (!isValidGuardLicenseForPosition(data.position, lic)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Некорректное удостоверение для должности",
        path: ["licenseType"],
      });
    }
    refineGuardCompliance(
      {
        employmentType: data.employmentType,
        licenseType: lic,
        employedOn: data.employedOn,
        licenseGrade: data.licenseGrade,
        licenseValidUntil: data.licenseValidUntil,
      },
      ctx,
    );
    if (data.status === "Dismissed" && !data.dismissedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите дату увольнения",
        path: ["dismissedOn"],
      });
    }
  });

export type CreateGuardResult = { ok: true } | { ok: false; error: string };

export async function createGuardAction(formData: FormData): Promise<CreateGuardResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "guards:manage");

    const raw = {
      firstName: formData.get("firstName"),
      middleName: formData.get("middleName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      contactPhone: formData.get("contactPhone"),
      uniformSize: formData.get("uniformSize"),
      uniformHeight: formData.get("uniformHeight"),
      status: formData.get("status"),
      dismissedOn: formData.get("dismissedOn"),
      position: formData.get("position"),
      licenseType: formData.get("licenseType") || undefined,
      employmentType: formData.get("employmentType"),
      traineeUntil: formData.get("traineeUntil"),
      assignObjectIds: (() => {
        const many = formData.getAll("assignObjectIds").map((v) => String(v).trim()).filter(Boolean);
        if (many.length > 0) return many;
        const one = formData.get("assignObjectId") ?? formData.get("objectId");
        const s = one != null ? String(one).trim() : "";
        return s ? [s] : [];
      })(),
      medicalCommissionPassedOn: formData.get("medicalCommissionPassedOn"),
      periodicCheckPassedOn: formData.get("periodicCheckPassedOn"),
      personalCardAssignedOn: formData.get("personalCardAssignedOn"),
      employedOn: formData.get("employedOn"),
      licenseGrade: formData.get("licenseGrade"),
      licenseValidUntil: formData.get("licenseValidUntil"),
      birthDate: formData.get("birthDate"),
    };

    const input = createGuardSchema.parse(raw);
    const position = input.position;
    const isTrainee = formData.get("isTrainee") === "on";
    const hasCar = formData.get("hasCar") === "on";
    const traineeUntil = isTrainee ? parseTraineeUntil(input.traineeUntil) : null;

    const uniformIssued = formData.get("uniformIssued") === "on";
    const uniformIssuedOn = formData.get("uniformIssuedOn");
    const uniformCondition = formData.get("uniformCondition");
    const uniformNote = formData.get("uniformNote");

    let issuedFields;
    try {
      issuedFields = normalizeUniformIssuedFields({
        issued: uniformIssued,
        issuedOn: String(uniformIssuedOn ?? ""),
        condition: parseUniformCondition(uniformCondition),
        note: String(uniformNote ?? ""),
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Ошибка данных формы" };
    }

    try {
      await createGuard({
        firstName: input.firstName,
        middleName: input.middleName,
        lastName: input.lastName,
        status: input.status,
        dismissedOn: input.status === "Dismissed" ? input.dismissedOn : null,
        phone: input.phone,
        contactPhone: input.contactPhone,
        uniformSize: input.uniformSize,
        uniformHeight: input.uniformHeight,
        uniformIssued: issuedFields.uniformIssued,
        uniformIssuedOn: issuedFields.uniformIssuedOn,
        uniformCondition: issuedFields.uniformCondition,
        uniformNote: issuedFields.uniformNote,
        position,
        licenseType: licenseForDb(input.licenseType),
        employmentType: input.employmentType,
        isTrainee,
        traineeUntil,
        hasCar,
        birthDate: input.birthDate,
        objectIds: input.assignObjectIds,
        compliance: {
          medicalCommissionPassedOn: input.medicalCommissionPassedOn,
          periodicCheckPassedOn: input.periodicCheckPassedOn,
          personalCardAssignedOn: input.personalCardAssignedOn,
          employedOn: input.employedOn,
          licenseGrade: input.licenseGrade,
          licenseValidUntil: input.licenseValidUntil,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return {
          ok: false,
          error: `Охранник «${input.lastName} ${input.firstName}» уже есть в реестре`,
        };
      }
      throw error;
    }

    revalidatePath("/guards");
    revalidateTag("timesheet", undefined as any);
    revalidateGuardComplianceAlerts();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: formatZodError(error) };
    }
    if (error instanceof Error && error.message) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Не удалось создать охранника" };
  }
}

/** Признак нарушения уникального индекса PostgreSQL (код 23505). */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

export type UpdateGuardProfileResult = { ok: true } | { ok: false; error: string };

const updateStatusSchema = z
  .object({
    guardId: z.string().uuid(),
    status: z.enum(["Active", "Sick", "OnVacation", "Inactive", "Dismissed"]),
    dismissedOn: optionalIsoDateSchema,
  })
  .superRefine((data, ctx) => {
    if (data.status === "Dismissed" && !data.dismissedOn) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Укажите дату увольнения",
        path: ["dismissedOn"],
      });
    }
  });

export type UpdateGuardStatusResult =
  | { ok: true; status: "Active" | "Sick" | "OnVacation" | "Inactive" | "Dismissed" }
  | { ok: false; error: string };

export async function updateGuardStatusAction(formData: FormData): Promise<UpdateGuardStatusResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "guards:manage");

    const input = updateStatusSchema.parse({
      guardId: formData.get("guardId"),
      status: formData.get("status"),
      dismissedOn: formData.get("dismissedOn"),
    });

    const existing = await getGuardDetails(input.guardId);
    if (!existing) {
      return { ok: false, error: "Охранник не найден" };
    }
    if (canReturnGuardToWork(existing.status) && input.status !== "Dismissed") {
      return {
        ok: false,
        error: "Для уволенного используйте «Вернуть в работу»",
      };
    }

    await updateGuardStatus(
      input.guardId,
      input.status,
      input.status === "Dismissed" ? input.dismissedOn : null,
    );
    revalidateAfterGuardStatusChange(input.guardId);
    return { ok: true, status: input.status };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: formatZodError(error) };
    }
    if (error instanceof Error && error.message) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Не удалось обновить статус" };
  }
}

const returnToWorkSchema = z.object({
  guardId: z.string().uuid(),
  returnedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату возврата"),
});

export type ReturnGuardToWorkResult = { ok: true } | { ok: false; error: string };

export async function returnGuardToWorkAction(formData: FormData): Promise<ReturnGuardToWorkResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "guards:manage");

    const input = returnToWorkSchema.parse({
      guardId: formData.get("guardId"),
      returnedOn: formData.get("returnedOn"),
    });

    await returnGuardToWork({
      guardId: input.guardId,
      returnedOn: input.returnedOn,
      createdBy: session.user.id,
    });
    revalidateAfterGuardStatusChange(input.guardId);
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: formatZodError(error) };
    }
    if (error instanceof Error && error.message) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Не удалось вернуть охранника в работу" };
  }
}

const objectAssignmentSchema = z.object({
  guardId: z.string().uuid(),
  objectId: z.string().uuid(),
});

export async function assignGuardObjectAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const input = objectAssignmentSchema.parse({
    guardId: formData.get("guardId"),
    objectId: formData.get("objectId"),
  });

  await assignGuardToObject(input.guardId, input.objectId);
  revalidatePath("/guards");
  revalidatePath(`/guards/${input.guardId}`);
  redirect("/guards");
}

export async function unassignGuardObjectAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const input = z.object({ guardId: z.string().uuid() }).parse({
    guardId: formData.get("guardId"),
  });

  await clearGuardObjects(input.guardId);
  revalidatePath("/guards");
  revalidatePath(`/guards/${input.guardId}`);
  redirect("/guards");
}

const setGuardObjectsSchema = z.object({
  guardId: z.string().uuid(),
  objectIds: assignObjectIdsSchema,
});

export async function setGuardObjectsAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const input = setGuardObjectsSchema.parse({
    guardId: formData.get("guardId"),
    objectIds: formData.getAll("objectIds"),
  });

  await setGuardObjects(input.guardId, input.objectIds);
  revalidatePath("/guards");
  revalidatePath(`/guards/${input.guardId}`);
  redirect("/guards");
}

export type GuardObjectAssignmentsResult = {
  assigned: boolean;
  objectIds: string[];
  objectNames: string[];
};

export async function toggleGuardObjectAssignment(
  guardId: string,
  objectId: string,
): Promise<GuardObjectAssignmentsResult> {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const wasAssigned = await isGuardAssignedToObject(guardId, objectId);
  if (wasAssigned) {
    await unassignGuardFromObject(guardId, objectId);
  } else {
    await assignGuardToObject(guardId, objectId);
  }
  const { objectIds, objectNames } = await listGuardObjectAssignments(guardId);
  revalidatePath("/guards");
  revalidatePath(`/guards/${guardId}`);
  return { assigned: !wasAssigned, objectIds, objectNames };
}

export async function clearGuardObjectAssignments(guardId: string): Promise<GuardObjectAssignmentsResult> {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  await clearGuardObjects(guardId);
  revalidatePath("/guards");
  revalidatePath(`/guards/${guardId}`);
  return { assigned: false, objectIds: [], objectNames: [] };
}

const updateGuardProfileSchema = z
  .object({
    guardId: z.string().uuid(),
    firstName: z.string().trim().min(1),
    middleName: z.string().trim().optional().default(""),
    lastName: z.string().trim().min(1),
    phone: optionalPhoneSchema,
    contactPhone: optionalPhoneSchema,
    uniformSize: uniformSizeSchema,
    uniformHeight: uniformHeightSchema,
  })
  .merge(guardComplianceFieldsSchema)
  .extend({
    birthDate: optionalIsoDateSchema,
  });

const assignProfilePeriodSchema = z.object({
  guardId: z.string().uuid(),
  periodKind: z.enum(["position", "employment", "trainee", "license"]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  effectiveTo: z
    .string()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  position: positionSchema.optional(),
  employmentType: employmentSchema.optional(),
  licenseType: licenseSchema.optional(),
  note: z.string().optional(),
  confirmOverlap: z.literal("on").optional(),
});

export async function deleteGuardAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const guardId = z.string().uuid().parse(formData.get("guardId"));
  await deleteGuard(guardId);
  revalidatePath("/guards");
  revalidatePath(`/guards/${guardId}`);
  revalidateTag("timesheet", undefined as any);
  revalidateGuardComplianceAlerts();
  redirect("/guards");
}

export async function updateGuardProfileAction(formData: FormData): Promise<UpdateGuardProfileResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "guards:manage");

    const raw = {
      guardId: formData.get("guardId"),
      firstName: formData.get("firstName"),
      middleName: formData.get("middleName"),
      lastName: formData.get("lastName"),
      phone: formData.get("phone"),
      contactPhone: formData.get("contactPhone"),
      uniformSize: formData.get("uniformSize"),
      uniformHeight: formData.get("uniformHeight"),
      medicalCommissionPassedOn: formData.get("medicalCommissionPassedOn"),
      periodicCheckPassedOn: formData.get("periodicCheckPassedOn"),
      personalCardAssignedOn: formData.get("personalCardAssignedOn"),
      employedOn: formData.get("employedOn"),
      licenseGrade: formData.get("licenseGrade"),
      licenseValidUntil: formData.get("licenseValidUntil"),
      birthDate: formData.get("birthDate"),
    };

    const guardId = z.string().uuid().parse(raw.guardId);
    const existing = await getGuardDetails(guardId);
    if (!existing) {
      return { ok: false, error: "Охранник не найден" };
    }

    const employmentType = employmentSchema.parse(
      formData.get("employmentType") ?? existing.employmentType,
    );
    const licenseType = licenseForDb(formData.get("licenseType") ?? existing.licenseType);

    const rawWithExistingCompliance = {
      ...raw,
      employedOn:
        parseOptionalIsoDate(formData.get("employedOn")) ?? existing.employedOn ?? "",
      licenseValidUntil:
        parseOptionalIsoDate(formData.get("licenseValidUntil")) ?? existing.licenseValidUntil ?? "",
      licenseGrade: (() => {
        const fromForm = String(formData.get("licenseGrade") ?? "").trim();
        if (fromForm) return fromForm;
        if (existing.licenseGrade != null) return String(existing.licenseGrade);
        return "";
      })(),
    };

    const input = updateGuardProfileSchema
      .superRefine((data, ctx) => {
        refineGuardCompliance(
          {
            employmentType,
            licenseType,
            employedOn: data.employedOn,
            licenseGrade: data.licenseGrade,
            licenseValidUntil: data.licenseValidUntil,
          },
          ctx,
        );
      })
      .parse(rawWithExistingCompliance);

    const hasCar = formData.get("hasCar") === "on";

    const uniformIssued = formData.get("uniformIssued") === "on";
    const uniformIssuedOn = formData.get("uniformIssuedOn");
    const uniformCondition = formData.get("uniformCondition");
    const uniformNote = formData.get("uniformNote");

    let issuedFields;
    try {
      issuedFields = normalizeUniformIssuedFields({
        issued: uniformIssued,
        issuedOn: String(uniformIssuedOn ?? ""),
        condition: parseUniformCondition(uniformCondition),
        note: String(uniformNote ?? ""),
      });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Ошибка данных формы" };
    }

    await updateGuardProfile({
      guardId: input.guardId,
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      phone: input.phone,
      contactPhone: input.contactPhone,
      uniformSize: input.uniformSize,
      uniformHeight: input.uniformHeight,
      uniformIssued: issuedFields.uniformIssued,
      uniformIssuedOn: issuedFields.uniformIssuedOn,
      uniformCondition: issuedFields.uniformCondition,
      uniformNote: issuedFields.uniformNote,
      position: existing.position,
      licenseType,
      employmentType,
      isTrainee: existing.isTrainee,
      traineeUntil: existing.traineeUntil,
      hasCar,
      birthDate: input.birthDate,
      compliance: {
        medicalCommissionPassedOn: input.medicalCommissionPassedOn,
        periodicCheckPassedOn: input.periodicCheckPassedOn,
        personalCardAssignedOn: input.personalCardAssignedOn,
        employedOn: input.employedOn,
        licenseGrade: input.licenseGrade,
        licenseValidUntil: input.licenseValidUntil,
      },
    });
    const { backfillTimesheetEntriesForGuardSafe } = await import(
      "../../lib/accounting/sync-timesheet-entry"
    );
    await backfillTimesheetEntriesForGuardSafe(input.guardId);
    revalidatePath("/guards");
    revalidatePath(`/guards/${input.guardId}`);
    revalidateTag("timesheet", "max");
    revalidateGuardComplianceAlerts();
    return { ok: true };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { ok: false, error: formatZodError(error) };
    }
    if (error instanceof Error && error.message) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Не удалось сохранить профиль. Попробуйте ещё раз." };
  }
}

export async function assignGuardProfilePeriodAction(
  formData: FormData,
): Promise<{ ok: boolean; warnings: string[] }> {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const parsed = assignProfilePeriodSchema.parse({
    guardId: formData.get("guardId"),
    periodKind: formData.get("periodKind"),
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
    position: formData.get("position") || undefined,
    employmentType: formData.get("employmentType") || undefined,
    licenseType: formData.get("licenseType") || undefined,
    note: formData.get("note") || undefined,
    confirmOverlap: formData.get("confirmOverlap") === "on" ? "on" : undefined,
  });

  const isTrainee = formData.get("isTrainee") === "on";
  const traineeUntil = parseTraineeUntil(formData.get("traineeUntil"));

  const payload: AssignGuardProfilePeriodInput = {
    guardId: parsed.guardId,
    periodKind: parsed.periodKind as GuardProfilePeriodKind,
    effectiveFrom: parsed.effectiveFrom,
    effectiveTo: parsed.effectiveTo,
    note: parsed.note,
    createdBy: session.user.id,
    confirmOverlap: parsed.confirmOverlap === "on",
  };

  if (parsed.periodKind === "position") {
    if (!parsed.position) throw new Error("Укажите должность");
    payload.position = parsed.position;
  }
  if (parsed.periodKind === "employment") {
    if (!parsed.employmentType) throw new Error("Укажите трудоустройство");
    payload.employmentType = parsed.employmentType;
  }
  if (parsed.periodKind === "license") {
    payload.licenseType = licenseForDb(parsed.licenseType);
  }
  if (parsed.periodKind === "trainee") {
    payload.isTrainee = isTrainee;
    payload.traineeUntil = isTrainee ? traineeUntil : null;
  }

  const result = await assignGuardProfilePeriod(payload);
  if (result.warnings.length > 0 && !parsed.confirmOverlap) {
    return { ok: false, warnings: result.warnings };
  }

  const { backfillTimesheetEntriesForGuardSafe } = await import("../../lib/accounting/sync-timesheet-entry");
  await backfillTimesheetEntriesForGuardSafe(parsed.guardId);

  revalidatePath("/guards");
  revalidatePath(`/guards/${parsed.guardId}`);
  revalidateTag("timesheet", undefined as any);
  return { ok: true, warnings: result.warnings };
}
