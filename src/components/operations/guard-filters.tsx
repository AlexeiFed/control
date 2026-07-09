"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { dispatchGuardComplianceRemindersRefresh } from "../../lib/guards/compliance-reminders-refresh";
import {
  createGuardAction,
  deleteGuardAction,
} from "../../app/guards/actions";
import { Button, ButtonLink } from "../ui/button";
import { PhoneInput } from "../ui/phone-input";
import {
  uniformHeightOptions,
  uniformSizeLetterOptions,
  uniformSizeNumericOptions,
} from "../../lib/format/uniform";
import {
  emptyGuardRegistryTableFilters,
  filterGuardsForRegistryTable,
  type GuardRegistryTableFilters,
} from "../../lib/guards/guard-registry-filter";
import { toast } from "../../store/toast-store";
import type { GuardFilters as GuardFilterValues } from "../../lib/operations/guard-filters";
import type { GuardListRow } from "../../lib/operations/guards-repository";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import { guardPositionLabels, guardStatusLabels, guardStatusOptions } from "../../lib/operations/status-labels";
import type { GuardEmploymentType, GuardLicenseType, GuardPosition, GuardStatus } from "../../lib/scheduling/types";
import { GuardFormComplianceFields } from "./guard-form-compliance-fields";
import { GuardObjectsMultiPicker } from "./guard-objects-multi-picker";
import { GuardRegistryTableFiltersPanel } from "./guard-registry-table-filters";
import { GuardRegistryTable } from "./guard-registry-table";
import { GuardRegistryExportButton } from "./guard-registry-export-button";

type GuardFiltersProps = {
  guards: GuardListRow[];
  objects: ObjectListRow[];
  filters: GuardFilterValues;
  userId: string;
};

const statusClass = {
  Active: "text-status-active",
  Sick: "text-accent-danger",
  OnVacation: "text-accent-warning",
  Inactive: "text-status-inactive",
  Dismissed: "text-status-inactive",
} as const;

export function GuardFilters({ guards, objects, filters, userId }: GuardFiltersProps) {
  const router = useRouter();
  const [tableFilters, setTableFilters] = useState<GuardRegistryTableFilters>(() => ({
    ...emptyGuardRegistryTableFilters,
    query: filters.query,
    objectId: filters.objectId,
    status: filters.status,
  }));
  const [debouncedTableQuery, setDebouncedTableQuery] = useState(tableFilters.query);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [createStatus, setCreateStatus] = useState<GuardStatus>("Active");
  const [createDismissedOn, setCreateDismissedOn] = useState("");
  const [createPosition, setCreatePosition] = useState<GuardPosition>("Guard");
  const [createEmploymentType, setCreateEmploymentType] = useState<GuardEmploymentType>("Unemployed");
  const [createLicenseType, setCreateLicenseType] = useState<GuardLicenseType>("None");
  const [createObjectIds, setCreateObjectIds] = useState<string[]>([]);
  const [createObjectSearch, setCreateObjectSearch] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createFormKey, setCreateFormKey] = useState(0);
  const [isCreating, startCreate] = useTransition();
  const [rowObjectSearch, setRowObjectSearch] = useState("");
  const [deleteGuardTarget, setDeleteGuardTarget] = useState<{ id: string; name: string } | null>(null);
  const sectionRef = useRef<HTMLElement | null>(null);

  const resetCreateForm = useCallback(() => {
    setCreateStatus("Active");
    setCreateDismissedOn("");
    setCreatePosition("Guard");
    setCreateEmploymentType("Unemployed");
    setCreateLicenseType("None");
    setCreateObjectIds([]);
    setCreateObjectSearch("");
    setCreateLastName("");
    setCreateFirstName("");
    setCreateFormKey((key) => key + 1);
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedTableQuery(tableFilters.query);
    }, 150);
    return () => clearTimeout(timeout);
  }, [tableFilters.query]);

  const activeTableFilters = useMemo(
    () => ({ ...tableFilters, query: debouncedTableQuery }),
    [tableFilters, debouncedTableQuery],
  );

  const filteredGuards = useMemo(
    () => filterGuardsForRegistryTable(guards, activeTableFilters),
    [activeTableFilters, guards],
  );

  const displayedGuards = useMemo(() => {
    const prefix = createLastName.trim().toLowerCase();
    if (!prefix) return filteredGuards;
    const narrowed = filteredGuards.filter((g) => g.lastName.toLowerCase().startsWith(prefix));
    return [...narrowed].sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName, "ru");
      if (ln !== 0) return ln;
      return a.firstName.localeCompare(b.firstName, "ru");
    });
  }, [filteredGuards, createLastName]);

  function completeCreateLastNameFromRegistry() {
    const prefix = createLastName.trim().toLowerCase();
    if (!prefix) return;
    const narrowed = filteredGuards.filter((g) => g.lastName.toLowerCase().startsWith(prefix));
    if (narrowed.length === 0) return;
    const sorted = [...narrowed].sort((a, b) => {
      const ln = a.lastName.localeCompare(b.lastName, "ru");
      if (ln !== 0) return ln;
      return a.firstName.localeCompare(b.firstName, "ru");
    });
    const pick = sorted[0];
    if (pick) setCreateLastName(pick.lastName);
  }

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest("[data-dropdown]")) return;
      if (!sectionRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="min-w-0 max-w-full overflow-hidden rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
      onClickCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && !target.closest("[data-dropdown]")) {
          setOpenMenu(null);
        }
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-accent-primary">Охранники</p>
          <h1 className="mt-3 text-3xl font-semibold">Реестр охранников</h1>
          <p className="mt-2 text-sm text-app-muted">
            Создание охранника, фильтр реестра и быстрые действия в строке таблицы.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonLink href="/dashboard" variant="secondary">
            Назад
          </ButtonLink>
          <GuardRegistryExportButton />
        </div>
      </div>

      <form
        key={createFormKey}
        className="mt-4 grid gap-3 rounded-card border border-app-border bg-app-elevated p-4 md:grid-cols-2 lg:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          createObjectIds.forEach((id) => fd.append("assignObjectIds", id));
          startCreate(async () => {
            const result = await createGuardAction(fd);
            if (!result.ok) {
              toast({
                title: "Не удалось создать охранника",
                message: result.error,
                variant: "error",
                durationMs: 6500,
              });
              return;
            }
            toast({
              title: "Охранник добавлен",
              message: "Форма очищена — можно создать следующего",
              variant: "success",
              durationMs: 4000,
            });
            resetCreateForm();
            dispatchGuardComplianceRemindersRefresh();
            router.refresh();
          });
        }}
      >
        <input
          required
          name="lastName"
          placeholder="Фамилия"
          autoComplete="family-name"
          value={createLastName}
          onChange={(e) => setCreateLastName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            completeCreateLastNameFromRegistry();
          }}
          className="h-12 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <input
          required
          name="firstName"
          placeholder="Имя"
          autoComplete="given-name"
          value={createFirstName}
          onChange={(e) => setCreateFirstName(e.target.value)}
          className="h-12 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <input
          name="middleName"
          placeholder="Отчество"
          autoComplete="additional-name"
          className="h-12 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <label className="flex h-12 flex-col justify-center gap-0.5 text-xs text-app-muted">
          <span>Дата рождения</span>
          <input
            type="date"
            name="birthDate"
            className="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
          />
        </label>
        <PhoneInput
          name="phone"
          className="h-12 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <PhoneInput
          name="contactPhone"
          ariaLabel="Контактный телефон"
          className="h-12 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <input type="hidden" name="status" value={createStatus} />
        {createStatus === "Dismissed" ? (
          <label className="flex h-12 flex-col justify-center gap-0.5 text-xs text-app-muted">
            <span>Дата увольнения</span>
            <input
              type="date"
              name="dismissedOn"
              required
              value={createDismissedOn}
              onChange={(e) => setCreateDismissedOn(e.target.value)}
              className="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
            />
          </label>
        ) : null}
        <div className="relative" data-dropdown="create-status">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-start bg-app-bg font-medium"
            onClick={() => setOpenMenu((current) => (current === "create-status" ? null : "create-status"))}
          >
            <span className={statusClass[createStatus]}>{guardStatusLabels[createStatus]}</span>
          </Button>
          {openMenu === "create-status" ? (
            <div className="absolute z-10 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              {guardStatusOptions.map((statusOption) => (
                <Button
                  key={statusOption.value}
                  type="button"
                  variant="menu"
                  size="sm"
                  className={`mb-1 justify-start ${statusClass[statusOption.value]}`}
                  onClick={() => {
                    setCreateStatus(statusOption.value);
                    if (statusOption.value !== "Dismissed") setCreateDismissedOn("");
                    setOpenMenu(null);
                  }}
                >
                  {statusOption.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <GuardObjectsMultiPicker
          objects={objects}
          selectedIds={createObjectIds}
          onSelectedIdsChange={setCreateObjectIds}
          menuKey="create-object"
          openMenu={openMenu}
          onOpenMenuChange={setOpenMenu}
          search={createObjectSearch}
          onSearchChange={setCreateObjectSearch}
        />
        <label className="flex h-12 flex-col justify-center gap-0.5 text-xs text-app-muted">
          <span>Должность</span>
          <select
            name="position"
            value={createPosition}
            onChange={(event) => setCreatePosition(event.target.value as GuardPosition)}
            className="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
          >
            <option value="Guard">{guardPositionLabels.Guard}</option>
            <option value="ShiftLead">{guardPositionLabels.ShiftLead}</option>
            <option value="Curator">{guardPositionLabels.Curator}</option>
          </select>
        </label>
        <GuardFormComplianceFields
          compact
          employmentType={createEmploymentType}
          onEmploymentTypeChange={setCreateEmploymentType}
          licenseType={createLicenseType}
          onLicenseTypeChange={setCreateLicenseType}
        />
        <label className="flex items-center gap-2 text-sm text-app-muted lg:col-span-1">
          <input type="checkbox" name="isTrainee" value="on" className="size-4" />
          Стажёр
        </label>
        <label className="flex items-center gap-2 text-sm text-app-muted lg:col-span-1">
          <input type="checkbox" name="hasCar" value="on" className="size-4" />
          Авто
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-app-muted lg:col-span-1">
          <span>Стажировка до</span>
          <input
            type="date"
            name="traineeUntil"
            className="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
          />
        </label>
        <label className="flex h-12 flex-col justify-center gap-0.5 text-xs text-app-muted">
          <span>Размер формы</span>
          <select
            name="uniformSize"
            defaultValue=""
            className="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
          >
            <option value="">—</option>
            <optgroup label="Буквенный">
              {uniformSizeLetterOptions.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </optgroup>
            <optgroup label="Числовой (44–70)">
              {uniformSizeNumericOptions.map((size) => (
                <option key={size.value} value={size.value}>
                  {size.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <label className="flex h-12 flex-col justify-center gap-0.5 text-xs text-app-muted">
          <span>Рост</span>
          <select
            name="uniformHeight"
            defaultValue=""
            className="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
          >
            <option value="">—</option>
            {uniformHeightOptions.map((height) => (
              <option key={height} value={height}>
                {height}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="submit"
          size="lg"
          className="lg:col-span-2"
          disabled={isCreating}
        >
          {isCreating ? "Создание…" : "+ охранник"}
        </Button>
      </form>

      <GuardRegistryTableFiltersPanel
        filters={tableFilters}
        onChange={(patch) => setTableFilters((current) => ({ ...current, ...patch }))}
        onReset={() => setTableFilters(emptyGuardRegistryTableFilters)}
        objects={objects}
        matchedCount={displayedGuards.length}
        totalCount={guards.length}
      />

      <GuardRegistryTable
        userId={userId}
        guards={displayedGuards}
        objects={objects}
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        rowObjectSearch={rowObjectSearch}
        setRowObjectSearch={setRowObjectSearch}
        onDeleteGuard={setDeleteGuardTarget}
      />

      {deleteGuardTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="guard-delete-title"
        >
          <div className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 shrink-0 text-accent-warning" />
              <div>
                <h2 id="guard-delete-title" className="text-lg font-semibold">
                  Удалить охранника?
                </h2>
                <p className="mt-2 text-sm text-app-muted">
                  {deleteGuardTarget.name} — будут удалены назначения на объекты и все смены этого охранника. Действие
                  необратимо.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setDeleteGuardTarget(null)}
                variant="secondary"
              >
                Отмена
              </Button>
              <form action={deleteGuardAction}>
                <input type="hidden" name="guardId" value={deleteGuardTarget.id} />
                <Button
                  type="submit"
                  variant="danger"
                >
                  Удалить
                </Button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
