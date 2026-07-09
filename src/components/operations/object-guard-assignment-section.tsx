"use client";

import { Shield } from "lucide-react";
import type { GuardSchedulePickerRow } from "../../lib/operations/guards-repository";

type ObjectGuardAssignmentSectionProps = {
  assignedGuardIds: string[];
  guardSearch: string;
  onGuardSearchChange: (value: string) => void;
  onGuardSearchFocus: () => void;
  pickerGuards: GuardSchedulePickerRow[] | null;
  pickerGuardsLoading: boolean;
  filteredGuards: GuardSchedulePickerRow[];
  onToggleGuard: (guardId: string, checked: boolean) => void | Promise<void>;
};

export function ObjectGuardAssignmentSection({
  assignedGuardIds,
  guardSearch,
  onGuardSearchChange,
  onGuardSearchFocus,
  pickerGuards,
  pickerGuardsLoading,
  filteredGuards,
  onToggleGuard,
}: ObjectGuardAssignmentSectionProps) {
  return (
    <section className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
      <div className="mb-4 flex items-center gap-2 text-accent-primary">
        <Shield className="size-5" />
        <h2 className="text-lg font-semibold">Охранники объекта</h2>
      </div>
      <div className="mb-4">
        <input
          value={guardSearch}
          onChange={(e) => onGuardSearchChange(e.target.value)}
          onFocus={onGuardSearchFocus}
          placeholder="Поиск охранника..."
          className="w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
      </div>
      <div className="max-h-[400px] space-y-1 overflow-auto pr-2">
        {pickerGuardsLoading && pickerGuards === null ? (
          <p className="p-2 text-sm text-app-muted">Загрузка списка охранников…</p>
        ) : pickerGuards === null ? (
          <p className="p-2 text-sm text-app-muted">Кликните в поле поиска, чтобы загрузить список.</p>
        ) : filteredGuards.length === 0 ? (
          <p className="p-2 text-sm text-app-muted">Ничего не найдено.</p>
        ) : (
          filteredGuards.map((guard) => {
            const isAssigned = assignedGuardIds.includes(guard.id);
            return (
              <label
                key={guard.id}
                className="flex cursor-pointer items-center gap-3 rounded-button p-2 transition hover:bg-app-elevated"
              >
                <input
                  type="checkbox"
                  checked={isAssigned}
                  onChange={(e) => void onToggleGuard(guard.id, e.target.checked)}
                  className="size-4 rounded border-app-border bg-app-bg text-accent-primary focus:ring-accent-primary"
                />
                <span className="text-sm">
                  {guard.lastName} {guard.firstName}
                </span>
              </label>
            );
          })
        )}
      </div>
    </section>
  );
}
