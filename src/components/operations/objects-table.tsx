"use client";

import { AlertTriangle, Edit2, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  createObjectAction,
  deleteObjectAction,
  saveShiftTemplatesAction,
  setObjectGuardsAction,
  updateObjectStatusAction,
} from "../../app/objects/actions";
import { Button, ButtonLink } from "../ui/button";
import { hasPermission, type Role } from "../../lib/auth/rbac";
import type { GuardListRow } from "../../lib/operations/guards-repository";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import { ObjectRateRulesPanel } from "./object-rate-rules-panel";
import { objectStatusLabels, objectStatusOptions, guardStatusLabels } from "../../lib/operations/status-labels";

const weekdayShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

type ObjectsTableProps = {
  objects: ObjectListRow[];
  guards: GuardListRow[];
  currentRole: Role;
  templateDefaultsByObjectId: Record<string, number[]>;
  templateReinforcementDefaultsByObjectId: Record<string, number[]>;
  templateEffectiveFrom: string;
  rateRulesByObjectId: Record<string, ObjectRateRuleRecord[]>;
};

const statusClass = {
  Active: "text-status-active",
  Inactive: "text-status-inactive",
} as const;

export function ObjectsTable({
  objects,
  guards,
  currentRole,
  templateDefaultsByObjectId,
  templateReinforcementDefaultsByObjectId,
  templateEffectiveFrom,
  rateRulesByObjectId,
}: ObjectsTableProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"Active" | "Inactive" | "">("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [openTemplateObjectId, setOpenTemplateObjectId] = useState<string | null>(null);
  const [openRatesObjectId, setOpenRatesObjectId] = useState<string | null>(null);
  const [guardSearch, setGuardSearch] = useState("");
  const [debouncedGuardSearch, setDebouncedGuardSearch] = useState("");
  const [selectedByObject, setSelectedByObject] = useState<Record<string, string[]>>({});
  const [createStatus, setCreateStatus] = useState<"Active" | "Inactive">("Active");
  const [deleteObjectTarget, setDeleteObjectTarget] = useState<{ id: string; name: string } | null>(null);
  const [openTemplateReinforcement, setOpenTemplateReinforcement] = useState<Record<string, number[]>>({});
  const sectionRef = useRef<HTMLElement | null>(null);
  const canEditTemplates = hasPermission(currentRole, "scheduleTemplates:manage");
  const canManageRates = hasPermission(currentRole, "rates:manage");
  const colCount = 7 + (canEditTemplates ? 1 : 0) + (canManageRates ? 1 : 0);

  const guardStatusClass = {
    Active: "text-status-active",
    Sick: "text-accent-danger",
    OnVacation: "text-accent-warning",
    Inactive: "text-status-inactive",
    Dismissed: "text-status-inactive",
  } as const;

  const filteredObjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return objects.filter((object) => {
      const matchesQuery = normalized
        ? object.name.toLowerCase().includes(normalized) || object.address.toLowerCase().includes(normalized)
        : true;
      const matchesStatus = statusFilter ? object.status === statusFilter : true;
      return matchesQuery && matchesStatus;
    });
  }, [objects, query, statusFilter]);

  const filteredGuards = useMemo(() => {
    const normalized = debouncedGuardSearch.trim().toLowerCase();
    if (!normalized) return guards;
    return guards.filter((guard) =>
      `${guard.lastName} ${guard.firstName}`.toLowerCase().includes(normalized),
    );
  }, [debouncedGuardSearch, guards]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedGuardSearch(guardSearch);
    }, 150);
    return () => clearTimeout(timeout);
  }, [guardSearch]);

  useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-dropdown]")) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => document.removeEventListener("mousedown", onDocumentMouseDown);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="rounded-card border border-app-border bg-app-surface p-3 shadow-glow md:p-6"
      onClickCapture={(event) => {
        const target = event.target;
        if (target instanceof Element && !target.closest("[data-dropdown]")) {
          setOpenMenu(null);
        }
      }}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.24em] text-accent-primary">Объекты</p>
          <h1 className="mt-3 text-3xl font-semibold">Реестр объектов</h1>
          <p className="mt-2 text-sm text-app-muted">
            Фильтры, inline-статус и массовое назначение охранников.
          </p>
        </div>
        <ButtonLink href="/dashboard" variant="secondary" className="w-full md:w-auto">
          Назад
        </ButtonLink>
      </div>

      <div className="mt-6 grid gap-3 rounded-card border border-app-border bg-app-elevated p-4 md:grid-cols-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск по названию или адресу"
          className="h-12 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <div className="relative" data-dropdown="object-filter-status">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-start bg-app-bg font-medium"
            onClick={() =>
              setOpenMenu((current) =>
                current === "object-filter-status" ? null : "object-filter-status",
              )
            }
          >
            {statusFilter ? objectStatusLabels[statusFilter] : "Все статусы"}
          </Button>
          {openMenu === "object-filter-status" ? (
            <div className="absolute z-10 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              <Button
                type="button"
                variant="menu"
                size="sm"
                className="mb-1 justify-start"
                onClick={() => {
                  setStatusFilter("");
                  setOpenMenu(null);
                }}
              >
                Все статусы
              </Button>
              {objectStatusOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="menu"
                  size="sm"
                  className={`mb-1 justify-start ${statusClass[option.value]}`}
                  onClick={() => {
                    setStatusFilter(option.value);
                    setOpenMenu(null);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <form action={createObjectAction} className="mt-4 grid gap-3 rounded-card border border-app-border bg-app-elevated p-4 md:grid-cols-4">
        <input
          required
          name="name"
          placeholder="Название объекта"
          className="h-12 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <input
          required
          name="address"
          placeholder="Адрес"
          className="h-12 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
        />
        <input type="hidden" name="status" value={createStatus} />
        <div className="relative" data-dropdown="create-object-status">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full justify-start bg-app-bg font-medium"
            onClick={() =>
              setOpenMenu((current) =>
                current === "create-object-status" ? null : "create-object-status",
              )
            }
          >
            <span className={statusClass[createStatus]}>{objectStatusLabels[createStatus]}</span>
          </Button>
          {openMenu === "create-object-status" ? (
            <div className="absolute z-10 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
              {objectStatusOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="menu"
                  size="sm"
                  className={`mb-1 justify-start ${statusClass[option.value]}`}
                  onClick={() => {
                    setCreateStatus(option.value);
                    setOpenMenu(null);
                  }}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="bg-accent-primary hover:bg-accent-primary-hover">
          Добавить объект
        </Button>
      </form>

      <div className="mt-6 grid gap-3 md:hidden">
        {filteredObjects.map((object) => {
          const selectedGuards = selectedByObject[object.id] ?? object.guardIds;
          const guardsOpen = openMenu === `object-guards-${object.id}`;
          const statusOpen = openMenu === `object-status-${object.id}`;
          const templateOpen = canEditTemplates && openTemplateObjectId === object.id;
          const ratesOpen = canManageRates && openRatesObjectId === object.id;

          return (
            <article
              key={`mobile-${object.id}`}
              className="rounded-card border border-app-border bg-app-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <ButtonLink
                    href={`/objects/${object.id}`}
                    variant="ghost"
                    className="h-auto justify-start px-0 py-0 text-left font-semibold hover:bg-transparent hover:text-accent-primary"
                  >
                    {object.name}
                  </ButtonLink>
                  <p className="mt-1 break-words text-sm text-app-muted">{object.address}</p>
                </div>
                <span className={`shrink-0 text-xs font-semibold ${statusClass[object.status]}`}>
                  {objectStatusLabels[object.status]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-button border border-app-border bg-app-elevated p-2">
                  <span className="block text-app-muted">Охранники</span>
                  <strong className="mt-0.5 block tabular-nums">{object.guardsCount}</strong>
                </div>
                <div className="rounded-button border border-app-border bg-app-elevated p-2">
                  <span className="block text-app-muted">Текущая неделя</span>
                  <strong className="mt-0.5 block tabular-nums">
                    {object.weekShiftCount} смен / {object.weekGuardCount} охр.
                  </strong>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <ButtonLink href={`/objects/${object.id}`} variant="secondary" className="min-h-11">
                  Открыть
                </ButtonLink>
                <div className="relative" data-dropdown={`object-status-${object.id}`}>
                  <Button
                    type="button"
                    variant="outline"
                    className={`min-h-11 w-full ${statusClass[object.status]}`}
                    onClick={() =>
                      setOpenMenu((current) =>
                        current === `object-status-${object.id}` ? null : `object-status-${object.id}`,
                      )
                    }
                  >
                    Статус
                  </Button>
                  {statusOpen ? (
                    <div className="absolute right-0 z-20 mt-2 w-full min-w-44 rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
                      {objectStatusOptions.map((option) => (
                        <form key={option.value} action={updateObjectStatusAction}>
                          <input type="hidden" name="objectId" value={object.id} />
                          <input type="hidden" name="status" value={option.value} />
                          <Button
                            type="submit"
                            variant="menu"
                            size="sm"
                            className={`mb-1 justify-start ${statusClass[option.value]}`}
                          >
                            {option.label}
                          </Button>
                        </form>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant={guardsOpen ? "secondary" : "outline"}
                  className="min-h-11 w-full"
                  onClick={() => {
                    setOpenMenu(guardsOpen ? null : `object-guards-${object.id}`);
                    setGuardSearch("");
                    setSelectedByObject((current) =>
                      current[object.id] ? current : { ...current, [object.id]: object.guardIds },
                    );
                  }}
                >
                  Охранники
                </Button>
                {canEditTemplates ? (
                  <Button
                    type="button"
                    variant={templateOpen ? "secondary" : "outline"}
                    className="min-h-11 w-full"
                    onClick={() =>
                      setOpenTemplateObjectId((current) =>
                        current === object.id ? null : object.id,
                      )
                    }
                  >
                    Сменность
                  </Button>
                ) : null}
                {canManageRates ? (
                  <Button
                    type="button"
                    variant={ratesOpen ? "secondary" : "outline"}
                    className="min-h-11 w-full"
                    onClick={() =>
                      setOpenRatesObjectId((current) => (current === object.id ? null : object.id))
                    }
                  >
                    Ставки
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="danger"
                  className="min-h-11 w-full"
                  onClick={() => setDeleteObjectTarget({ id: object.id, name: object.name })}
                >
                  <Trash2 className="size-4" aria-hidden />
                  Удалить
                </Button>
              </div>

              {guardsOpen ? (
                <div
                  className="mt-3 rounded-button border border-app-border bg-app-elevated p-3"
                  data-dropdown={`object-guards-${object.id}`}
                >
                  <input
                    value={guardSearch}
                    onChange={(event) => setGuardSearch(event.target.value)}
                    placeholder="Поиск охранника"
                    className="mb-2 h-11 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                  />
                  <div className="max-h-64 overflow-auto">
                    {filteredGuards.map((guard) => {
                      const checked = selectedGuards.includes(guard.id);
                      return (
                        <label
                          key={`mobile-${object.id}-${guard.id}`}
                          className="mb-1 flex min-h-11 cursor-pointer items-start gap-2 rounded-button px-2 py-2 text-xs transition hover:bg-app-surface"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setSelectedByObject((current) => {
                                const before = current[object.id] ?? object.guardIds;
                                const after = event.target.checked
                                  ? [...before, guard.id]
                                  : before.filter((id) => id !== guard.id);
                                return { ...current, [object.id]: [...new Set(after)] };
                              });
                            }}
                            className="mt-0.5 size-4"
                          />
                          <span>
                            {guard.lastName} {guard.firstName}
                            <span className={`ml-1 ${guardStatusClass[guard.status]}`}>
                              ({guardStatusLabels[guard.status]})
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    {filteredGuards.length === 0 ? (
                      <p className="px-2 py-3 text-xs text-app-muted">Охранники не найдены.</p>
                    ) : null}
                  </div>
                  <form action={setObjectGuardsAction} className="mt-2">
                    <input type="hidden" name="objectId" value={object.id} />
                    <input type="hidden" name="guardIds" value={selectedGuards.join(",")} />
                    <Button type="submit" size="lg" className="w-full">
                      Сохранить охранников
                    </Button>
                  </form>
                </div>
              ) : null}

              {templateOpen ? (
                <div className="mt-3 rounded-button border border-app-border bg-app-elevated p-3">
                  <p className="mb-3 text-xs text-app-muted">
                    План обычных смен и усилений по дням недели.
                  </p>
                  <form action={saveShiftTemplatesAction} className="grid gap-3">
                    <input type="hidden" name="objectId" value={object.id} />
                    <label className="grid gap-1 text-xs text-app-muted">
                      Применять с даты
                      <input
                        type="date"
                        name="effectiveFrom"
                        defaultValue={templateEffectiveFrom}
                        className="h-11 rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                        required
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {weekdayShort.map((label, idx) => (
                        <fieldset
                          key={`mobile-template-${object.id}-${label}`}
                          className="rounded-button border border-app-border bg-app-surface p-2"
                        >
                          <legend className="px-1 text-xs font-semibold">{label}</legend>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1 text-[10px] text-app-muted">
                              Осн.
                              <input
                                type="number"
                                name={`d${idx + 1}`}
                                min={0}
                                max={24}
                                required
                                defaultValue={templateDefaultsByObjectId[object.id]?.[idx] ?? 2}
                                className="h-10 min-w-0 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
                              />
                            </label>
                            <label className="grid gap-1 text-[10px] text-accent-warning">
                              Усил.
                              <input
                                type="number"
                                name={`r${idx + 1}`}
                                min={0}
                                max={24}
                                required
                                defaultValue={
                                  templateReinforcementDefaultsByObjectId[object.id]?.[idx] ?? 0
                                }
                                className="h-10 min-w-0 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-warning"
                              />
                            </label>
                          </div>
                        </fieldset>
                      ))}
                    </div>
                    <Button type="submit" size="lg" className="w-full">
                      Сохранить сменность
                    </Button>
                  </form>
                </div>
              ) : null}

              {ratesOpen ? (
                <div className="mt-3 min-w-0 overflow-hidden rounded-button border border-app-border bg-app-elevated p-3">
                  <ObjectRateRulesPanel
                    objectId={object.id}
                    rules={rateRulesByObjectId[object.id] ?? []}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
        {filteredObjects.length === 0 ? (
          <div className="rounded-card border border-app-border bg-app-elevated p-4 text-sm text-app-muted">
            Объекты не найдены.
          </div>
        ) : null}
      </div>

      <div className="mt-6 hidden overflow-visible rounded-card border border-app-border md:block">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="bg-app-elevated text-app-muted">
            <tr>
              <th className="border-b border-app-border px-2 py-2 font-medium w-10 text-center tabular-nums">№</th>
              <th className="border-b border-app-border px-3 py-2 font-medium">Название</th>
              <th className="border-b border-app-border px-3 py-2 font-medium">Адрес</th>
              <th className="border-b border-app-border px-3 py-2 font-medium">Охранники</th>
              <th className="border-b border-app-border px-3 py-2 font-medium">Статус</th>
              <th className="border-b border-app-border px-3 py-2 font-medium">Неделя</th>
              {canEditTemplates ? (
                <th className="border-b border-app-border px-3 py-2 font-medium">Сменность</th>
              ) : null}
              {canManageRates ? (
                <th className="border-b border-app-border px-3 py-2 font-medium">Ставки</th>
              ) : null}
              <th className="border-b border-app-border px-2 py-2 font-medium w-14"> </th>
            </tr>
          </thead>
          <tbody>
            {filteredObjects.map((object, index) => (
              <Fragment key={object.id}>
              <tr className="border-b border-app-border last:border-b-0">
                <td className="px-2 py-2 text-center text-app-muted tabular-nums font-medium">{index + 1}</td>
                <td className="px-3 py-2">
                  <ButtonLink
                    href={`/objects/${object.id}`}
                    variant="ghost"
                    className="h-auto px-0 py-0 font-medium hover:bg-transparent hover:text-accent-primary"
                  >
                    {object.name}
                  </ButtonLink>
                </td>
                <td className="px-3 py-2 text-app-muted">{object.address}</td>
                <td className="px-3 py-2">
                  <div className="relative" data-dropdown={`object-guards-${object.id}`}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-app-bg"
                      onClick={() => {
                        setOpenMenu((current) =>
                          current === `object-guards-${object.id}` ? null : `object-guards-${object.id}`,
                        );
                        setGuardSearch("");
                        setSelectedByObject((current) =>
                          current[object.id] ? current : { ...current, [object.id]: object.guardIds },
                        );
                      }}
                    >
                      {object.guardsCount}
                    </Button>
                    {openMenu === `object-guards-${object.id}` ? (
                      <div
                        className={`absolute z-10 w-72 rounded-button border border-app-border bg-app-surface p-3 shadow-glow ${
                          index >= filteredObjects.length - 2 ? "bottom-full mb-2" : "mt-2"
                        }`}
                      >
                        <input
                          value={guardSearch}
                          onChange={(event) => setGuardSearch(event.target.value)}
                          placeholder="Поиск охранника"
                          className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-2 py-2 text-xs outline-none focus:border-accent-primary"
                        />
                        <div className="max-h-56 overflow-auto">
                          {filteredGuards.map((guard) => {
                            const selected = selectedByObject[object.id] ?? object.guardIds;
                            const checked = selected.includes(guard.id);
                            return (
                              <label
                                key={`${object.id}-${guard.id}`}
                                className="mb-1 flex cursor-pointer items-start gap-2 rounded-button px-2 py-2 text-xs transition hover:bg-app-elevated"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    setSelectedByObject((current) => {
                                      const before = current[object.id] ?? object.guardIds;
                                      const after = event.target.checked
                                        ? [...before, guard.id]
                                        : before.filter((id) => id !== guard.id);
                                      return { ...current, [object.id]: [...new Set(after)] };
                                    });
                                  }}
                                />
                                <span>
                                  {guard.lastName} {guard.firstName}
                                  <span className={`ml-1 ${guardStatusClass[guard.status]}`}>
                                    ({guardStatusLabels[guard.status]})
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </div>
                        <form action={setObjectGuardsAction} className="mt-2">
                          <input type="hidden" name="objectId" value={object.id} />
                          <input
                            type="hidden"
                            name="guardIds"
                            value={(selectedByObject[object.id] ?? object.guardIds).join(",")}
                          />
                          <Button type="submit" size="sm" className="w-full">
                            Выбрать
                          </Button>
                        </form>
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className={`px-3 py-2 font-medium ${statusClass[object.status]}`}>
                  <div className="relative" data-dropdown={`object-status-${object.id}`}>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`bg-app-bg ${statusClass[object.status]}`}
                      onClick={() =>
                        setOpenMenu((current) =>
                          current === `object-status-${object.id}` ? null : `object-status-${object.id}`,
                        )
                      }
                    >
                      {objectStatusLabels[object.status]}
                    </Button>
                    {openMenu === `object-status-${object.id}` ? (
                      <div
                        className={`absolute z-10 w-48 rounded-button border border-app-border bg-app-surface p-2 shadow-glow ${
                          index >= filteredObjects.length - 2 ? "bottom-full mb-2" : "mt-2"
                        }`}
                      >
                        {objectStatusOptions.map((option) => (
                          <form key={option.value} action={updateObjectStatusAction}>
                            <input type="hidden" name="objectId" value={object.id} />
                            <input type="hidden" name="status" value={option.value} />
                            <Button
                              type="submit"
                              variant="menu"
                              size="sm"
                              className={`mb-1 justify-start ${statusClass[option.value]}`}
                            >
                              {option.label}
                            </Button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-app-muted">
                  {object.weekShiftCount} смен / {object.weekGuardCount} охр.
                </td>
                {canEditTemplates ? (
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-app-bg"
                      onClick={() =>
                        setOpenTemplateObjectId((current) =>
                          current === object.id ? null : object.id,
                        )
                      }
                    >
                      {openTemplateObjectId === object.id ? "Скрыть" : "Шаблон"}
                    </Button>
                  </td>
                ) : null}
                {canManageRates ? (
                  <td className="px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="bg-app-bg"
                      onClick={() =>
                        setOpenRatesObjectId((current) => (current === object.id ? null : object.id))
                      }
                    >
                      {openRatesObjectId === object.id ? "Скрыть" : "Ставки"}
                    </Button>
                  </td>
                ) : null}
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1">
                    <ButtonLink
                      href={`/objects/${object.id}`}
                      variant="icon"
                      size="icon"
                      className="text-app-muted hover:bg-app-elevated hover:text-accent-primary"
                      aria-label="Редактировать объект"
                    >
                      <Edit2 className="size-4" />
                    </ButtonLink>
                    <Button
                      type="button"
                      variant="icon"
                      size="icon"
                      className="text-accent-danger hover:bg-accent-danger/10"
                      aria-label="Удалить объект"
                      onClick={() =>
                        setDeleteObjectTarget({
                          id: object.id,
                          name: object.name,
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </td>
              </tr>
              {canEditTemplates && openTemplateObjectId === object.id ? (
                <tr className="border-b border-app-border bg-app-elevated/40 last:border-b-0">
                  <td colSpan={colCount} className="px-3 py-4">
                    <p className="mb-3 text-xs text-app-muted">
                      Ожидаемое число обычных смен и усилений по дням недели. Сохранение создает новую версию
                      сменности с выбранной даты, старые даты остаются на прежней версии.
                    </p>
                    <form action={saveShiftTemplatesAction} className="grid gap-3 md:grid-cols-8">
                      <input type="hidden" name="objectId" value={object.id} />
                      <label className="grid gap-1 md:col-span-8 md:max-w-xs">
                        <span className="text-[10px] text-app-muted uppercase font-bold">Применять с даты</span>
                        <input
                          type="date"
                          name="effectiveFrom"
                          defaultValue={templateEffectiveFrom}
                          className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                          required
                        />
                      </label>
                      {weekdayShort.map((label, idx) => (
                        <div key={label} className="grid gap-1">
                          <span className="text-[10px] text-app-muted uppercase font-bold text-center">{label}</span>
                          <div className="grid gap-1.5">
                            <label className="grid gap-0.5 text-[9px] text-app-muted">
                              Осн.
                              <input
                                type="number"
                                name={`d${idx + 1}`}
                                min={0}
                                max={24}
                                required
                                defaultValue={templateDefaultsByObjectId[object.id]?.[idx] ?? 2}
                                className="rounded-button border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-accent-primary"
                              />
                            </label>
                            <label className="grid gap-0.5 text-[9px] text-accent-warning">
                              Усил.
                              <input
                                type="number"
                                name={`r${idx + 1}`}
                                min={0}
                                max={24}
                                required
                                defaultValue={templateReinforcementDefaultsByObjectId[object.id]?.[idx] ?? 0}
                                className="rounded-button border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-accent-warning"
                              />
                            </label>
                          </div>
                        </div>
                      ))}
                      <div className="flex items-end">
                        <Button
                          type="submit"
                          size="sm"
                          className="w-full h-14"
                        >
                          Сохранить
                        </Button>
                      </div>
                    </form>
                  </td>
                </tr>
              ) : null}
              {canManageRates && openRatesObjectId === object.id ? (
                <tr className="border-b border-app-border bg-app-elevated/40 last:border-b-0">
                  <td colSpan={colCount} className="px-3 py-4">
                    <ObjectRateRulesPanel
                      objectId={object.id}
                      rules={rateRulesByObjectId[object.id] ?? []}
                    />
                  </td>
                </tr>
              ) : null}
              </Fragment>
            ))}
            {filteredObjects.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-app-muted" colSpan={colCount}>
                  Объекты не найдены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {deleteObjectTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="object-delete-title"
        >
          <div className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-6 shadow-glow">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 shrink-0 text-accent-warning" />
              <div>
                <h2 id="object-delete-title" className="text-lg font-semibold">
                  Удалить объект?
                </h2>
                <p className="mt-2 text-sm text-app-muted">
                  «{deleteObjectTarget.name}» — будут удалены шаблоны смен, ставки, смены и назначения охранников. Действие
                  необратимо.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                onClick={() => setDeleteObjectTarget(null)}
                variant="secondary"
              >
                Отмена
              </Button>
              <form action={deleteObjectAction}>
                <input type="hidden" name="objectId" value={deleteObjectTarget.id} />
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
