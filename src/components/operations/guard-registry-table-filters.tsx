"use client";

import type { ReactNode } from "react";
import { Button } from "../ui/button";
import type { GuardRegistryTableFilters, YesNoFilter } from "../../lib/guards/guard-registry-filter";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import {
  guardLicenseLabels,
  guardPositionLabels,
  guardStatusLabels,
  guardStatusOptions,
} from "../../lib/operations/status-labels";
import type { GuardLicenseType, GuardPosition, GuardStatus } from "../../lib/scheduling/types";

const labelClass = "text-[10px] leading-none text-app-muted";
const fieldClass =
  "h-8 w-full min-w-0 rounded-button border border-app-border bg-app-bg px-2 text-xs outline-none focus:border-accent-primary";

type GuardRegistryTableFiltersProps = {
  filters: GuardRegistryTableFilters;
  onChange: (patch: Partial<GuardRegistryTableFilters>) => void;
  onReset: () => void;
  objects: ObjectListRow[];
  matchedCount: number;
  totalCount: number;
};

function FilterCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-0.5">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export function GuardRegistryTableFiltersPanel({
  filters,
  onChange,
  onReset,
  objects,
  matchedCount,
  totalCount,
}: GuardRegistryTableFiltersProps) {
  return (
    <div className="mt-4 w-full rounded-card border border-app-border bg-app-elevated px-3 py-2.5">
      <div className="flex w-full items-center justify-between gap-2">
        <p className="text-xs font-medium text-app-text">Фильтр реестра</p>
        <p className="shrink-0 text-[10px] tabular-nums text-app-muted">
          {matchedCount} / {totalCount}
        </p>
      </div>

      <div className="mt-2 grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9 lg:items-end">
        <FilterCell label="Имя / фамилия">
          <input
            value={filters.query}
            onChange={(e) => onChange({ query: e.target.value })}
            placeholder="Поиск…"
            className={fieldClass}
          />
        </FilterCell>

        <FilterCell label="Должн.">
          <select
            value={filters.position}
            onChange={(e) => onChange({ position: e.target.value as GuardPosition | "" })}
            className={fieldClass}
          >
            <option value="">Все</option>
            <option value="Guard">{guardPositionLabels.Guard}</option>
            <option value="ShiftLead">{guardPositionLabels.ShiftLead}</option>
            <option value="Curator">{guardPositionLabels.Curator}</option>
          </select>
        </FilterCell>

        <FilterCell label="Уд.">
          <select
            value={filters.licenseType}
            onChange={(e) => onChange({ licenseType: e.target.value as GuardLicenseType | "" })}
            className={fieldClass}
          >
            <option value="">—</option>
            <option value="None">{guardLicenseLabels.None}</option>
            <option value="Licensed">{guardLicenseLabels.Licensed}</option>
          </select>
        </FilterCell>

        <FilterCell label="Труд.">
          <select
            value={filters.employed}
            onChange={(e) => onChange({ employed: e.target.value as YesNoFilter })}
            className={fieldClass}
          >
            <option value="">—</option>
            <option value="yes">да</option>
            <option value="no">нет</option>
          </select>
        </FilterCell>

        <FilterCell label="Авто">
          <select
            value={filters.hasCar}
            onChange={(e) => onChange({ hasCar: e.target.value as YesNoFilter })}
            className={fieldClass}
          >
            <option value="">—</option>
            <option value="yes">да</option>
            <option value="no">нет</option>
          </select>
        </FilterCell>

        <FilterCell label="Форма">
          <select
            value={filters.hasUniform}
            onChange={(e) => onChange({ hasUniform: e.target.value as YesNoFilter })}
            className={fieldClass}
          >
            <option value="">—</option>
            <option value="yes">да</option>
            <option value="no">нет</option>
          </select>
        </FilterCell>

        <FilterCell label="Статус">
          <select
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value as GuardStatus | "" })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {guardStatusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {guardStatusLabels[option.value]}
              </option>
            ))}
          </select>
        </FilterCell>

        <FilterCell label="Объект">
          <select
            value={filters.objectId}
            onChange={(e) => onChange({ objectId: e.target.value })}
            className={fieldClass}
          >
            <option value="">Все</option>
            {objects.map((object) => (
              <option key={object.id} value={object.id}>
                {object.name}
              </option>
            ))}
          </select>
        </FilterCell>

        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={`${labelClass} invisible select-none`}>—</span>
          <Button type="button" variant="secondary" size="sm" className="h-8 w-full px-2 text-xs" onClick={onReset}>
            Сброс
          </Button>
        </div>
      </div>
    </div>
  );
}
