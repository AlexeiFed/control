import { ShieldPlus } from "lucide-react";
import { Button } from "../ui/button";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import { guardStatusLabels, objectStatusLabels } from "../../lib/operations/status-labels";
import type { Guard, SecurityObject } from "../../lib/scheduling/types";

type ObjectSelectedViewProps = {
  object: SecurityObject;
  assignedGuards: Guard[];
  currentRole: Role;
};

const statusClass = {
  Active: "text-status-active",
  Inactive: "text-status-inactive",
} as const;

export function ObjectSelectedView({
  object,
  assignedGuards,
  currentRole,
}: ObjectSelectedViewProps) {
  const canManageGuards = hasPermission(currentRole, "guards:manage");

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-accent-primary">Контроль объекта</p>
          <h1 className="mt-3 text-3xl font-semibold">{object.name}</h1>
          <p className="mt-2 text-sm text-app-muted">{object.address}</p>
          <span className={`mt-4 inline-block text-sm font-semibold ${statusClass[object.status]}`}>
            {objectStatusLabels[object.status]}
          </span>
        </div>

        {canManageGuards ? (
          <Button>
            <ShieldPlus className="size-4" />
            Добавить охранника
          </Button>
        ) : null}
      </div>

      <div className="mt-6 grid gap-3">
        {assignedGuards.map((guard) => (
          <div
            key={guard.id}
            className="flex items-center justify-between rounded-button border border-app-border bg-app-elevated px-4 py-3"
          >
            <span>{guard.name}</span>
            <span className="text-sm text-app-muted">{guardStatusLabels[guard.status]}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
