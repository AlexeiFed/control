import { GuardFiltersLazy } from "../../components/operations/guard-filters-lazy";
import { assertPermission } from "../../lib/auth/rbac";
import { requireSession } from "../../lib/auth/session";
import { normalizeGuardFilters } from "../../lib/operations/guard-filters";
import { listGuards } from "../../lib/operations/guards-repository";
import { listObjects } from "../../lib/operations/objects-repository";

type GuardsPageProps = {
  searchParams?: Promise<{
    query?: string;
    objectId?: string;
    status?: string;
  }>;
};

export default async function GuardsPage({ searchParams }: GuardsPageProps) {
  const params = await searchParams;
  const filters = normalizeGuardFilters(params ?? {});

  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");
  const [guards, objects] = await Promise.all([listGuards(), listObjects()]);

  return (
    <main
      className="min-h-screen overflow-x-hidden bg-app-bg p-6 text-app-text"
      style={{
        paddingTop:
          "calc(1.5rem + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
      }}
    >
      <GuardFiltersLazy
        guards={guards}
        objects={objects}
        filters={filters}
        userId={session.user.id}
      />
    </main>
  );
}
