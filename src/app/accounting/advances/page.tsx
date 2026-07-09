import { AdvancesView } from "../../../components/accounting/advances-view";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { getKhabarovskComponents } from "../../../lib/format/display-date";
import { listGuardAdvancesForMonth } from "../../../lib/operations/advances-repository";
import { listGuards } from "../../../lib/operations/guards-repository";

type AdvancesPageProps = {
  searchParams?: Promise<{ month?: string }>;
};

export default async function AdvancesPage({ searchParams }: AdvancesPageProps) {
  const session = await requireSession();
  assertPermission(session.user.role, "advances:manage");

  const filters = (await searchParams) ?? {};
  const month = normalizeMonth(filters.month) ?? currentMonthKey();
  const { year, monthIndex0 } = parseMonthKey(month);

  const [advances, guards] = await Promise.all([
    listGuardAdvancesForMonth(year, monthIndex0),
    listGuards({ status: "Active" }),
  ]);

  return (
    <main className="min-h-screen bg-app-bg p-4 text-app-text sm:p-6">
      <AdvancesView
        monthKey={month}
        advances={advances}
        guardOptions={guards.map((g) => ({
          id: g.id,
          name: `${g.lastName} ${g.firstName}`.trim(),
        }))}
        canManage
        issuerName={session.user.name}
      />
    </main>
  );
}

function normalizeMonth(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}$/.test(trimmed)) return undefined;
  const [, monthStr] = trimmed.split("-");
  const month = Number(monthStr);
  if (month < 1 || month > 12) return undefined;
  return trimmed;
}

function currentMonthKey(): string {
  const kh = getKhabarovskComponents(new Date());
  return `${kh.year}-${String(kh.month0 + 1).padStart(2, "0")}`;
}

function parseMonthKey(value: string): { year: number; monthIndex0: number } {
  const [yearStr, monthStr] = value.split("-");
  return { year: Number(yearStr), monthIndex0: Number(monthStr) - 1 };
}
