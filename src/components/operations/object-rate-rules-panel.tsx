"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import {
  createObjectRateRuleAction,
  deleteObjectRateRuleAction,
  reorderObjectRateRulesAction,
  updateObjectRateRuleAction,
  type ObjectRateRuleActionResult,
} from "../../app/objects/actions";
import { Button } from "../ui/button";
import type { ObjectRateRuleRecord } from "../../lib/operations/object-rate-rules-repository";
import { prioritiesForDisplayOrder, defaultRateRuleEffectiveFrom } from "../../lib/operations/object-rate-rules-priority";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
  rateUnitLabels,
  shiftKindLabels,
} from "../../lib/operations/status-labels";
import { formatDisplayDateFromIso } from "../../lib/format/display-date";
import { designTokens } from "../../lib/design-tokens";
import { toast } from "../../store/toast-store";

const weekdayShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"] as const;

function centsToRublesInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Ключ формы: при обновлении `rules` после сохранения поля пересоздаются с новыми defaultValue. */
function ruleFormSerializationKey(rule: ObjectRateRuleRecord): string {
  return [
    rule.id,
    rule.name,
    rule.priority,
    rule.startsAt ?? "",
    rule.endsAt ?? "",
    rule.effectiveFrom,
    rule.effectiveTo ?? "",
    (rule.daysOfWeek ?? []).join(","),
    rule.isHoliday,
    rule.shiftKind ?? "",
    rule.position ?? "",
    rule.licenseType ?? "",
    rule.employmentType ?? "",
    rule.isTrainee,
    rule.clientRateCents,
    rule.guardRateCents,
    rule.rateUnit,
  ].join("\0");
}

function summarizeRule(r: ObjectRateRuleRecord): string {
  const parts: string[] = [];
  if (r.daysOfWeek != null && r.daysOfWeek.length > 0) {
    parts.push(r.daysOfWeek.map((d) => weekdayShort[d - 1] ?? `День ${d}`).join(", "));
  }
  if (r.isHoliday === true) parts.push("праздник");
  if (r.isHoliday === false) parts.push("не праздник");
  if (r.shiftKind) parts.push(shiftKindLabels[r.shiftKind]);
  if (r.startsAt || r.endsAt) {
    parts.push(`${r.startsAt ?? "…"}–${r.endsAt ?? "…"}`);
  }
  if (r.position) parts.push(guardPositionLabels[r.position]);
  if (r.licenseType) parts.push(guardLicenseLabels[r.licenseType]);
  if (r.employmentType) parts.push(guardEmploymentLabels[r.employmentType]);
  if (r.isTrainee === true) parts.push("стажёр");
  if (r.isTrainee === false) parts.push("не стажёр");
  return parts.length > 0 ? parts.join(" · ") : "любые условия";
}

const inputClass =
  "rounded-button border border-app-border bg-app-bg px-2 py-1.5 text-sm outline-none focus:border-accent-primary";
const labelClass = "grid gap-1 text-xs text-app-muted";
const weekdayToggleClass =
  "inline-flex cursor-pointer items-center justify-center rounded-button border px-2 py-1 text-xs transition-colors has-[:checked]:border-accent-primary has-[:checked]:bg-accent-primary/10 has-[:checked]:text-app-text border-app-border bg-app-bg text-app-muted hover:border-accent-primary/60";

function WeekdayMultiSelect({ selectedDays }: { selectedDays?: number[] | null }) {
  const selected = new Set(selectedDays ?? []);
  return (
    <div className={labelClass}>
      <span>День недели</span>
      <div className="flex flex-wrap gap-1">
        {weekdayShort.map((label, i) => {
          const day = i + 1;
          return (
            <label key={label} className={weekdayToggleClass}>
              <input
                type="checkbox"
                name="dayOfWeek"
                value={String(day)}
                defaultChecked={selected.has(day)}
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
      </div>
      <span className="text-[10px] text-app-muted">Ничего не выбрано — любой день</span>
    </div>
  );
}
const sectionClass = "rounded-card border border-app-border bg-app-bg/40 p-3";
const sectionTitleClass = "text-sm font-medium text-app-text";
const sectionHintClass = "mt-1 text-[11px] text-app-muted";

type FieldsProps = {
  rule?: ObjectRateRuleRecord | null;
  isCreate?: boolean;
  defaultEffectiveFrom?: string;
};

function RateRuleFields({ rule, isCreate, defaultEffectiveFrom }: FieldsProps) {
  const r = rule;
  return (
    <div className="space-y-3">
      <section className={sectionClass}>
        <p className={sectionTitleClass}>1. Базовые параметры</p>
        <p className={sectionHintClass}>Название, приоритет и ставки, которые применятся при совпадении условий.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Название
            <input
              required
              name="name"
              defaultValue={r?.name ?? ""}
              className={inputClass}
              placeholder="Например, База охранник Б/У"
            />
          </label>
          <label className={labelClass}>
            Приоритет (или перетащите строку в таблице)
            <input
              name="priority"
              type="number"
              defaultValue={r != null ? r.priority : isCreate ? 100 : ""}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            Единица
            <select name="rateUnit" defaultValue={r?.rateUnit ?? "Hour"} className={inputClass}>
              <option value="Hour">{rateUnitLabels.Hour}</option>
              <option value="Shift">{rateUnitLabels.Shift}</option>
            </select>
          </label>
          <label className={labelClass}>
            Клиент, ₽
            <input
              name="clientRubles"
              type="text"
              inputMode="decimal"
              defaultValue={r ? centsToRublesInput(r.clientRateCents) : ""}
              className={inputClass}
              placeholder="0.00"
            />
          </label>
          <label className={labelClass}>
            Сотрудник, ₽
            <input
              name="guardRubles"
              type="text"
              inputMode="decimal"
              defaultValue={r ? centsToRublesInput(r.guardRateCents) : ""}
              className={inputClass}
              placeholder="0.00"
            />
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <p className={sectionTitleClass}>2. Когда правило действует</p>
        <p className={sectionHintClass}>Период обязателен, остальные фильтры можно оставить «Любой».</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            С даты
            <input
              required
              name="effectiveFrom"
              type="date"
              defaultValue={r?.effectiveFrom ?? defaultEffectiveFrom ?? ""}
              className={inputClass}
            />
          </label>
          <label className={labelClass}>
            По дату (пусто — бессрочно)
            <input
              name="effectiveTo"
              type="date"
              defaultValue={r?.effectiveTo ?? ""}
              className={inputClass}
            />
          </label>
          <WeekdayMultiSelect selectedDays={r?.daysOfWeek} />
          <label className={labelClass}>
            Праздник по календарю
            <select
              name="isHoliday"
              defaultValue={
                r?.isHoliday === true ? "true" : r?.isHoliday === false ? "false" : ""
              }
              className={inputClass}
            >
              <option value="">Любой</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
          <label className={labelClass}>
            Тип смены
            <select name="shiftKind" defaultValue={r?.shiftKind ?? ""} className={inputClass}>
              <option value="">Любой</option>
              <option value="Regular">{shiftKindLabels.Regular}</option>
              <option value="Reinforcement">{shiftKindLabels.Reinforcement}</option>
              <option value="RapidResponse">{shiftKindLabels.RapidResponse}</option>
              <option value="ShiftLead">{shiftKindLabels.ShiftLead}</option>
            </select>
          </label>
          <label className={labelClass}>
            Интервал с (чч:мм)
            <input name="startsAt" type="time" defaultValue={r?.startsAt ?? ""} className={inputClass} />
          </label>
          <label className={labelClass}>
            Интервал по
            <input name="endsAt" type="time" defaultValue={r?.endsAt ?? ""} className={inputClass} />
          </label>
        </div>
      </section>

      <section className={sectionClass}>
        <p className={sectionTitleClass}>3. Требования к сотруднику</p>
        <p className={sectionHintClass}>Ограничения по роли и статусу сотрудника для применения правила.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <label className={labelClass}>
            Должность
            <select name="position" defaultValue={r?.position ?? ""} className={inputClass}>
              <option value="">Любая</option>
              <option value="ShiftLead">{guardPositionLabels.ShiftLead}</option>
              <option value="Guard">{guardPositionLabels.Guard}</option>
              <option value="Curator">{guardPositionLabels.Curator}</option>
            </select>
          </label>
          <label className={labelClass}>
            Удостоверение
            <select name="licenseType" defaultValue={r?.licenseType ?? ""} className={inputClass}>
              <option value="">Любое</option>
              <option value="None">{guardLicenseLabels.None}</option>
              <option value="Licensed">{guardLicenseLabels.Licensed}</option>
            </select>
          </label>
          <label className={labelClass}>
            Трудоустройство
            <select name="employmentType" defaultValue={r?.employmentType ?? ""} className={inputClass}>
              <option value="">Любое</option>
              <option value="Employed">{guardEmploymentLabels.Employed}</option>
              <option value="Unemployed">{guardEmploymentLabels.Unemployed}</option>
            </select>
          </label>
          <label className={labelClass}>
            Стажёр
            <select
              name="isTrainee"
              defaultValue={
                r?.isTrainee === true ? "true" : r?.isTrainee === false ? "false" : ""
              }
              className={inputClass}
            >
              <option value="">Любой</option>
              <option value="true">Да</option>
              <option value="false">Нет</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}

export type ObjectRateRulesPanelProps = {
  objectId: string;
  rules: ObjectRateRuleRecord[];
  defaultEffectiveFrom?: string;
};

type RuleGroup = {
  key: string;
  name: string;
  rules: ObjectRateRuleRecord[];
};

function groupConsecutiveRulesByName(rules: ObjectRateRuleRecord[]): RuleGroup[] {
  const groups: RuleGroup[] = [];
  for (const rule of rules) {
    const last = groups[groups.length - 1];
    if (last && last.name === rule.name) {
      last.rules.push(rule);
    } else {
      groups.push({ key: rule.id, name: rule.name, rules: [rule] });
    }
  }
  return groups;
}

function reorderRuleList(
  rules: ObjectRateRuleRecord[],
  sourceId: string,
  targetId: string,
): ObjectRateRuleRecord[] | null {
  if (sourceId === targetId) return null;
  const from = rules.findIndex((rule) => rule.id === sourceId);
  const to = rules.findIndex((rule) => rule.id === targetId);
  if (from < 0 || to < 0) return null;

  const next = [...rules];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  const priorities = prioritiesForDisplayOrder(next.length);
  return next.map((rule, index) => ({ ...rule, priority: priorities[index]! }));
}

function RuleRowActions({
  rule,
  onEdit,
  onDelete,
}: {
  rule: ObjectRateRuleRecord;
  onEdit: (id: string) => void;
  onDelete: (rule: ObjectRateRuleRecord) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={() => onEdit(rule.id)}>
        Изменить
      </Button>
      <Button type="button" variant="danger" size="sm" onClick={() => onDelete(rule)}>
        Удалить
      </Button>
    </div>
  );
}

function RateRuleMobileCard({
  rule,
  onEdit,
  onDelete,
}: {
  rule: ObjectRateRuleRecord;
  onEdit: (id: string) => void;
  onDelete: (rule: ObjectRateRuleRecord) => void;
}) {
  return (
    <article className="rounded-card border border-app-border bg-app-bg p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-app-text">{rule.name}</p>
          <p className="mt-0.5 text-[10px] text-app-muted">Приоритет {rule.priority}</p>
        </div>
        <span className="shrink-0 rounded-button bg-app-elevated px-2 py-0.5 text-[10px] text-app-muted">
          {rateUnitLabels[rule.rateUnit]}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
        <div>
          <dt className="text-[10px] uppercase text-app-muted">Клиент</dt>
          <dd className="font-medium tabular-nums">{centsToRublesInput(rule.clientRateCents)} ₽</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase text-app-muted">Сотрудник</dt>
          <dd className="font-medium tabular-nums">{centsToRublesInput(rule.guardRateCents)} ₽</dd>
        </div>
      </dl>
      <p className="mt-2 text-[11px] text-app-muted">
        {formatDisplayDateFromIso(rule.effectiveFrom)}
        {rule.effectiveTo ? ` — ${formatDisplayDateFromIso(rule.effectiveTo)}` : " — …"}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-app-muted">{summarizeRule(rule)}</p>
      <div className="mt-3">
        <RuleRowActions rule={rule} onEdit={onEdit} onDelete={onDelete} />
      </div>
    </article>
  );
}

export function ObjectRateRulesPanel({
  objectId,
  rules,
  defaultEffectiveFrom = defaultRateRuleEffectiveFrom(),
}: ObjectRateRulesPanelProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteRuleTarget, setDeleteRuleTarget] = useState<ObjectRateRuleRecord | null>(null);
  const [orderedRules, setOrderedRules] = useState(rules);
  const [createFormKey, setCreateFormKey] = useState(0);
  const editFormRef = useRef<HTMLDivElement>(null);
  const [dragRuleId, setDragRuleId] = useState<string | null>(null);
  const [dragOverRuleId, setDragOverRuleId] = useState<string | null>(null);
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<Set<string>>(() => new Set());
  const [isReordering, startReorder] = useTransition();
  const [isSavingEdit, startSaveEdit] = useTransition();
  const [isSavingCreate, startSaveCreate] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const editingRule = editingId ? (rules.find((r) => r.id === editingId) ?? null) : null;
  const ruleGroups = useMemo(() => groupConsecutiveRulesByName(orderedRules), [orderedRules]);

  const handleRateRuleResult = useCallback(
    (
      result: ObjectRateRuleActionResult,
      success: { title: string; message: string },
      onSuccess?: () => void,
    ) => {
      if (!result.ok) {
        toast({
          title: "Ошибка",
          message: result.error,
          variant: "error",
          durationMs: 6500,
        });
        return;
      }
      toast({
        title: success.title,
        message: success.message,
        variant: "success",
        durationMs: 4000,
      });
      onSuccess?.();
      router.refresh();
    },
    [router],
  );

  const toggleGroupCollapse = useCallback((groupKey: string) => {
    setCollapsedGroupKeys((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
  }, []);

  useEffect(() => {
    setOrderedRules(rules);
  }, [rules]);

  const handleReorder = useCallback(
    (sourceId: string, targetId: string) => {
      const next = reorderRuleList(orderedRules, sourceId, targetId);
      if (!next) return;

      setOrderedRules(next);
      startReorder(async () => {
        const formData = new FormData();
        formData.set("objectId", objectId);
        formData.set("orderedRuleIds", JSON.stringify(next.map((rule) => rule.id)));
        const result = await reorderObjectRateRulesAction(formData);
        if (!result.ok) {
          setOrderedRules(rules);
          toast({
            title: "Ошибка",
            message: result.error,
            variant: "error",
            durationMs: 6500,
          });
        }
      });
    },
    [objectId, orderedRules, rules, startReorder],
  );

  useEffect(() => {
    if (editingId && !rules.some((r) => r.id === editingId)) {
      setEditingId(null);
    }
  }, [editingId, rules]);

  useEffect(() => {
    if (!editingId) return;
    editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingId]);

  const handleEdit = useCallback((ruleId: string) => {
    setDeleteRuleTarget(null);
    setEditingId(ruleId);
  }, []);

  return (
    <div className="space-y-4">
      <p className="text-xs text-app-muted">
        Правила ставок для клиента и сотрудника. Пустые фильтры — «любое значение». Сначала отбираются все
        подходящие по условиям (день, должность, удостоверение, трудоустройство, стажёр…), затем выбирается
        правило с наивысшим приоритетом. Перетаскивайте строки — выше в списке = выше приоритет.
      </p>

      {editingRule ? (
        <div ref={editFormRef}>
          <form
            key={ruleFormSerializationKey(editingRule)}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startSaveEdit(async () => {
                const result = await updateObjectRateRuleAction(formData);
                handleRateRuleResult(
                  result,
                  { title: "Правило сохранено", message: "Изменения успешно записаны" },
                  () => setEditingId(null),
                );
              });
            }}
            className="rounded-card border border-accent-primary/40 bg-app-bg/40 p-4 shadow-glow"
            style={{ boxShadow: designTokens.shadow.glow }}
          >
          <input type="hidden" name="ruleId" value={editingRule.id} />
          <input type="hidden" name="objectId" value={objectId} />
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-app-text">Редактирование правила</p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setEditingId(null)}
            >
              Отмена
            </Button>
          </div>
          <RateRuleFields rule={editingRule} />
          <Button type="submit" className="mt-4" disabled={isSavingEdit}>
            {isSavingEdit ? "Сохранение…" : "Сохранить"}
          </Button>
        </form>
        </div>
      ) : null}

      <div className={`hidden md:block app-h-scroll ${isReordering ? "opacity-70" : ""}`}>
        <table className="w-full min-w-[720px] border-collapse text-left text-xs">
          <thead className="bg-app-elevated text-app-muted">
            <tr>
              <th className="w-8 border-b border-app-border px-1 py-2 font-medium" aria-label="Порядок" />
              <th className="border-b border-app-border px-2 py-2 font-medium">Название</th>
              <th className="border-b border-app-border px-2 py-2 font-medium">Пр.</th>
              <th className="border-b border-app-border px-2 py-2 font-medium">Клиент</th>
              <th className="border-b border-app-border px-2 py-2 font-medium">Сотрудник</th>
              <th className="border-b border-app-border px-2 py-2 font-medium">Ед.</th>
              <th className="border-b border-app-border px-2 py-2 font-medium">Период</th>
              <th className="border-b border-app-border px-2 py-2 font-medium">Условия</th>
              <th className="border-b border-app-border px-2 py-2 font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {ruleGroups.map((group, groupIndex) => {
              const isCollapsible = group.rules.length > 3;
              const isCollapsed = isCollapsible && collapsedGroupKeys.has(group.key);
              const groupRowBg = groupIndex % 2 === 0 ? "bg-app-bg" : "bg-app-elevated/40";
              const groupSeparator = groupIndex > 0 ? "border-t-2 border-app-border" : "";

              return (
                <Fragment key={group.key}>
                  <tr className={`bg-app-elevated/50 ${groupSeparator}`}>
                    <td colSpan={9} className="px-2 py-2">
                      {isCollapsible ? (
                        <button
                          type="button"
                          onClick={() => toggleGroupCollapse(group.key)}
                          className="inline-flex w-full items-center gap-1.5 text-left font-medium text-app-text hover:text-accent-primary"
                          aria-expanded={!isCollapsed}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="size-4 shrink-0 text-app-muted" />
                          ) : (
                            <ChevronDown className="size-4 shrink-0 text-app-muted" />
                          )}
                          <span>
                            {group.name}{" "}
                            <span className="font-normal text-app-muted">({group.rules.length})</span>
                          </span>
                        </button>
                      ) : (
                        <span className="font-medium text-app-text">
                          {group.name}{" "}
                          <span className="font-normal text-app-muted">({group.rules.length})</span>
                        </span>
                      )}
                    </td>
                  </tr>
                  {!isCollapsed
                    ? group.rules.map((r, ruleIndex) => {
                        const isDragging = dragRuleId === r.id;
                        const isDragOver = dragOverRuleId === r.id && dragRuleId !== r.id;
                        const isLastInGroup = ruleIndex === group.rules.length - 1;
                        return (
                          <tr
                            key={r.id}
                            className={`${groupRowBg} border-b border-app-border/60 ${isLastInGroup ? "border-b-app-border" : ""} ${isDragging ? "opacity-40" : ""} ${isDragOver ? "bg-accent-primary/10" : ""}`}
                            onDragOver={(event) => {
                              if (!dragRuleId || dragRuleId === r.id) return;
                              event.preventDefault();
                              event.dataTransfer.dropEffect = "move";
                              setDragOverRuleId(r.id);
                            }}
                            onDragLeave={() => {
                              if (dragOverRuleId === r.id) setDragOverRuleId(null);
                            }}
                            onDrop={(event) => {
                              event.preventDefault();
                              if (!dragRuleId) return;
                              handleReorder(dragRuleId, r.id);
                              setDragRuleId(null);
                              setDragOverRuleId(null);
                            }}
                          >
                            <td className="px-1 py-2 text-app-muted">
                              <span
                                draggable={!editingId && !isReordering}
                                onDragStart={(event) => {
                                  setDragRuleId(r.id);
                                  event.dataTransfer.effectAllowed = "move";
                                  event.dataTransfer.setData("text/plain", r.id);
                                }}
                                onDragEnd={() => {
                                  setDragRuleId(null);
                                  setDragOverRuleId(null);
                                }}
                                className="inline-flex cursor-grab items-center rounded p-0.5 active:cursor-grabbing hover:bg-app-elevated"
                                aria-label={`Перетащить правило «${r.name}»`}
                                title="Перетащите для изменения приоритета"
                              >
                                <GripVertical className="size-4" />
                              </span>
                            </td>
                            <td className="px-2 py-2" aria-hidden="true" />
                            <td className="px-2 py-2 text-app-muted">{r.priority}</td>
                            <td className="px-2 py-2">{centsToRublesInput(r.clientRateCents)}</td>
                            <td className="px-2 py-2">{centsToRublesInput(r.guardRateCents)}</td>
                            <td className="px-2 py-2 text-app-muted">{rateUnitLabels[r.rateUnit]}</td>
                            <td className="px-2 py-2 text-app-muted">
                              {formatDisplayDateFromIso(r.effectiveFrom)}
                              {r.effectiveTo
                                ? ` — ${formatDisplayDateFromIso(r.effectiveTo)}`
                                : " — …"}
                            </td>
                            <td className="max-w-[280px] px-2 py-2 text-app-muted">{summarizeRule(r)}</td>
                            <td className="px-2 py-2">
                              <RuleRowActions rule={r} onEdit={handleEdit} onDelete={setDeleteRuleTarget} />
                            </td>
                          </tr>
                        );
                      })
                    : null}
                </Fragment>
              );
            })}
            {orderedRules.length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-app-muted" colSpan={9}>
                  Правил пока нет — добавьте ниже.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className={`space-y-3 md:hidden ${isReordering ? "opacity-70" : ""}`}>
        {ruleGroups.map((group) => (
          <div key={group.key} className="space-y-2">
            <p className="text-xs font-semibold text-app-text">
              {group.name}{" "}
              <span className="font-normal text-app-muted">({group.rules.length})</span>
            </p>
            {group.rules.map((r) => (
              <RateRuleMobileCard key={r.id} rule={r} onEdit={handleEdit} onDelete={setDeleteRuleTarget} />
            ))}
          </div>
        ))}
        {orderedRules.length === 0 ? (
          <p className="rounded-card border border-app-border bg-app-bg px-3 py-4 text-xs text-app-muted">
            Правил пока нет — добавьте ниже.
          </p>
        ) : null}
      </div>

      {!editingRule ? (
        <form
          key={createFormKey}
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startSaveCreate(async () => {
              const result = await createObjectRateRuleAction(formData);
              handleRateRuleResult(
                result,
                { title: "Правило добавлено", message: "Новое правило успешно создано" },
                () => setCreateFormKey((key) => key + 1),
              );
            });
          }}
          className="rounded-card border border-app-border bg-app-elevated/50 p-3 sm:p-4"
        >
          <input type="hidden" name="objectId" value={objectId} />
          <p className="mb-3 text-sm font-medium text-app-text">Новое правило</p>
          <RateRuleFields isCreate defaultEffectiveFrom={defaultEffectiveFrom} />
          <Button type="submit" className="mt-4" disabled={isSavingCreate}>
            {isSavingCreate ? "Добавление…" : "Добавить"}
          </Button>
        </form>
      ) : null}

      {deleteRuleTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="rate-rule-delete-title"
        >
          <div
            className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
            style={{ boxShadow: designTokens.shadow.glow }}
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-6 shrink-0 text-accent-warning" />
              <div>
                <h2 id="rate-rule-delete-title" className="text-lg font-semibold">
                  Удалить правило?
                </h2>
                <p className="mt-2 text-sm text-app-muted">
                  «{deleteRuleTarget.name}» — ставки и условия будут удалены без возможности восстановления.
                </p>
                <p className="mt-2 text-xs text-app-muted">{summarizeRule(deleteRuleTarget)}</p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setDeleteRuleTarget(null)}>
                Отмена
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isDeleting}
                onClick={() => {
                  if (!deleteRuleTarget) return;
                  const formData = new FormData();
                  formData.set("ruleId", deleteRuleTarget.id);
                  formData.set("objectId", objectId);
                  startDelete(async () => {
                    const result = await deleteObjectRateRuleAction(formData);
                    handleRateRuleResult(
                      result,
                      { title: "Правило удалено", message: `«${deleteRuleTarget.name}» удалено` },
                      () => setDeleteRuleTarget(null),
                    );
                  });
                }}
              >
                {isDeleting ? "Удаление…" : "Удалить"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
