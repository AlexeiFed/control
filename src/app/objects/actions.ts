"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { revalidateAfterShiftMutation } from "../../lib/scheduling/revalidate-after-mutation";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { addObjectHoliday, deleteObjectHoliday } from "../../lib/operations/object-holidays-repository";
import { upsertObjectMonthlySetting } from "../../lib/operations/object-monthly-settings-repository";
import {
  createObject,
  deleteObject,
  getObject,
  setObjectGuards,
  updateObject,
  updateObjectOperationalDayStartTime,
  updateObjectStatus,
  updateObjectTimesheetApproval,
} from "../../lib/operations/objects-repository";
import type { CreateObjectRateRuleInput } from "../../lib/operations/object-rate-rules-repository";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import {
  createObjectRateRule,
  deleteObjectRateRule,
  getObjectRateRule,
  reorderObjectRateRules,
  saveObjectRateRuleWithVersioning,
  updateObjectRateRule,
} from "../../lib/operations/object-rate-rules-repository";
import {
  listShiftTemplatesForObjectIds,
  replaceShiftTemplatesForObject,
} from "../../lib/operations/shift-templates-repository";
import { activeShiftsSequence, inheritZeroTemplateCounts } from "../../lib/scheduling/object-shift-templates";
import { getPreviousCivilDate } from "../../lib/scheduling/shift-template-history";
import type { GuardEmploymentType, GuardLicenseType, GuardPosition, RateUnit, ShiftKind } from "../../lib/scheduling/types";

import {
  createObjectPost,
  deleteObjectPost,
  updateObjectPost,
} from "../../lib/operations/object-posts-repository";
import { replaceMonthlyPostGuards } from "../../lib/operations/object-monthly-post-guards-repository";

const createObjectSchema = z.object({
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  description: z.string().trim().default(""),
  status: z.enum(["Active", "Inactive"]),
});

const updateObjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  description: z.string().trim().default(""),
  status: z.enum(["Active", "Inactive"]),
});

export async function updateObjectAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const input = updateObjectSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    address: formData.get("address"),
    description: formData.get("description"),
    status: formData.get("status"),
  });

  const { id, ...data } = input;
  await updateObject(id, data);

  revalidatePath("/objects");
  revalidatePath(`/objects/${id}`);
  revalidatePath("/accounting/timesheet");
  revalidateTag("timesheet", undefined as any);
  redirect(`/objects/${id}`);
}

const updateObjectTimesheetApprovalSchema = z.object({
  objectId: z.string().uuid(),
  directorName: z.string().trim().max(200).default(""),
  directorRole: z.string().trim().max(300).default(""),
  siteManagerEnabled: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export type UpdateObjectTimesheetApprovalResult = { ok: true } | { ok: false; error: string };

export async function updateObjectTimesheetApprovalAction(
  formData: FormData,
): Promise<UpdateObjectTimesheetApprovalResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "objects:manage");

    const input = updateObjectTimesheetApprovalSchema.parse({
      objectId: formData.get("objectId"),
      directorName: formData.get("directorName") ?? "",
      directorRole: formData.get("directorRole") ?? "",
      siteManagerEnabled: formData.get("siteManagerEnabled") ?? "false",
    });

    await updateObjectTimesheetApproval(input.objectId, {
      directorName: input.directorName,
      directorRole: input.directorRole,
      siteManagerEnabled: input.siteManagerEnabled,
    });

    revalidatePath("/objects");
    revalidatePath(`/objects/${input.objectId}`);
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Некорректные данные подписей табеля"
        : error instanceof Error
          ? error.message
          : "Не удалось сохранить подписи табеля";
    return { ok: false, error: message };
  }
}

const updateOperationalDaySchema = z.object({
  objectId: z.string().uuid(),
  operationalDayStartTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export type UpdateOperationalDayResult = { ok: true } | { ok: false; error: string };

export async function updateObjectOperationalDayStartTimeAction(
  formData: FormData,
): Promise<UpdateOperationalDayResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "objects:manage");

    const input = updateOperationalDaySchema.parse({
      objectId: formData.get("objectId"),
      operationalDayStartTime: formData.get("operationalDayStartTime"),
    });

    await updateObjectOperationalDayStartTime(input.objectId, input.operationalDayStartTime);
    revalidatePath("/objects");
    revalidatePath(`/objects/${input.objectId}`);
    revalidatePath("/scheduler");
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Некорректное время операционных суток"
        : error instanceof Error
          ? error.message
          : "Не удалось сохранить операционные сутки";
    return { ok: false, error: message };
  }
}

export async function deleteObjectAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const objectId = z.string().uuid().parse(formData.get("objectId"));
  await deleteObject(objectId);
  revalidatePath("/objects");
  revalidatePath("/scheduler");
  revalidateTag("timesheet", undefined as any);
  redirect("/objects");
}

export async function createObjectAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  await createObject(
    createObjectSchema.parse({
      name: formData.get("name"),
      address: formData.get("address"),
      status: formData.get("status"),
    }),
  );

  revalidatePath("/objects");
  redirect("/objects");
}

const updateObjectStatusSchema = z.object({
  objectId: z.string().uuid(),
  status: z.enum(["Active", "Inactive"]),
});

export async function updateObjectStatusAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const input = updateObjectStatusSchema.parse({
    objectId: formData.get("objectId"),
    status: formData.get("status"),
  });

  await updateObjectStatus(input.objectId, input.status);
  revalidatePath("/objects");
  redirect("/objects");
}

const setObjectGuardsSchema = z.object({
  objectId: z.string().uuid(),
  guardIds: z.string().default(""),
});

export async function setObjectGuardsAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const input = setObjectGuardsSchema.parse({
    objectId: formData.get("objectId"),
    guardIds: formData.get("guardIds"),
  });

  const guardIds = input.guardIds
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  await setObjectGuards(input.objectId, guardIds);
  revalidatePath("/objects");
  revalidatePath(`/objects/${input.objectId}`);
}

const saveShiftTemplatesSchema = z.object({
  objectId: z.string().uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  d1: z.coerce.number().int().min(0).max(24),
  d2: z.coerce.number().int().min(0).max(24),
  d3: z.coerce.number().int().min(0).max(24),
  d4: z.coerce.number().int().min(0).max(24),
  d5: z.coerce.number().int().min(0).max(24),
  d6: z.coerce.number().int().min(0).max(24),
  d7: z.coerce.number().int().min(0).max(24),
  h1: z.coerce.number().int().min(1).max(24).default(24),
  h2: z.coerce.number().int().min(1).max(24).default(24),
  h3: z.coerce.number().int().min(1).max(24).default(24),
  h4: z.coerce.number().int().min(1).max(24).default(24),
  h5: z.coerce.number().int().min(1).max(24).default(24),
  h6: z.coerce.number().int().min(1).max(24).default(24),
  h7: z.coerce.number().int().min(1).max(24).default(24),
  r1: z.coerce.number().int().min(0).max(24).default(0),
  r2: z.coerce.number().int().min(0).max(24).default(0),
  r3: z.coerce.number().int().min(0).max(24).default(0),
  r4: z.coerce.number().int().min(0).max(24).default(0),
  r5: z.coerce.number().int().min(0).max(24).default(0),
  r6: z.coerce.number().int().min(0).max(24).default(0),
  r7: z.coerce.number().int().min(0).max(24).default(0),
  mp1: z.coerce.number().int().min(0).max(24).default(0),
  mp2: z.coerce.number().int().min(0).max(24).default(0),
  mp3: z.coerce.number().int().min(0).max(24).default(0),
  mp4: z.coerce.number().int().min(0).max(24).default(0),
  mp5: z.coerce.number().int().min(0).max(24).default(0),
  mp6: z.coerce.number().int().min(0).max(24).default(0),
  mp7: z.coerce.number().int().min(0).max(24).default(0),
  mph1: z.coerce.number().int().min(1).max(24).default(24),
  mph2: z.coerce.number().int().min(1).max(24).default(24),
  mph3: z.coerce.number().int().min(1).max(24).default(24),
  mph4: z.coerce.number().int().min(1).max(24).default(24),
  mph5: z.coerce.number().int().min(1).max(24).default(24),
  mph6: z.coerce.number().int().min(1).max(24).default(24),
  mph7: z.coerce.number().int().min(1).max(24).default(24),
  rh1: z.coerce.number().int().min(1).max(24).default(24),
  rh2: z.coerce.number().int().min(1).max(24).default(24),
  rh3: z.coerce.number().int().min(1).max(24).default(24),
  rh4: z.coerce.number().int().min(1).max(24).default(24),
  rh5: z.coerce.number().int().min(1).max(24).default(24),
  rh6: z.coerce.number().int().min(1).max(24).default(24),
  rh7: z.coerce.number().int().min(1).max(24).default(24),
  stm1: z.coerce.number().int().min(0).max(24).default(0),
  stm2: z.coerce.number().int().min(0).max(24).default(0),
  stm3: z.coerce.number().int().min(0).max(24).default(0),
  stm4: z.coerce.number().int().min(0).max(24).default(0),
  stm5: z.coerce.number().int().min(0).max(24).default(0),
  stm6: z.coerce.number().int().min(0).max(24).default(0),
  stm7: z.coerce.number().int().min(0).max(24).default(0),
  stmh1: z.coerce.number().int().min(1).max(24).default(24),
  stmh2: z.coerce.number().int().min(1).max(24).default(24),
  stmh3: z.coerce.number().int().min(1).max(24).default(24),
  stmh4: z.coerce.number().int().min(1).max(24).default(24),
  stmh5: z.coerce.number().int().min(1).max(24).default(24),
  stmh6: z.coerce.number().int().min(1).max(24).default(24),
  stmh7: z.coerce.number().int().min(1).max(24).default(24),
  postId: z
    .preprocess((v) => (v == null || String(v).trim() === "" ? undefined : String(v).trim()), z.string().uuid().optional()),
});

/** Сменность накануне effectiveFrom — база для новой версии шаблона. */
export async function loadTemplateEditBaselineAction(
  objectId: string,
  effectiveFrom: string,
  postId?: string,
) {
  const session = await requireSession();
  assertPermission(session.user.role, "scheduleTemplates:manage");
  if (!z.string().uuid().safeParse(objectId).success) {
    throw new Error("Некорректный объект");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)) {
    throw new Error("Некорректная дата начала сменности");
  }
  if (postId && !z.string().uuid().safeParse(postId).success) {
    throw new Error("Некорректный пост");
  }
  const templates = await listShiftTemplatesForObjectIds([objectId]);
  return activeShiftsSequence(
    templates,
    objectId,
    getPreviousCivilDate(effectiveFrom),
    postId ?? null,
  );
}

export async function saveShiftTemplatesAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "scheduleTemplates:manage");

  const noRedirect = formData.get("noRedirect")?.toString() === "true";

  let input: z.infer<typeof saveShiftTemplatesSchema>;
  try {
    input = saveShiftTemplatesSchema.parse({
    objectId: formData.get("objectId"),
    effectiveFrom: formData.get("effectiveFrom"),
    d1: formData.get("d1"),
    d2: formData.get("d2"),
    d3: formData.get("d3"),
    d4: formData.get("d4"),
    d5: formData.get("d5"),
    d6: formData.get("d6"),
    d7: formData.get("d7"),
    h1: formData.get("h1") ?? 24,
    h2: formData.get("h2") ?? 24,
    h3: formData.get("h3") ?? 24,
    h4: formData.get("h4") ?? 24,
    h5: formData.get("h5") ?? 24,
    h6: formData.get("h6") ?? 24,
    h7: formData.get("h7") ?? 24,
    r1: formData.get("r1") ?? 0,
    r2: formData.get("r2") ?? 0,
    r3: formData.get("r3") ?? 0,
    r4: formData.get("r4") ?? 0,
    r5: formData.get("r5") ?? 0,
    r6: formData.get("r6") ?? 0,
    r7: formData.get("r7") ?? 0,
    mp1: formData.get("mp1") ?? 0,
    mp2: formData.get("mp2") ?? 0,
    mp3: formData.get("mp3") ?? 0,
    mp4: formData.get("mp4") ?? 0,
    mp5: formData.get("mp5") ?? 0,
    mp6: formData.get("mp6") ?? 0,
    mp7: formData.get("mp7") ?? 0,
    mph1: formData.get("mph1") ?? 24,
    mph2: formData.get("mph2") ?? 24,
    mph3: formData.get("mph3") ?? 24,
    mph4: formData.get("mph4") ?? 24,
    mph5: formData.get("mph5") ?? 24,
    mph6: formData.get("mph6") ?? 24,
    mph7: formData.get("mph7") ?? 24,
    rh1: formData.get("rh1") ?? 24,
    rh2: formData.get("rh2") ?? 24,
    rh3: formData.get("rh3") ?? 24,
    rh4: formData.get("rh4") ?? 24,
    rh5: formData.get("rh5") ?? 24,
    rh6: formData.get("rh6") ?? 24,
    rh7: formData.get("rh7") ?? 24,
    stm1: formData.get("stm1") ?? 0,
    stm2: formData.get("stm2") ?? 0,
    stm3: formData.get("stm3") ?? 0,
    stm4: formData.get("stm4") ?? 0,
    stm5: formData.get("stm5") ?? 0,
    stm6: formData.get("stm6") ?? 0,
    stm7: formData.get("stm7") ?? 0,
    stmh1: formData.get("stmh1") ?? 24,
    stmh2: formData.get("stmh2") ?? 24,
    stmh3: formData.get("stmh3") ?? 24,
    stmh4: formData.get("stmh4") ?? 24,
    stmh5: formData.get("stmh5") ?? 24,
    stmh6: formData.get("stmh6") ?? 24,
    stmh7: formData.get("stmh7") ?? 24,
    postId: formData.get("postId")?.toString().trim() || undefined,
    });
  } catch (error) {
    const message = error instanceof z.ZodError
      ? "Некорректные данные шаблона сменности"
      : error instanceof Error
        ? error.message
        : "Некорректные данные шаблона сменности";
    if (noRedirect) throw new Error(message);
    redirect(`/objects/${formData.get("objectId")}?error=${encodeURIComponent(message)}`);
    return;
  }

  try {
  const templates = await listShiftTemplatesForObjectIds([input.objectId]);
  const baseline = activeShiftsSequence(
    templates,
    input.objectId,
    getPreviousCivilDate(input.effectiveFrom),
    input.postId ?? null,
  );

  const perDay = [1, 2, 3, 4, 5, 6, 7].map((dayOfWeek, index) => {
    const merged = inheritZeroTemplateCounts(
      {
        regular: [input.d1, input.d2, input.d3, input.d4, input.d5, input.d6, input.d7][index] ?? 0,
        shiftHours: [input.h1, input.h2, input.h3, input.h4, input.h5, input.h6, input.h7][index] ?? 24,
        reinforcement: [input.r1, input.r2, input.r3, input.r4, input.r5, input.r6, input.r7][index] ?? 0,
        reinforcementShiftHours:
          [input.rh1, input.rh2, input.rh3, input.rh4, input.rh5, input.rh6, input.rh7][index] ?? 24,
        rapidResponse: [input.mp1, input.mp2, input.mp3, input.mp4, input.mp5, input.mp6, input.mp7][index] ?? 0,
        rapidResponseShiftHours:
          [input.mph1, input.mph2, input.mph3, input.mph4, input.mph5, input.mph6, input.mph7][index] ?? 24,
        shiftLead: [input.stm1, input.stm2, input.stm3, input.stm4, input.stm5, input.stm6, input.stm7][index] ?? 0,
        shiftLeadShiftHours:
          [input.stmh1, input.stmh2, input.stmh3, input.stmh4, input.stmh5, input.stmh6, input.stmh7][index] ?? 24,
      },
      {
        regular: baseline.regular[index] ?? 2,
        shiftHours: baseline.shiftHours[index] ?? 24,
        reinforcement: baseline.reinforcement[index] ?? 0,
        reinforcementShiftHours: baseline.reinforcementShiftHours[index] ?? 24,
        rapidResponse: baseline.rapidResponse[index] ?? 0,
        rapidResponseShiftHours: baseline.rapidResponseShiftHours[index] ?? 24,
        shiftLead: baseline.shiftLead[index] ?? 0,
        shiftLeadShiftHours: baseline.shiftLeadShiftHours[index] ?? 24,
      },
    );
    return {
      dayOfWeek,
      shiftsPerDay: merged.regular,
      shiftsReinforcementPerDay: merged.reinforcement,
      shiftHours: merged.shiftHours,
      reinforcementShiftHours: merged.reinforcementShiftHours,
      shiftsRapidResponsePerDay: merged.rapidResponse,
      rapidResponseShiftHours: merged.rapidResponseShiftHours,
      shiftsShiftLeadPerDay: merged.shiftLead,
      shiftLeadShiftHours: merged.shiftLeadShiftHours,
    };
  });

  await replaceShiftTemplatesForObject(input.objectId, perDay, input.effectiveFrom, input.postId ?? null);
  revalidateAfterShiftMutation(["/objects", `/objects/${input.objectId}`, "/scheduler"]);

  if (noRedirect) {
    return;
  }
  redirect(formData.get("redirect")?.toString() || "/objects");
  } catch (error) {
    const message = formatShiftTemplateSaveError(error);
    if (noRedirect) throw new Error(message);
    redirect(`/objects/${input.objectId}?error=${encodeURIComponent(message)}`);
  }
}

function formatShiftTemplateSaveError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();
  if (
    lower.includes("duplicate key") ||
    lower.includes("object_shift_templates_object_id_day_of_week_effective_from_key") ||
    lower.includes("object_shift_templates_object_post_dow_from_uidx")
  ) {
    return "На эту дату уже есть версия шаблона сменности (возможно, для другого поста). Выберите другую дату в поле «Применять сменность с даты» или сначала измените существующую версию.";
  }
  if (lower.includes("shifts_per_day")) {
    return "Нельзя сохранить шаблон: для объекта без обычных смен нужна миграция БД. Обратитесь к администратору.";
  }
  if (raw && !lower.includes("violates") && !lower.includes("constraint") && raw.length < 180) {
    return raw;
  }
  return "Не удалось сохранить шаблон сменности. Проверьте дату и значения по дням недели и попробуйте снова.";
}

function emptyToNull(s: FormDataEntryValue | null): string | null {
  const t = s == null ? "" : String(s).trim();
  return t === "" ? null : t;
}

function parseTimeField(s: FormDataEntryValue | null): string | null {
  const v = emptyToNull(s);
  if (v === null) return null;
  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) throw new Error("Некорректное время интервала (чч:мм)");
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Некорректное время интервала (чч:мм)");
  }
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function parseTriBool(s: FormDataEntryValue | null): boolean | null {
  const v = emptyToNull(s);
  if (v === null) return null;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function parseDaysOfWeek(formData: FormData): number[] | null {
  const values = formData.getAll("dayOfWeek");
  if (values.length === 0) return null;
  const days = values
    .map((v) => Number(String(v)))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
  const unique = [...new Set(days)].sort((a, b) => a - b);
  if (unique.length === 0) return null;
  return unique;
}

function parsePosition(s: FormDataEntryValue | null): GuardPosition | null {
  const v = emptyToNull(s);
  if (v === null) return null;
  if (v === "ShiftLead" || v === "Guard" || v === "Curator") return v;
  throw new Error("Некорректная должность");
}

function parseLicense(s: FormDataEntryValue | null): GuardLicenseType | null {
  const v = emptyToNull(s);
  if (v === null) return null;
  if (v === "None" || v === "Licensed") return v;
  throw new Error("Некорректное удостоверение");
}

function parseEmployment(s: FormDataEntryValue | null): GuardEmploymentType | null {
  const v = emptyToNull(s);
  if (v === null) return null;
  if (v === "Employed" || v === "Unemployed") return v;
  throw new Error("Некорректное трудоустройство");
}

function parseShiftKind(s: FormDataEntryValue | null): ShiftKind | null {
  const v = emptyToNull(s);
  if (v === null) return null;
  if (v === "ReinforcementDay") return "Reinforcement";
  if (v === "Regular" || v === "Reinforcement" || v === "RapidResponse" || v === "ShiftLead") return v;
  throw new Error("Некорректный тип смены");
}

function rublesToCents(raw: FormDataEntryValue | null): number {
  const s = raw == null ? "" : String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error("Сумма в рублях должна быть неотрицательной");
  return Math.round(n * 100);
}

function buildRateRuleInput(formData: FormData, objectId: string): CreateObjectRateRuleInput {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("Укажите название правила");

  const priorityRaw = Number(formData.get("priority"));
  const priority = Number.isFinite(priorityRaw) ? Math.trunc(priorityRaw) : 100;

  const rateUnit = z.enum(["Hour", "Shift"]).parse(formData.get("rateUnit")) as RateUnit;
  const effectiveFrom = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("effectiveFrom"));
  const effectiveToRaw = emptyToNull(formData.get("effectiveTo"));
  const effectiveTo =
    effectiveToRaw && /^\d{4}-\d{2}-\d{2}$/.test(effectiveToRaw) ? effectiveToRaw : null;

  return {
    objectId,
    name,
    priority,
    daysOfWeek: parseDaysOfWeek(formData),
    isHoliday: parseTriBool(formData.get("isHoliday")),
    shiftKind: parseShiftKind(formData.get("shiftKind")),
    startsAt: parseTimeField(formData.get("startsAt")),
    endsAt: parseTimeField(formData.get("endsAt")),
    position: parsePosition(formData.get("position")),
    licenseType: parseLicense(formData.get("licenseType")),
    employmentType: parseEmployment(formData.get("employmentType")),
    isTrainee: parseTriBool(formData.get("isTrainee")),
    clientRateCents: rublesToCents(formData.get("clientRubles")),
    guardRateCents: rublesToCents(formData.get("guardRubles")),
    rateUnit,
    effectiveFrom,
    effectiveTo,
  };
}

export type ObjectRateRuleActionResult = { ok: true } | { ok: false; error: string };

function formatRateRuleActionError(error: unknown, fallback: string): string {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => issue.message).join("; ");
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

export async function createObjectRateRuleAction(formData: FormData): Promise<ObjectRateRuleActionResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "rates:manage");

    const objectId = z.string().uuid().parse(formData.get("objectId"));
    const input = buildRateRuleInput(formData, objectId);
    await createObjectRateRule(input);
    const { backfillTimesheetEntriesForObjectFromDateSafe } = await import(
      "../../lib/accounting/sync-timesheet-entry"
    );
    await backfillTimesheetEntriesForObjectFromDateSafe(objectId, input.effectiveFrom);
    revalidatePath("/objects");
    revalidatePath(`/objects/${objectId}`);
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatRateRuleActionError(error, "Не удалось добавить правило") };
  }
}

function rateRuleRecordToInput(rule: ObjectRateRuleRecord): CreateObjectRateRuleInput {
  return {
    objectId: rule.objectId,
    name: rule.name,
    priority: rule.priority,
    daysOfWeek: rule.daysOfWeek,
    isHoliday: rule.isHoliday,
    shiftKind: rule.shiftKind,
    startsAt: rule.startsAt,
    endsAt: rule.endsAt,
    position: rule.position,
    licenseType: rule.licenseType,
    employmentType: rule.employmentType,
    isTrainee: rule.isTrainee,
    clientRateCents: rule.clientRateCents,
    guardRateCents: rule.guardRateCents,
    rateUnit: rule.rateUnit,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
  };
}

/** Полное редактирование текущей версии правила (условия, клиент, период…). */
export async function updateObjectRateRuleAction(formData: FormData): Promise<ObjectRateRuleActionResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "rates:manage");

    const ruleId = z.string().uuid().parse(formData.get("ruleId"));
    const objectId = z.string().uuid().parse(formData.get("objectId"));
    const input = buildRateRuleInput(formData, objectId);
    const existing = await getObjectRateRule(ruleId);
    await updateObjectRateRule(ruleId, input);
    const backfillFrom =
      existing && existing.effectiveFrom < input.effectiveFrom
        ? existing.effectiveFrom
        : input.effectiveFrom;
    const { backfillTimesheetEntriesForObjectFromDateSafe } = await import(
      "../../lib/accounting/sync-timesheet-entry"
    );
    await backfillTimesheetEntriesForObjectFromDateSafe(objectId, backfillFrom);
    revalidatePath("/objects");
    revalidatePath(`/objects/${objectId}`);
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatRateRuleActionError(error, "Не удалось сохранить правило") };
  }
}

/**
 * Новая версия ставки сотрудника с выбранной даты: архивный период сохраняет старые ₽,
 * табель пересчитывается только с `versionFrom`.
 */
export async function supersedeObjectRateRuleGuardRateAction(
  formData: FormData,
): Promise<ObjectRateRuleActionResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "rates:manage");

    const ruleId = z.string().uuid().parse(formData.get("ruleId"));
    const objectId = z.string().uuid().parse(formData.get("objectId"));
    const versionFrom = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("versionFrom"));
    const guardRateCents = rublesToCents(formData.get("guardRubles"));

    const existing = await getObjectRateRule(ruleId);
    if (!existing) throw new Error("Правило ставки не найдено");
    if (existing.objectId !== objectId) throw new Error("Правило принадлежит другому объекту");
    if (versionFrom <= existing.effectiveFrom) {
      throw new Error("Дата должна быть позже начала текущей версии — иначе используйте «Изменить»");
    }

    const input = rateRuleRecordToInput(existing);
    input.guardRateCents = guardRateCents;
    const saved = await saveObjectRateRuleWithVersioning(ruleId, input, versionFrom);
    const { backfillTimesheetEntriesForObjectFromDateSafe } = await import(
      "../../lib/accounting/sync-timesheet-entry"
    );
    await backfillTimesheetEntriesForObjectFromDateSafe(objectId, saved.backfillFrom);
    revalidatePath("/objects");
    revalidatePath(`/objects/${objectId}`);
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: formatRateRuleActionError(error, "Не удалось изменить ставку с даты"),
    };
  }
}

export async function reorderObjectRateRulesAction(formData: FormData): Promise<ObjectRateRuleActionResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "rates:manage");

    const objectId = z.string().uuid().parse(formData.get("objectId"));
    const orderedRuleIds = z
      .array(z.string().uuid())
      .min(1)
      .parse(JSON.parse(String(formData.get("orderedRuleIds") ?? "[]")));

    await reorderObjectRateRules(objectId, orderedRuleIds);
    const { backfillTimesheetEntriesForObjectSafe } = await import(
      "../../lib/accounting/sync-timesheet-entry"
    );
    await backfillTimesheetEntriesForObjectSafe(objectId);
    revalidatePath("/objects");
    revalidatePath(`/objects/${objectId}`);
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatRateRuleActionError(error, "Не удалось изменить порядок правил") };
  }
}

export async function deleteObjectRateRuleAction(formData: FormData): Promise<ObjectRateRuleActionResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "rates:manage");

    const ruleId = z.string().uuid().parse(formData.get("ruleId"));
    const objectId = z.string().uuid().parse(formData.get("objectId"));
    const existing = await getObjectRateRule(ruleId);
    const backfillFrom = existing?.effectiveFrom ?? null;
    await deleteObjectRateRule(ruleId);
    const { backfillTimesheetEntriesForObjectFromDateSafe, backfillTimesheetEntriesForObjectSafe } =
      await import("../../lib/accounting/sync-timesheet-entry");
    if (backfillFrom) {
      await backfillTimesheetEntriesForObjectFromDateSafe(objectId, backfillFrom);
    } else {
      await backfillTimesheetEntriesForObjectSafe(objectId);
    }
    revalidatePath("/objects");
    revalidatePath(`/objects/${objectId}`);
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: formatRateRuleActionError(error, "Не удалось удалить правило") };
  }
}

export async function addObjectHolidayAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const objectId = z.string().uuid().parse(formData.get("objectId"));
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("date"));
  const name = z.string().trim().min(1).parse(formData.get("name"));

  await addObjectHoliday(objectId, date, name);
  const { backfillTimesheetEntriesForObjectOnLocalDateSafe } = await import(
    "../../lib/accounting/sync-timesheet-entry"
  );
  await backfillTimesheetEntriesForObjectOnLocalDateSafe(objectId, date);
  revalidatePath(`/objects/${objectId}`);
}

export async function deleteObjectHolidayAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const id = z.string().uuid().parse(formData.get("id"));
  const objectId = z.string().uuid().parse(formData.get("objectId"));

  await deleteObjectHoliday(id);
  revalidatePath(`/objects/${objectId}`);
}

export async function createObjectPostAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const objectId = z.string().uuid().parse(formData.get("objectId"));
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(formData.get("month"));
  const name = z.string().trim().min(1).parse(formData.get("name"));

  await createObjectPost(objectId, month, name);
  revalidatePath(`/objects/${objectId}`);
}

export async function updateObjectPostAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const id = z.string().uuid().parse(formData.get("id"));
  const objectId = z.string().uuid().parse(formData.get("objectId"));
  const name = z.string().trim().min(1).parse(formData.get("name"));

  await updateObjectPost(id, name);
  revalidatePath(`/objects/${objectId}`);
}

export async function deleteObjectPostAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const id = z.string().uuid().parse(formData.get("id"));
  const objectId = z.string().uuid().parse(formData.get("objectId"));

  await deleteObjectPost(id);
  revalidatePath(`/objects/${objectId}`);
}

const upsertObjectMonthlySettingSchema = z.object({
  objectId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  operationalDayStartTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export type UpsertObjectMonthlySettingResult = { ok: true } | { ok: false; error: string };

export async function upsertObjectMonthlySettingAction(
  formData: FormData,
): Promise<UpsertObjectMonthlySettingResult> {
  try {
    const session = await requireSession();
    assertPermission(session.user.role, "objects:manage");

    const input = upsertObjectMonthlySettingSchema.parse({
      objectId: formData.get("objectId"),
      month: formData.get("month"),
      operationalDayStartTime: formData.get("operationalDayStartTime"),
    });

    await upsertObjectMonthlySetting(input.objectId, input.month, input.operationalDayStartTime);
    revalidatePath("/objects");
    revalidatePath(`/objects/${input.objectId}`);
    revalidatePath("/scheduler");
    revalidateTag("timesheet", undefined as any);
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Некорректные параметры настройки"
        : error instanceof Error
          ? error.message
          : "Не удалось сохранить настройки месяца";
    return { ok: false, error: message };
  }
}

const replaceMonthlyPostGuardsSchema = z.object({
  objectId: z.string().uuid(),
  postId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  guardIds: z.array(z.string().uuid()),
});

export async function replaceMonthlyPostGuardsAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "objects:manage");

  const guardIdsRaw = formData.get("guardIds");
  const guardIds =
    typeof guardIdsRaw === "string" && guardIdsRaw.trim().length > 0
      ? guardIdsRaw.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

  const input = replaceMonthlyPostGuardsSchema.parse({
    objectId: formData.get("objectId"),
    postId: formData.get("postId"),
    month: formData.get("month"),
    guardIds,
  });

  await replaceMonthlyPostGuards(
    input.objectId,
    input.postId,
    input.month,
    input.guardIds,
  );
  revalidatePath(`/objects/${input.objectId}`);
}
