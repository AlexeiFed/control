"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import {
  computeCuratorEntryRub,
  isScheduleCuratorWorkType,
  type CuratorWorkType,
} from "../../../lib/curators/work-entry-amount";
import { backfillCuratorShiftEntries } from "../../../lib/curators/sync-shift-entry";
import { formatDisplayDateFromIso } from "../../../lib/format/display-date";
import {
  createCurator,
  createWorkEntry,
  deleteCurator,
  deleteCuratorWorkEntryById,
  getCuratorTariffs,
  getWorkEntryById,
  findMonthlySalaryDateInMonth,
  listCuratorMonthlyPaymentsForMonth,
  listMonthlySalaryDatesByCuratorInRange,
  listEntriesForDate,
  saveCuratorTariffs,
  sumEntryRubByCuratorInRange,
  sumEntryRubByDateInRange,
  updateWorkEntry,
  upsertCuratorMonthlyPayment,
} from "../../../lib/operations/curators-repository";

const manualWorkTypeSchema = z.enum(["RouteObjects", "NightInspection", "ReplacementShift", "MonthlySalary"]);

function rethrowCuratorEntryDbError(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    msg.includes("curator_work_entries_work_type_check") ||
    msg.includes("curator_work_entries_hours_check")
  ) {
    throw new Error(
      "Тип «Оклад по должности» не поддерживается базой данных. На сервере нужно применить миграции (npm run db:migrate).",
    );
  }
  throw err instanceof Error ? err : new Error(msg);
}

function monthBoundsFromYearMonthIndex0(year: number, monthIndex0: number): { start: string; endExclusive: string } {
  const m1 = monthIndex0 + 1;
  const start = `${String(year).padStart(4, "0")}-${String(m1).padStart(2, "0")}-01`;
  const next = monthIndex0 === 11 ? { y: year + 1, m1: 1 } : { y: year, m1: m1 + 1 };
  const endExclusive = `${String(next.y).padStart(4, "0")}-${String(next.m1).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

export async function createCuratorAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const firstName = z.string().trim().min(1).max(120).parse(formData.get("firstName"));
  const lastName = z.string().trim().min(1).max(120).parse(formData.get("lastName"));

  await createCurator({ firstName, lastName });
  revalidatePath("/admin/curators");
  revalidatePath("/guards");
  redirect("/admin/curators");
}

export async function deleteCuratorAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const id = z.string().uuid().parse(formData.get("id"));
  await deleteCurator(id);
  revalidatePath("/admin/curators");
  redirect("/admin/curators");
}

const addEntrySchema = z.object({
  curatorId: z.string().uuid(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workType: manualWorkTypeSchema,
  hoursRaw: z.string().optional().nullable(),
  isBaseIncluded: z.preprocess((val) => val === "on" || val === "true", z.boolean()).optional(),
  customHourlyRateRaw: z.string().optional().nullable(),
  monthlySalaryRubRaw: z.string().optional().nullable(),
});

export async function addCuratorWorkEntryAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const parsed = addEntrySchema.parse({
    curatorId: formData.get("curatorId"),
    workDate: formData.get("workDate"),
    workType: formData.get("workType"),
    hoursRaw: formData.get("hours"),
    isBaseIncluded: formData.get("isBaseIncluded"),
    customHourlyRateRaw: formData.get("customHourlyRate"),
    monthlySalaryRubRaw: formData.get("monthlySalaryRub"),
  });

  const workType = parsed.workType as CuratorWorkType;
  let hours: number | null = null;
  let amountRub: number;

  if (workType === "NightInspection" || workType === "MonthlySalary") {
    hours = null;
  } else {
    const h = z.coerce.number().positive().max(72).parse(parsed.hoursRaw ?? "");
    hours = Math.round(h * 100) / 100;
  }

  const isBaseIncluded = parsed.isBaseIncluded ?? true;
  const customHourlyRate = parsed.customHourlyRateRaw ? z.coerce.number().min(0).parse(parsed.customHourlyRateRaw) : null;
  const monthlySalaryRub =
    parsed.monthlySalaryRubRaw && String(parsed.monthlySalaryRubRaw).trim() !== ""
      ? z.coerce.number().int().min(1).max(9_999_999).parse(parsed.monthlySalaryRubRaw)
      : null;

  if (workType === "MonthlySalary") {
    if (monthlySalaryRub == null) throw new Error("Укажите сумму оклада");
    const existingSalaryDate = await findMonthlySalaryDateInMonth(parsed.curatorId, parsed.workDate);
    if (existingSalaryDate) {
      throw new Error(
        `Оклад за этот месяц уже начислен ${formatDisplayDateFromIso(existingSalaryDate)}`,
      );
    }
    amountRub = monthlySalaryRub;
  } else {
    const tariffs = await getCuratorTariffs();
    amountRub = computeCuratorEntryRub(workType, hours, tariffs, {
      isBaseIncluded,
      customHourlyRate,
    });
    if (amountRub <= 0 && workType !== "NightInspection") {
      throw new Error("Некорректные часы для расчёта суммы");
    }
  }

  try {
    await createWorkEntry({
      curatorId: parsed.curatorId,
      workDate: parsed.workDate,
      workType,
      hours,
      amountRub,
      createdByUserId: session.user.id,
      isBaseIncluded: workType === "RouteObjects" ? isBaseIncluded : true,
      customHourlyRate,
    });
  } catch (err) {
    rethrowCuratorEntryDbError(err);
  }
}

const updateEntrySchema = addEntrySchema.extend({
  id: z.string().uuid(),
});

export async function updateCuratorWorkEntryAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const parsed = updateEntrySchema.parse({
    id: formData.get("id"),
    curatorId: formData.get("curatorId"),
    workDate: formData.get("workDate"),
    workType: formData.get("workType"),
    hoursRaw: formData.get("hours"),
    isBaseIncluded: formData.get("isBaseIncluded"),
    customHourlyRateRaw: formData.get("customHourlyRate"),
    monthlySalaryRubRaw: formData.get("monthlySalaryRub"),
  });

  const workType = parsed.workType as CuratorWorkType;
  let hours: number | null = null;

  if (workType === "NightInspection" || workType === "MonthlySalary") {
    hours = null;
  } else {
    const h = z.coerce.number().positive().max(72).parse(parsed.hoursRaw ?? "");
    hours = Math.round(h * 100) / 100;
  }

  const isBaseIncluded = parsed.isBaseIncluded ?? true;
  const customHourlyRate = parsed.customHourlyRateRaw ? z.coerce.number().min(0).parse(parsed.customHourlyRateRaw) : null;
  const monthlySalaryRub =
    parsed.monthlySalaryRubRaw && String(parsed.monthlySalaryRubRaw).trim() !== ""
      ? z.coerce.number().int().min(1).max(9_999_999).parse(parsed.monthlySalaryRubRaw)
      : null;

  const existing = await getWorkEntryById(parsed.id);
  if (!existing) throw new Error("Запись не найдена");

  let amountRub: number;
  const isSchedule = existing.shiftId != null && isScheduleCuratorWorkType(existing.workType);

  if (isSchedule) {
    hours = existing.hours;
    if (customHourlyRate != null && hours != null && hours > 0) {
      amountRub = Math.round(customHourlyRate * hours);
    } else {
      const amountRaw = formData.get("amountRub");
      amountRub = amountRaw != null && String(amountRaw).trim() !== ""
        ? z.coerce.number().min(0).parse(amountRaw)
        : existing.amountRub;
    }
    await updateWorkEntry({
      id: parsed.id,
      workType: existing.workType,
      hours,
      amountRub,
      isBaseIncluded: true,
      customBaseRub: null,
      customHourlyRate,
      isAdminLocked: true,
    });
  } else if (workType === "MonthlySalary") {
    if (monthlySalaryRub == null) throw new Error("Укажите сумму оклада");
    const existingSalaryDate = await findMonthlySalaryDateInMonth(
      parsed.curatorId,
      parsed.workDate,
      parsed.id,
    );
    if (existingSalaryDate) {
      throw new Error(
        `Оклад за этот месяц уже начислен ${formatDisplayDateFromIso(existingSalaryDate)}`,
      );
    }
    amountRub = monthlySalaryRub;
    await updateWorkEntry({
      id: parsed.id,
      workType,
      hours: null,
      amountRub,
      isBaseIncluded: true,
      customBaseRub: null,
      customHourlyRate: null,
    });
  } else {
    const tariffs = await getCuratorTariffs();
    amountRub = computeCuratorEntryRub(workType, hours, tariffs, {
      isBaseIncluded,
      customHourlyRate,
    });
    await updateWorkEntry({
      id: parsed.id,
      workType,
      hours,
      amountRub,
      isBaseIncluded,
      customBaseRub: null,
      customHourlyRate,
    });
  }

}

const tariffIntSchema = z.coerce.number().int().min(0).max(9_999_999);

export async function updateCuratorTariffsAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const returnDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("returnDate"));

  const parsed = z
    .object({
      routeBaseRub: tariffIntSchema,
      routeHourlyRub: tariffIntSchema,
      nightInspectionRub: tariffIntSchema,
      replacementHourlyRub: tariffIntSchema,
      scheduleRegularHourlyRub: tariffIntSchema,
    })
    .parse({
      routeBaseRub: formData.get("routeBaseRub"),
      routeHourlyRub: formData.get("routeHourlyRub"),
      nightInspectionRub: formData.get("nightInspectionRub"),
      replacementHourlyRub: formData.get("replacementHourlyRub"),
      scheduleRegularHourlyRub: formData.get("scheduleRegularHourlyRub"),
    });

  await saveCuratorTariffs(parsed);
  revalidatePath("/admin/curators");
  redirect(`/admin/curators?date=${encodeURIComponent(returnDate)}`);
}

export async function deleteCuratorWorkEntryAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const entryId = z.string().uuid().parse(formData.get("entryId"));
  const workDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("workDate"));

  await deleteCuratorWorkEntryById(entryId);
}

export async function fetchCuratorMonthAggregatesAction(
  year: number,
  monthIndex0: number,
): Promise<{
  sumsByDate: Record<string, number>;
  rubByCuratorId: Record<string, number>;
  paymentsByCuratorId: Record<string, { isPaid: boolean; paidAmountRub: number }>;
  monthlySalaryIsoByCuratorId: Record<string, string>;
}> {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const { start, endExclusive: end } = monthBoundsFromYearMonthIndex0(year, monthIndex0);
  const [byDate, byCurator, payments, monthlySalaryByCurator] = await Promise.all([
    sumEntryRubByDateInRange(start, end),
    sumEntryRubByCuratorInRange(start, end),
    listCuratorMonthlyPaymentsForMonth(year, monthIndex0),
    listMonthlySalaryDatesByCuratorInRange(start, end),
  ]);
  return {
    sumsByDate: Object.fromEntries(byDate.map((r) => [r.workDate, r.totalRub])),
    rubByCuratorId: Object.fromEntries(byCurator.map((r) => [r.curatorId, r.totalRub])),
    paymentsByCuratorId: Object.fromEntries(
      payments.map((r) => [r.curatorId, { isPaid: r.isPaid, paidAmountRub: r.paidAmountRub }]),
    ),
    monthlySalaryIsoByCuratorId: monthlySalaryByCurator,
  };
}

export async function updateCuratorMonthlyPaymentAction(input: {
  curatorId: string;
  year: number;
  monthIndex0: number;
  isPaid: boolean;
  paidAmountRub: number;
}): Promise<void> {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const parsed = z
    .object({
      curatorId: z.string().uuid(),
      year: z.number().int().min(2000).max(2100),
      monthIndex0: z.number().int().min(0).max(11),
      isPaid: z.boolean(),
      paidAmountRub: z.number().int().min(0).max(99_999_999),
    })
    .parse(input);

  await upsertCuratorMonthlyPayment(parsed);
  revalidatePath("/admin/curators");
}

export async function backfillCuratorShiftsAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const fromDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("fromDate") ?? "2026-04-01");
  const returnDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(formData.get("returnDate") ?? fromDate);
  const count = await backfillCuratorShiftEntries(fromDate, session.user.id);
  revalidatePath("/admin/curators");
  redirect(`/admin/curators?date=${encodeURIComponent(returnDate)}&backfill=${count}`);
}

export async function fetchCuratorDayEntriesAction(
  workDate: string,
): Promise<
  Array<{
    id: string;
    curatorId: string;
    curatorName: string;
    workType: CuratorWorkType;
    hours: number | null;
    amountRub: number;
    isBaseIncluded: boolean;
    customHourlyRate: number | null;
    shiftId: string | null;
    objectId: string | null;
    description: string;
    paymentFormula: string;
    ruleName: string | null;
    objectHourlyRateRub: number | null;
    isAdminLocked: boolean;
  }>
> {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(workDate);
  const rows = await listEntriesForDate(workDate);
  return rows.map((r) => ({
    id: r.id,
    curatorId: r.curatorId,
    curatorName: `${r.curatorLastName} ${r.curatorFirstName}`.trim(),
    workType: r.workType,
    hours: r.hours,
    amountRub: r.amountRub,
    isBaseIncluded: r.isBaseIncluded,
    customHourlyRate: r.customHourlyRate,
    shiftId: r.shiftId,
    objectId: r.objectId,
    description: r.description,
    paymentFormula: r.paymentFormula,
    ruleName: r.ruleName,
    objectHourlyRateRub: r.objectHourlyRateRub,
    isAdminLocked: r.isAdminLocked,
  }));
}
