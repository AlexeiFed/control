"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { revalidateAfterShiftMutation } from "../../lib/scheduling/revalidate-after-mutation";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { toDateTimeKhabarovsk } from "../../lib/format/display-date";
import { normalizeFormScrollY } from "../../lib/scheduling/form-scroll-y";
import { buildShiftIntervalFromHm } from "../../lib/scheduling/operational-day-timeline";
import { getObjectOperationalDayStartTime, getObjectOperationalDayStartTimeForMonth } from "../../lib/operations/objects-repository";
import {
  bulkCreateShifts,
  cloneObjectWeekShifts,
  createShiftAssignment,
  createShiftLog,
  deleteShiftById,
  recordShiftIncident,
  updateShiftAssignment,
} from "../../lib/operations/scheduler-repository";
import { incidentCategoryLabels } from "../../lib/operations/status-labels";
import { resolveShiftSelectedRateRuleId } from "../../lib/rates/resolve-shift-rate-rule";
import type { IncidentCategory, RateUnit, ShiftKind } from "../../lib/scheduling/types";

const scrollYOptionalSchema = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value) => normalizeFormScrollY(value));

const createShiftSchema = z.object({
  objectId: z.string().uuid(),
  guardId: z.string().uuid(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  replaceShiftId: z.string().uuid().optional(),
  scrollY: scrollYOptionalSchema,
  shiftKind: z.enum(["Regular", "Reinforcement", "RapidResponse", "ShiftLead"]).optional(),
  isNoShow: z.string().optional(),
  manualClientRubles: z.string().optional(),
  manualGuardRubles: z.string().optional(),
  manualRateUnit: z.string().optional(),
  manualRateReason: z.string().optional(),
  rateRuleId: z
    .preprocess((v) => (v == null || String(v).trim() === "" ? undefined : String(v).trim()), z.string().uuid().optional()),
  redirect: z.string().optional(),
  objectIdFilter: z.string().optional(),
  noRedirect: z.string().optional(),
  postId: z
    .preprocess((v) => (v == null || String(v).trim() === "" ? undefined : String(v).trim()), z.string().uuid().optional()),
});

function formatZodError(error: z.ZodError): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

function parseCreateShiftForm(formData: FormData): z.infer<typeof createShiftSchema> {
  try {
    return createShiftSchema.parse({
      objectId: formData.get("objectId"),
      guardId: formData.get("guardId"),
      shiftDate: formData.get("shiftDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      weekStart: formData.get("weekStart") || undefined,
      replaceShiftId: formData.get("replaceShiftId") || undefined,
      scrollY: formData.get("scrollY") || undefined,
      shiftKind: formData.get("shiftKind") || undefined,
      isNoShow: formData.get("isNoShow") || undefined,
      manualClientRubles: formData.get("manualClientRubles") ?? undefined,
      manualGuardRubles: formData.get("manualGuardRubles") ?? undefined,
      manualRateUnit: formData.get("manualRateUnit") ?? undefined,
      manualRateReason: formData.get("manualRateReason") ?? undefined,
      rateRuleId: formData.get("rateRuleId")?.toString().trim() || undefined,
      redirect: formData.get("redirect")?.toString() || undefined,
      objectIdFilter: formData.get("objectIdFilter")?.toString() || undefined,
      noRedirect: formData.get("noRedirect")?.toString().trim() || undefined,
      postId: formData.get("postId")?.toString().trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatZodError(error));
    }
    throw error;
  }
}

function parseUpdateShiftForm(formData: FormData): z.infer<typeof updateShiftSchema> {
  try {
    return updateShiftSchema.parse({
      shiftId: formData.get("shiftId"),
      objectId: formData.get("objectId"),
      guardId: formData.get("guardId"),
      shiftDate: formData.get("shiftDate"),
      startTime: formData.get("startTime"),
      endTime: formData.get("endTime"),
      weekStart: formData.get("weekStart") || undefined,
      replaceShiftId: formData.get("replaceShiftId") || undefined,
      scrollY: formData.get("scrollY") || undefined,
      shiftKind: formData.get("shiftKind") || undefined,
      manualClientRubles: formData.get("manualClientRubles") ?? undefined,
      manualGuardRubles: formData.get("manualGuardRubles") ?? undefined,
      manualRateUnit: formData.get("manualRateUnit") ?? undefined,
      manualRateReason: formData.get("manualRateReason") ?? undefined,
      rateRuleId: formData.get("rateRuleId")?.toString().trim() || undefined,
      redirect: formData.get("redirect")?.toString() || undefined,
      objectIdFilter: formData.get("objectIdFilter")?.toString() || undefined,
      noRedirect: formData.get("noRedirect")?.toString().trim() || undefined,
      postId: formData.get("postId")?.toString().trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatZodError(error));
    }
    throw error;
  }
}

function assertScheduleWriteRole(role: Parameters<typeof assertPermission>[0]): void {
  try {
    assertPermission(role, "schedule:write");
  } catch (error) {
    if (error instanceof ForbiddenError) {
      throw new Error("Недостаточно прав для изменения графика");
    }
    throw error;
  }
}

const updateShiftSchema = createShiftSchema.extend({
  shiftId: z.string().uuid(),
});

const createShiftLogSchema = z.object({
  shiftId: z.string().uuid(),
  note: z.string().trim().min(3, "Введите осмысленную заметку"),
  incidentLevel: z.enum(["None", "Info", "Warning", "Critical"]),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scrollY: scrollYOptionalSchema,
  objectIdFilter: z.string().optional(),
  redirect: z
    .string()
    .optional()
    .refine((s) => !s || (s.startsWith("/") && !s.startsWith("//")), "Некорректный redirect"),
  noRedirect: z.string().optional(),
});

const incidentCategorySchema = z.enum(["FullNoShow", "LeftWork", "DrunkOnDuty", "Other"]);

const recordShiftIncidentFormSchema = z.object({
  shiftId: z.string().uuid(),
  incidentMode: z.enum(["full", "partial"]),
  category: incidentCategorySchema,
  comment: z
    .preprocess((v) => (v == null ? "" : String(v)), z.string())
    .transform((s) => s.trim())
    .pipe(z.string().max(4000)),
  workedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  workedTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  replacementGuardId: z
    .preprocess((v) => (v == null || String(v).trim() === "" ? "" : String(v).trim()), z.string())
    .pipe(z.union([z.string().uuid(), z.literal("")])),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scrollY: scrollYOptionalSchema,
  objectIdFilter: z.string().optional(),
  shiftObjectId: z.preprocess((v) => String(v ?? "").trim(), z.string().uuid()),
  redirect: z
    .string()
    .optional()
    .refine((s) => !s || (s.startsWith("/") && !s.startsWith("//")), "Некорректный redirect"),
  noRedirect: z.string().optional(),
});

const deleteShiftFormSchema = z.object({
  shiftId: z.string().uuid(),
  redirect: z
    .string()
    .optional()
    .refine((s) => !s || (s.startsWith("/") && !s.startsWith("//")), "Некорректный redirect"),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scrollY: scrollYOptionalSchema,
  objectIdFilter: z.string().optional(),
  noRedirect: z.string().optional(),
});

export type IncidentActionResult = { ok: true } | { ok: false; error: string };

export async function recordShiftIncidentAction(
  formData: FormData,
): Promise<IncidentActionResult | void> {
  const noRedirectEarly = formData.get("noRedirect")?.toString().trim() === "true";

  let session;
  try {
    session = await requireSession();
    assertPermission(session.user.role, "schedule:write");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Недостаточно прав для фиксации инцидента";
    if (noRedirectEarly) return { ok: false, error: message };
    throw error;
  }

  const raw = {
    shiftId: formData.get("shiftId"),
    incidentMode: formData.get("incidentMode"),
    category: formData.get("category"),
    comment: formData.get("comment"),
    workedDate: formData.get("workedDate")?.toString().trim() || undefined,
    workedTime: formData.get("workedTime")?.toString().trim() || undefined,
    replacementGuardId: formData.get("replacementGuardId")?.toString().trim() || "",
    weekStart: formData.get("weekStart")?.toString().trim() || undefined,
    scrollY: formData.get("scrollY")?.toString().trim() || undefined,
    objectIdFilter: formData.get("objectIdFilter")?.toString().trim() || undefined,
    shiftObjectId: formData.get("shiftObjectId"),
    redirect: formData.get("redirect")?.toString().trim() || undefined,
    noRedirect: formData.get("noRedirect")?.toString().trim() || undefined,
  };
  const noRedirect = raw.noRedirect === "true";

  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    const message = "Недостаточно прав для фиксации инцидента";
    if (noRedirect) return { ok: false, error: message };
    throw new Error(message);
  }

  function incidentFormError(
    message: string,
    ctx: {
      weekStart?: string;
      scrollY?: string;
      objectIdFilter?: string;
      redirect?: string;
      noRedirect?: string;
    },
  ): IncidentActionResult | void {
    if (ctx.noRedirect === "true") {
      return { ok: false, error: message };
    }
    const r = ctx.redirect?.trim();
    if (r && r.startsWith("/") && !r.startsWith("//")) {
      const url = new URL(r, "http://localhost");
      url.searchParams.set("error", message);
      if (ctx.scrollY) url.searchParams.set("scrollY", ctx.scrollY);
      redirect(url.pathname + url.search);
    }
    const ws = ctx.weekStart ?? "";
    const scroll = ctx.scrollY ? `&scrollY=${ctx.scrollY}` : "";
    const objectFilter = ctx.objectIdFilter ? `&objectId=${encodeURIComponent(ctx.objectIdFilter)}` : "";
    redirect(`/scheduler?week=${ws}&error=${encodeURIComponent(message)}${scroll}${objectFilter}`);
  }

  let input: z.infer<typeof recordShiftIncidentFormSchema>;
  try {
    input = recordShiftIncidentFormSchema.parse(raw);
  } catch (error) {
    const msg = error instanceof z.ZodError ? formatZodError(error) : "Некорректные данные инцидента";
    return incidentFormError(msg, {
      weekStart: typeof raw.weekStart === "string" ? raw.weekStart : undefined,
      scrollY: typeof raw.scrollY === "string" ? raw.scrollY : undefined,
      objectIdFilter: typeof raw.objectIdFilter === "string" ? raw.objectIdFilter : undefined,
      redirect: typeof raw.redirect === "string" ? raw.redirect : undefined,
      noRedirect: typeof raw.noRedirect === "string" ? raw.noRedirect : undefined,
    });
  }

  const isPartial = input.incidentMode === "partial";
  const finalCategory: IncidentCategory = isPartial ? input.category : "FullNoShow";

  if (isPartial && finalCategory === "FullNoShow") {
    return incidentFormError(
      "Для частичной отработки выберите тип инцидента, не «полный невыход»",
      {
        weekStart: input.weekStart,
        scrollY: input.scrollY,
        objectIdFilter: input.objectIdFilter,
        redirect: input.redirect,
        noRedirect: input.noRedirect,
      },
    );
  }

  let workedUntilAt: Date | null = null;
  if (isPartial) {
    if (!input.workedDate || !input.workedTime) {
      return incidentFormError("Укажите дату и время, до которых отработал охранник", {
        weekStart: input.weekStart,
        scrollY: input.scrollY,
        objectIdFilter: input.objectIdFilter,
        redirect: input.redirect,
        noRedirect: input.noRedirect,
      });
    }
    workedUntilAt = toDateTimeKhabarovsk(input.workedDate, input.workedTime);
  }

  const replacement =
    input.replacementGuardId && input.replacementGuardId.length > 0 ? input.replacementGuardId : null;

  const logParts = [incidentCategoryLabels[finalCategory]];
  if (input.comment) logParts.push(input.comment);
  const logNote = logParts.join(": ");

  try {
    await recordShiftIncident({
      shiftId: input.shiftId,
      authorUserId: session.user.id,
      category: finalCategory,
      comment: input.comment,
      workedUntilAt,
      replacementGuardId: replacement,
      logNote,
    });
  } catch (error) {
    return incidentFormError(error instanceof Error ? error.message : "Не удалось зафиксировать инцидент", {
      weekStart: input.weekStart,
      scrollY: input.scrollY,
      objectIdFilter: input.objectIdFilter,
      redirect: input.redirect,
      noRedirect: input.noRedirect,
    });
  }

  revalidateAfterShiftMutation([
    "/scheduler",
    "/admin/curators",
    "/accounting/timesheet",
    "/dashboard",
    "/",
    `/objects/${input.shiftObjectId}`,
  ]);

  if (input.noRedirect === "true") {
    return { ok: true };
  }

  const rOk = input.redirect?.trim();
  if (rOk && rOk.startsWith("/") && !rOk.startsWith("//")) {
    const url = new URL(rOk, "http://localhost");
    if (input.scrollY) url.searchParams.set("scrollY", input.scrollY);
    url.searchParams.set("success", "incident-recorded");
    redirect(url.pathname + url.search);
  }

  const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
  const objectFilter = input.objectIdFilter ? `&objectId=${encodeURIComponent(input.objectIdFilter)}` : "";
  redirect(`/scheduler?week=${input.weekStart ?? ""}&success=incident-recorded${scroll}${objectFilter}`);
}

export async function deleteShiftAction(formData: FormData) {
  const session = await requireSession();
  assertScheduleWriteRole(session.user.role);

  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    throw new Error("Недостаточно прав для удаления смены");
  }

  const raw = {
    shiftId: formData.get("shiftId"),
    redirect: formData.get("redirect")?.toString().trim() || undefined,
    weekStart: formData.get("weekStart")?.toString().trim() || undefined,
    scrollY: formData.get("scrollY")?.toString().trim() || undefined,
    objectIdFilter: formData.get("objectIdFilter")?.toString().trim() || undefined,
    noRedirect: formData.get("noRedirect")?.toString().trim() || undefined,
  };

  function redirectDeleteError(
    message: string,
    weekStart?: string,
    scrollY?: string,
    objectIdFilter?: string,
    redirectPath?: string,
    noRedirect?: string,
  ) {
    if (noRedirect === "true") {
      throw new Error(message);
    }
    if (redirectPath) {
      const url = new URL(redirectPath, "http://localhost");
      url.searchParams.set("error", message);
      redirect(url.pathname + url.search);
    }
    const ws = weekStart ?? "";
    const scroll = scrollY ? `&scrollY=${scrollY}` : "";
    const objectFilter = objectIdFilter ? `&objectId=${encodeURIComponent(objectIdFilter)}` : "";
    redirect(`/scheduler?week=${ws}&error=${encodeURIComponent(message)}${scroll}${objectFilter}`);
  }

  let input: z.infer<typeof deleteShiftFormSchema>;
  try {
    input = deleteShiftFormSchema.parse(raw);
  } catch {
    redirectDeleteError(
      "Некорректные данные удаления",
      typeof raw.weekStart === "string" ? raw.weekStart : undefined,
      typeof raw.scrollY === "string" ? raw.scrollY : undefined,
      typeof raw.objectIdFilter === "string" ? raw.objectIdFilter : undefined,
      raw.redirect,
      raw.noRedirect,
    );
    return;
  }

  let objectId: string;
  try {
    const result = await deleteShiftById(input.shiftId);
    objectId = result.objectId;
  } catch (error) {
    redirectDeleteError(
      error instanceof Error ? error.message : "Не удалось удалить смену",
      input.weekStart,
      input.scrollY,
      input.objectIdFilter,
      input.redirect,
      input.noRedirect,
    );
    return;
  }

  revalidateAfterShiftMutation([
    "/scheduler",
    "/admin/curators",
    "/accounting/timesheet",
    "/dashboard",
    "/",
    `/objects/${objectId}`,
  ]);

  if (input.noRedirect === "true") {
    return;
  }

  if (input.redirect) {
    const url = new URL(input.redirect, "http://localhost");
    url.searchParams.set("success", "shift-deleted");
    if (input.scrollY) {
      url.searchParams.set("scrollY", input.scrollY);
    }
    redirect(url.pathname + url.search);
  }

  const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
  const objectFilter = input.objectIdFilter ? `&objectId=${encodeURIComponent(input.objectIdFilter)}` : "";
  redirect(`/scheduler?week=${input.weekStart ?? ""}&success=shift-deleted${scroll}${objectFilter}`);
}

export async function createShiftLogAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:write");

  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    throw new Error("Недостаточно прав для создания записи журнала");
  }

  const input = createShiftLogSchema.parse({
    shiftId: formData.get("shiftId"),
    note: formData.get("note"),
    incidentLevel: formData.get("incidentLevel"),
    weekStart: formData.get("weekStart") || undefined,
    scrollY: formData.get("scrollY") || undefined,
    objectIdFilter: formData.get("objectIdFilter") || undefined,
    redirect: formData.get("redirect")?.toString() || undefined,
    noRedirect: formData.get("noRedirect")?.toString() || undefined,
  });

  await createShiftLog({
    shiftId: input.shiftId,
    authorUserId: session.user.id,
    note: input.note,
    incidentLevel: input.incidentLevel,
  });

  revalidatePath("/scheduler");
  revalidatePath("/admin/curators");
  revalidateTag("timesheet", "max");
  if (input.redirect?.startsWith("/objects/")) {
    revalidatePath(input.redirect.split("?")[0]!);
  }

  if (input.noRedirect === "true") {
    return;
  }

  if (input.redirect) {
    const params = new URLSearchParams();
    if (input.scrollY) params.set("scrollY", input.scrollY);
    const sep = input.redirect.includes("?") ? "&" : "?";
    redirect(params.size > 0 ? `${input.redirect}${sep}${params.toString()}` : input.redirect);
  }

  const params = new URLSearchParams();
  if (input.weekStart) params.set("week", input.weekStart);
  if (input.scrollY) params.set("scrollY", input.scrollY);
  if (input.objectIdFilter) params.set("objectId", input.objectIdFilter);
  redirect(`/scheduler${params.size > 0 ? `?${params.toString()}` : ""}`);
}

export async function createShiftAction(formData: FormData) {
  const session = await requireSession();
  assertScheduleWriteRole(session.user.role);

  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    throw new Error("Недостаточно прав для создания смены");
  }

  const input = parseCreateShiftForm(formData);

  const monthKey = input.shiftDate.slice(0, 7);
  const anchorTime = await getObjectOperationalDayStartTimeForMonth(input.objectId, monthKey);
  const { startsAt, endsAt } = buildShiftIntervalFromHm(
    input.shiftDate,
    input.startTime,
    input.endTime,
    anchorTime,
  );

  const shiftKind: ShiftKind = (input.shiftKind as ShiftKind) || "Regular";
  const isNoShow = input.isNoShow === "true";
  let clientCents: number | null;
  let guardCents: number | null;

  function handleError(message: string) {
    if (input.noRedirect === "true") {
      throw new Error(message);
    }
    if (input.redirect) {
      const url = new URL(input.redirect, "http://localhost"); // base doesn't matter for path only
      url.searchParams.set("error", message);
      if (input.scrollY) url.searchParams.set("scrollY", input.scrollY);
      redirect(url.pathname + url.search);
    }
    revalidatePath("/scheduler");
    const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
    const objectFilter = input.objectIdFilter ? `&objectId=${input.objectIdFilter}` : "";
    redirect(`/scheduler?week=${input.weekStart || ""}&error=${encodeURIComponent(message)}${scroll}${objectFilter}`);
  }

  try {
    clientCents = rublesToCentsOptional(input.manualClientRubles);
    guardCents = rublesToCentsOptional(input.manualGuardRubles);
  } catch (error) {
    handleError(error instanceof Error ? error.message : "Некорректная сумма override");
    return; // unreachable
  }
  const hasOverride = clientCents !== null || guardCents !== null;
  if (hasOverride) {
    assertPermission(session.user.role, "schedule:write");
    if (guardCents === null) {
      handleError("Укажите ставку охранника для произвольного тарифа");
      return;
    }
  }
  const unitTrim = input.manualRateUnit?.trim();
  const manualRateUnitResolved: RateUnit | null =
    unitTrim === "Hour" || unitTrim === "Shift" ? unitTrim : null;
  if (hasOverride && !manualRateUnitResolved) {
    handleError("Для override укажите единицу ставки (час или смену)");
    return; // unreachable
  }

  try {
    const selectedRateRuleId = await resolveShiftSelectedRateRuleId({
      objectId: input.objectId,
      guardId: input.guardId,
      shiftKind,
      startsAt,
      endsAt,
      rateRuleId: input.rateRuleId || null,
      manualClientRateCents: clientCents,
      manualGuardRateCents: guardCents,
    });

    const { shiftId, appendNoShowLog } = await createShiftAssignment({
      guardId: input.guardId,
      objectId: input.objectId,
      postId: input.postId ?? null,
      startsAt,
      endsAt,
      assignmentDateIso: input.shiftDate,
      replaceShiftId: input.replaceShiftId,
      shiftKind,
      manualClientRateCents: clientCents,
      manualGuardRateCents: guardCents,
      manualRateUnit: manualRateUnitResolved,
      manualRateReason: input.manualRateReason?.trim() ?? "",
      selectedRateRuleId,
      isNoShow,
    });

    if (isNoShow && appendNoShowLog !== false) {
      await createShiftLog({
        shiftId,
        authorUserId: session.user.id,
        note: "Невыход при назначении (без карточки инцидента)",
        incidentLevel: "Warning",
      });
    }
  } catch (error) {
    handleError(error instanceof Error ? error.message : "Не удалось создать смену");
    return; // unreachable
  }

  revalidatePath("/scheduler");
  revalidatePath(`/objects/${input.objectId}`);
  revalidatePath("/accounting/timesheet");
  revalidateTag("timesheet", "max");
  revalidateTag("scheduler", "max");
  revalidateTag("global-alerts", "max");

  if (input.noRedirect === "true") {
    return;
  }

  if (input.redirect) {
    const url = new URL(input.redirect, "http://localhost");
    if (input.scrollY) url.searchParams.set("scrollY", input.scrollY);
    url.searchParams.set("success", "shift-created");
    redirect(url.pathname + url.search);
  }
  const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
  const objectFilter = input.objectIdFilter ? `&objectId=${input.objectIdFilter}` : "";
  redirect(`/scheduler?week=${input.weekStart || ""}&success=shift-created${scroll}${objectFilter}`);
}

export async function updateShiftAction(formData: FormData) {
  const session = await requireSession();
  assertScheduleWriteRole(session.user.role);

  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    throw new Error("Недостаточно прав для редактирования смены");
  }

  const input = parseUpdateShiftForm(formData);

  const monthKey = input.shiftDate.slice(0, 7);
  const anchorTime = await getObjectOperationalDayStartTimeForMonth(input.objectId, monthKey);
  const { startsAt, endsAt } = buildShiftIntervalFromHm(
    input.shiftDate,
    input.startTime,
    input.endTime,
    anchorTime,
  );

  const shiftKind: ShiftKind = (input.shiftKind as ShiftKind) || "Regular";

  let clientCents: number | null;
  let guardCents: number | null;

  function handleError(message: string) {
    if (input.noRedirect === "true") {
      throw new Error(message);
    }
    if (input.redirect) {
      const url = new URL(input.redirect, "http://localhost");
      url.searchParams.set("error", message);
      if (input.scrollY) url.searchParams.set("scrollY", input.scrollY);
      redirect(url.pathname + url.search);
    }
    const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
    const objectFilter = input.objectIdFilter ? `&objectId=${input.objectIdFilter}` : "";
    redirect(`/scheduler?week=${input.weekStart || ""}&error=${encodeURIComponent(message)}${scroll}${objectFilter}`);
  }

  try {
    clientCents = rublesToCentsOptional(input.manualClientRubles);
    guardCents = rublesToCentsOptional(input.manualGuardRubles);
  } catch (error) {
    handleError(error instanceof Error ? error.message : "Некорректная сумма override");
    return;
  }

  const hasOverride = clientCents !== null || guardCents !== null;
  if (hasOverride) {
    assertPermission(session.user.role, "schedule:write");
    if (guardCents === null) {
      handleError("Укажите ставку охранника для произвольного тарифа");
      return;
    }
  }
  const unitTrim = input.manualRateUnit?.trim();
  const manualRateUnitResolved: RateUnit | null =
    unitTrim === "Hour" || unitTrim === "Shift" ? unitTrim : null;
  if (hasOverride && !manualRateUnitResolved) {
    handleError("Для произвольной ставки укажите единицу (час или смену)");
    return;
  }

  try {
    const selectedRateRuleId = await resolveShiftSelectedRateRuleId({
      objectId: input.objectId,
      guardId: input.guardId,
      shiftKind,
      startsAt,
      endsAt,
      rateRuleId: input.rateRuleId || null,
      manualClientRateCents: clientCents,
      manualGuardRateCents: guardCents,
    });

    await updateShiftAssignment({
      shiftId: input.shiftId,
      guardId: input.guardId,
      objectId: input.objectId,
      postId: input.postId ?? null,
      startsAt,
      endsAt,
      assignmentDateIso: input.shiftDate,
      shiftKind,
      manualClientRateCents: hasOverride ? clientCents : null,
      manualGuardRateCents: hasOverride ? guardCents : null,
      manualRateUnit: hasOverride ? manualRateUnitResolved : null,
      manualRateReason: hasOverride ? input.manualRateReason?.trim() ?? "" : "",
      selectedRateRuleId: hasOverride ? null : selectedRateRuleId,
    });
  } catch (error) {
    handleError(error instanceof Error ? error.message : "Не удалось обновить смену");
    return;
  }

  revalidatePath("/scheduler");
  revalidatePath(`/objects/${input.objectId}`);
  revalidatePath("/accounting/timesheet");
  revalidateTag("timesheet", "max");
  revalidateTag("scheduler", "max");
  revalidateTag("global-alerts", "max");

  if (input.noRedirect === "true") {
    return;
  }

  if (input.redirect) {
    const url = new URL(input.redirect, "http://localhost");
    if (input.scrollY) url.searchParams.set("scrollY", input.scrollY);
    url.searchParams.set("success", "shift-updated");
    redirect(url.pathname + url.search);
  }
  const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
  const objectFilter = input.objectIdFilter ? `&objectId=${input.objectIdFilter}` : "";
  redirect(`/scheduler?week=${input.weekStart || ""}&success=shift-updated${scroll}${objectFilter}`);
}

function rublesToCentsOptional(raw: string | undefined): number | null {
  const s = raw == null ? "" : String(raw).trim().replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) throw new Error("Сумма override в рублях должна быть неотрицательной");
  return Math.round(n * 100);
}

const cloneWeekShiftsSchema = z.object({
  objectId: z.string().uuid(),
  sourceMonday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetMonday: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scrollY: scrollYOptionalSchema,
  objectIdFilter: z.string().optional(),
});

/**
 * Копирует все смены объекта из исходной недели в целевую (сдвиг ровно на 7 дней).
 * Используется кнопкой «Скопировать прошлую неделю» в строке объекта.
 * Невыходы и заменённые смены пропускаются; конфликты по охранникам отчитываются в success-сообщении.
 */
export async function cloneObjectWeekShiftsAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:write");
  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    throw new Error("Недостаточно прав для копирования недели");
  }

  const input = cloneWeekShiftsSchema.parse({
    objectId: formData.get("objectId"),
    sourceMonday: formData.get("sourceMonday"),
    targetMonday: formData.get("targetMonday"),
    weekStart: formData.get("weekStart")?.toString() || undefined,
    scrollY: formData.get("scrollY")?.toString() || undefined,
    objectIdFilter: formData.get("objectIdFilter")?.toString() || undefined,
  });

  let summary: string;
  try {
    const result = await cloneObjectWeekShifts({
      objectId: input.objectId,
      sourceMondayKhabarovskIso: input.sourceMonday,
      targetMondayKhabarovskIso: input.targetMonday,
    });
    const skipped = result.skipped.length;
    summary = skipped > 0
      ? `clone-week:${result.created}/${result.created + skipped}`
      : `clone-week:${result.created}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось скопировать неделю";
    const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
    const objectFilter = input.objectIdFilter ? `&objectId=${encodeURIComponent(input.objectIdFilter)}` : "";
    redirect(`/scheduler?week=${input.weekStart ?? ""}&error=${encodeURIComponent(message)}${scroll}${objectFilter}`);
  }

  revalidatePath("/scheduler");
  revalidatePath(`/objects/${input.objectId}`);
  revalidatePath("/admin/curators");
  revalidateTag("timesheet", "max");

  const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
  const objectFilter = input.objectIdFilter ? `&objectId=${encodeURIComponent(input.objectIdFilter)}` : "";
  redirect(`/scheduler?week=${input.weekStart ?? ""}&success=${encodeURIComponent(summary)}${scroll}${objectFilter}`);
}

const bulkCreateShiftItemSchema = z.object({
  objectId: z.string().uuid(),
  guardId: z.string().uuid(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  shiftKind: z.enum(["Regular", "Reinforcement", "RapidResponse", "ShiftLead"]),
  postId: z
    .preprocess((v) => (v == null || String(v).trim() === "" ? undefined : String(v).trim()), z.string().uuid().optional()),
});

const bulkCreateShiftsSchema = z.object({
  items: z.array(bulkCreateShiftItemSchema).min(1).max(100),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  scrollY: scrollYOptionalSchema,
  objectIdFilter: z.string().optional(),
  redirect: z.string().optional(),
  noRedirect: z.string().optional(),
});

/**
 * Массовое создание смен (drag-to-fill, мульти-выбор ячеек).
 * Принимает JSON-payload `items` в FormData; каждая смена создаётся через `createShiftAssignment`.
 * Конфликты не прерывают batch — итоговая статистика приходит в success-сообщении.
 */
export async function bulkCreateShiftsAction(formData: FormData) {
  const session = await requireSession();
  assertScheduleWriteRole(session.user.role);
  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    throw new Error("Недостаточно прав для массового создания смен");
  }

  const itemsRaw = formData.get("items")?.toString() ?? "[]";
  let parsedItems: unknown;
  try {
    parsedItems = JSON.parse(itemsRaw);
  } catch {
    throw new Error("Некорректный JSON-payload bulk-смен");
  }

  let input: z.infer<typeof bulkCreateShiftsSchema>;
  try {
    input = bulkCreateShiftsSchema.parse({
      items: parsedItems,
      weekStart: formData.get("weekStart")?.toString() || undefined,
      scrollY: formData.get("scrollY")?.toString() || undefined,
      objectIdFilter: formData.get("objectIdFilter")?.toString() || undefined,
      redirect: formData.get("redirect")?.toString() || undefined,
      noRedirect: formData.get("noRedirect")?.toString().trim() || undefined,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(formatZodError(error));
    }
    throw error;
  }

  const anchorCache = new Map<string, string>();
  const specs = [];
  for (const it of input.items) {
    const monthKey = it.shiftDate.slice(0, 7);
    const anchorCacheKey = `${it.objectId}:${monthKey}`;
    let anchorTime = anchorCache.get(anchorCacheKey);
    if (!anchorTime) {
      anchorTime = await getObjectOperationalDayStartTimeForMonth(it.objectId, monthKey);
      anchorCache.set(anchorCacheKey, anchorTime);
    }
    let startsAt: Date;
    let endsAt: Date;
    try {
      ({ startsAt, endsAt } = buildShiftIntervalFromHm(
        it.shiftDate,
        it.startTime,
        it.endTime,
        anchorTime,
      ));
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Некорректный интервал смены",
      );
    }
    specs.push({
      guardId: it.guardId,
      objectId: it.objectId,
      postId: it.postId ?? null,
      startsAt,
      endsAt,
      shiftKind: it.shiftKind as ShiftKind,
    });
  }

  const result = await bulkCreateShifts(specs);
  const total = result.created + result.skipped.length;
  const summary = result.skipped.length > 0
    ? `bulk-create:${result.created}/${total}`
    : `bulk-create:${result.created}`;

  revalidateAfterShiftMutation([
    "/scheduler",
    "/accounting/timesheet",
    ...new Set(specs.map((s) => `/objects/${s.objectId}`)),
  ]);

  if (input.noRedirect === "true") {
    return result;
  }

  const scroll = input.scrollY ? `&scrollY=${input.scrollY}` : "";
  if (input.redirect) {
    const url = new URL(input.redirect, "http://localhost");
    url.searchParams.set("success", summary);
    if (input.scrollY) url.searchParams.set("scrollY", input.scrollY);
    redirect(url.pathname + url.search);
  }
  const objectFilter = input.objectIdFilter ? `&objectId=${encodeURIComponent(input.objectIdFilter)}` : "";
  redirect(`/scheduler?week=${input.weekStart ?? ""}&success=${encodeURIComponent(summary)}${scroll}${objectFilter}`);
}
