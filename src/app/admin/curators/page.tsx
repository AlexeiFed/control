import { z } from "zod";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { monthBoundsFromIsoDate, todayIsoInKhabarovsk } from "../../../lib/curators/khabarovsk-date";
import {
  getCuratorTariffs,
  listCuratorMonthlyPaymentsForMonth,
  listMonthlySalaryDatesByCuratorInRange,
  listCuratorsWithTotals,
  listEntriesForDate,
  sumEntryRubByCuratorInRange,
  sumEntryRubByDateInRange,
} from "../../../lib/operations/curators-repository";
import { CuratorsDashboard } from "../../../components/admin/curators-dashboard";
import type { CuratorWorkType } from "../../../lib/curators/work-entry-amount";

type PageProps = {
  searchParams: Promise<{ date?: string }>;
};

export default async function AdminCuratorsPage({ searchParams }: PageProps) {
  const session = await requireSession();
  assertPermission(session.user.role, "curators:manage");

  const params = await searchParams;
  const todayIso = todayIsoInKhabarovsk();
  const dateParam = params.date;
  const selectedIso = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .safeParse(dateParam).success
    ? (dateParam as string)
    : todayIso;

  const selectedParts = selectedIso.split("-").map(Number);
  const viewYear = selectedParts[0]!;
  const viewM0 = selectedParts[1]! - 1;

  const [curators, tariffs] = await Promise.all([listCuratorsWithTotals(), getCuratorTariffs()]);
  const { start, endExclusive } = monthBoundsFromIsoDate(selectedIso);
  const [sumsRows, curatorMonthRows, paymentRows, monthlySalaryByCurator] = await Promise.all([
    sumEntryRubByDateInRange(start, endExclusive),
    sumEntryRubByCuratorInRange(start, endExclusive),
    listCuratorMonthlyPaymentsForMonth(viewYear, viewM0),
    listMonthlySalaryDatesByCuratorInRange(start, endExclusive),
  ]);
  const initialSumsByDate = Object.fromEntries(sumsRows.map((r) => [r.workDate, r.totalRub]));
  const initialRubByCuratorId = Object.fromEntries(curatorMonthRows.map((r) => [r.curatorId, r.totalRub]));
  const initialPaymentsByCuratorId = Object.fromEntries(
    paymentRows.map((r) => [r.curatorId, { isPaid: r.isPaid, paidAmountRub: r.paidAmountRub }]),
  );
  const entries = await listEntriesForDate(selectedIso);

  const initialDayEntries = entries.map((r) => ({
    id: r.id,
    curatorId: r.curatorId,
    curatorName: `${r.curatorLastName} ${r.curatorFirstName}`.trim(),
    workType: r.workType as CuratorWorkType,
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

  return (
    <CuratorsDashboard
      todayIso={todayIso}
      initialSelectedIso={selectedIso}
      curators={curators.map((c) => ({
        id: c.id,
        guardId: c.guardId,
        firstName: c.firstName,
        lastName: c.lastName,
        totalRub: c.totalRub,
      }))}
      initialSumsByDate={initialSumsByDate}
      initialRubByCuratorId={initialRubByCuratorId}
      initialPaymentsByCuratorId={initialPaymentsByCuratorId}
      initialMonthlySalaryIsoByCuratorId={monthlySalaryByCurator}
      initialDayEntries={initialDayEntries}
      initialTariffs={tariffs}
    />
  );
}

export const metadata = {
  title: "Кураторы",
  description: "Учёт работ кураторов и начисления",
};
