"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { loadTemplateEditBaselineAction, saveShiftTemplatesAction } from "../../app/objects/actions";
import { Button } from "../ui/button";
import { formatDisplayDateFromIso } from "../../lib/format/display-date";
import type { ActiveShiftsSequenceResult } from "../../lib/scheduling/object-shift-templates";
import { toast } from "../../store/toast-store";

const weekdayShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

type TemplateDraftDay = {
  regular: number;
  shiftHours: number;
  reinforcement: number;
  reinforcementShiftHours: number;
  rapidResponse: number;
  rapidResponseShiftHours: number;
  shiftLead: number;
  shiftLeadShiftHours: number;
};

type TemplateDraft = {
  effectiveFrom: string;
  days: TemplateDraftDay[];
};

function buildTemplateDraft(sequence: ActiveShiftsSequenceResult, effectiveFrom: string): TemplateDraft {
  return {
    effectiveFrom,
    days: Array.from({ length: 7 }, (_, i) => ({
      regular: sequence.regular[i] ?? 2,
      shiftHours: sequence.shiftHours[i] ?? 24,
      reinforcement: sequence.reinforcement[i] ?? 0,
      reinforcementShiftHours: sequence.reinforcementShiftHours[i] ?? 24,
      rapidResponse: sequence.rapidResponse[i] ?? 0,
      rapidResponseShiftHours: sequence.rapidResponseShiftHours[i] ?? 24,
      shiftLead: sequence.shiftLead[i] ?? 0,
      shiftLeadShiftHours: sequence.shiftLeadShiftHours[i] ?? 24,
    })),
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export type ObjectShiftTemplateSectionProps = {
  objectId: string;
  postId?: string | null;
  postName?: string | null;
  templateSequence: ActiveShiftsSequenceResult;
  templateEffectiveFrom: string;
  canEdit: boolean;
};

export function ObjectShiftTemplateSection({
  objectId,
  postId = null,
  postName = null,
  templateSequence,
  templateEffectiveFrom,
  canEdit,
}: ObjectShiftTemplateSectionProps) {
  const router = useRouter();
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft | null>(null);
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [isLoadingTemplateBaseline, setIsLoadingTemplateBaseline] = useState(false);

  function beginTemplateEdit() {
    setTemplateDraft(buildTemplateDraft(templateSequence, templateEffectiveFrom));
  }

  async function reloadTemplateDraftForEffectiveFrom(effectiveFrom: string) {
    setIsLoadingTemplateBaseline(true);
    try {
      const baseline = await loadTemplateEditBaselineAction(objectId, effectiveFrom, postId ?? undefined);
      setTemplateDraft(buildTemplateDraft(baseline, effectiveFrom));
    } catch (err) {
      toast({
        title: "Не удалось загрузить сменность",
        message: err instanceof Error ? err.message : "Ошибка загрузки",
        variant: "error",
        durationMs: 6500,
      });
    } finally {
      setIsLoadingTemplateBaseline(false);
    }
  }

  function patchTemplateDay(index: number, patch: Partial<TemplateDraftDay>) {
    setTemplateDraft((prev) => {
      if (!prev) return prev;
      const days = [...prev.days];
      days[index] = { ...days[index]!, ...patch };
      return { ...prev, days };
    });
  }

  return (
    <div className={postName ? "border-t border-app-border pt-6 first:border-t-0 first:pt-0" : undefined}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {postName ? (
            <h3 className="text-center text-base font-bold text-app-text sm:text-left">{postName}</h3>
          ) : (
            <h2 className="text-lg font-semibold">Сменность (Шаблон)</h2>
          )}
          {!templateDraft ? (
            <p className="mt-1 text-xs text-app-muted">
              Действует с {formatDisplayDateFromIso(templateEffectiveFrom)} · план в графике считается по этому
              шаблону на каждый день
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => (templateDraft ? setTemplateDraft(null) : beginTemplateEdit())}
            disabled={isSavingTemplate}
          >
            {templateDraft ? "Отмена" : "Редактировать шаблон"}
          </Button>
        ) : null}
      </div>

      {templateDraft ? (
        <form
          className="space-y-6"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!templateDraft || isSavingTemplate) return;
            const fd = new FormData();
            fd.set("objectId", objectId);
            fd.set("effectiveFrom", templateDraft.effectiveFrom);
            if (postId) fd.set("postId", postId);
            templateDraft.days.forEach((day, i) => {
              const n = i + 1;
              fd.set(`d${n}`, String(day.regular));
              fd.set(`h${n}`, String(day.shiftHours));
              fd.set(`r${n}`, String(day.reinforcement));
              fd.set(`rh${n}`, String(day.reinforcementShiftHours));
              fd.set(`mp${n}`, String(day.rapidResponse));
              fd.set(`mph${n}`, String(day.rapidResponseShiftHours));
              fd.set(`stm${n}`, String(day.shiftLead));
              fd.set(`stmh${n}`, String(day.shiftLeadShiftHours));
            });
            fd.set("noRedirect", "true");
            setIsSavingTemplate(true);
            try {
              await saveShiftTemplatesAction(fd);
              toast({
                title: "Шаблон сохранён",
                message: postName ? `Сменность поста «${postName}» обновлена` : "Сменность обновлена",
                variant: "success",
              });
              setTemplateDraft(null);
              router.refresh();
            } catch (err) {
              toast({
                title: "Не удалось сохранить шаблон",
                message: err instanceof Error ? err.message : "Ошибка сохранения",
                variant: "error",
                durationMs: 6500,
              });
            } finally {
              setIsSavingTemplate(false);
            }
          }}
        >
          <label className="grid max-w-xs gap-1 text-sm">
            <span className="text-app-muted">Применять сменность с даты</span>
            <input
              type="date"
              value={templateDraft.effectiveFrom}
              onChange={(e) => void reloadTemplateDraftForEffectiveFrom(e.target.value)}
              disabled={isLoadingTemplateBaseline || isSavingTemplate}
              className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-app-text outline-none focus:border-accent-primary disabled:opacity-60"
              required
            />
            <span className="text-xs text-app-muted">
              По умолчанию — дата текущей версии ({formatDisplayDateFromIso(templateEffectiveFrom)}).
            </span>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {weekdayShort.map((day, i) => {
              const draftDay = templateDraft.days[i]!;
              return (
                <div
                  key={day}
                  className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-4"
                >
                  <span className="text-center text-xs font-bold uppercase tracking-wider text-app-muted">{day}</span>
                  <div className="space-y-3">
                    <div className="border-b border-app-border/40 pb-2">
                      <label className="grid gap-1">
                        <span className="text-[10px] font-semibold uppercase text-app-muted">Обычные</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={draftDay.regular}
                            onChange={(e) =>
                              patchTemplateDay(i, { regular: clampInt(Number(e.target.value), 0, 24) })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-primary"
                          />
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={draftDay.shiftHours}
                            onChange={(e) =>
                              patchTemplateDay(i, { shiftHours: clampInt(Number(e.target.value), 1, 24) })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-primary"
                          />
                        </div>
                      </label>
                    </div>
                    <div className="border-b border-app-border/40 pb-2">
                      <label className="grid gap-1">
                        <span className="text-[10px] font-semibold uppercase text-accent-warning">Усиление</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={draftDay.reinforcement}
                            onChange={(e) =>
                              patchTemplateDay(i, { reinforcement: clampInt(Number(e.target.value), 0, 24) })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-warning"
                          />
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={draftDay.reinforcementShiftHours}
                            onChange={(e) =>
                              patchTemplateDay(i, {
                                reinforcementShiftHours: clampInt(Number(e.target.value), 1, 24),
                              })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-warning"
                          />
                        </div>
                      </label>
                    </div>
                    <div className="border-b border-app-border/40 pb-2">
                      <label className="grid gap-1">
                        <span className="text-[10px] font-semibold uppercase text-accent-secondary">СтМ</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={draftDay.shiftLead}
                            onChange={(e) =>
                              patchTemplateDay(i, { shiftLead: clampInt(Number(e.target.value), 0, 24) })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-secondary"
                          />
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={draftDay.shiftLeadShiftHours}
                            onChange={(e) =>
                              patchTemplateDay(i, {
                                shiftLeadShiftHours: clampInt(Number(e.target.value), 1, 24),
                              })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-secondary"
                          />
                        </div>
                      </label>
                    </div>
                    <div>
                      <label className="grid gap-1">
                        <span className="text-[10px] font-semibold uppercase text-accent-primary">МП</span>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min={0}
                            max={24}
                            value={draftDay.rapidResponse}
                            onChange={(e) =>
                              patchTemplateDay(i, { rapidResponse: clampInt(Number(e.target.value), 0, 24) })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-primary"
                          />
                          <input
                            type="number"
                            min={1}
                            max={24}
                            value={draftDay.rapidResponseShiftHours}
                            onChange={(e) =>
                              patchTemplateDay(i, {
                                rapidResponseShiftHours: clampInt(Number(e.target.value), 1, 24),
                              })
                            }
                            className="w-1/2 rounded-button border border-app-border bg-app-bg px-2 py-1 text-center text-sm outline-none focus:border-accent-primary"
                          />
                        </div>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSavingTemplate || isLoadingTemplateBaseline}>
              <Save className="mr-2 size-4" />
              {isSavingTemplate ? "Сохранение…" : "Сохранить шаблон"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {weekdayShort.map((day, i) => (
            <div
              key={day}
              className="flex min-w-0 flex-col gap-1.5 rounded-button border border-app-border bg-app-elevated p-2 sm:gap-2 sm:p-3"
            >
              <span className="text-center text-[10px] font-bold uppercase tracking-wider text-app-muted sm:text-xs">
                {day}
              </span>
              <div className="flex flex-col items-center">
                <div className="text-lg font-bold sm:text-xl">{templateSequence.regular[i]}</div>
                <span className="text-center text-[8px] uppercase leading-tight text-app-muted sm:text-[9px]">
                  <span className="sm:hidden">осн.</span>
                  <span className="hidden sm:inline">Обычные</span>
                  {templateSequence.shiftHours?.[i] !== 24 ? ` (${templateSequence.shiftHours?.[i]}ч)` : ""}
                </span>
              </div>
              {templateSequence.reinforcement[i] > 0 && (
                <div className="mt-1 flex flex-col items-center border-t border-app-border pt-1">
                  <div className="text-base font-bold text-accent-warning sm:text-lg">
                    {templateSequence.reinforcement[i]}
                  </div>
                  <span className="text-center text-[8px] uppercase leading-tight text-accent-warning sm:text-[9px]">
                    <span className="sm:hidden">ус.</span>
                    <span className="hidden sm:inline">Усиление</span>
                    {templateSequence.reinforcementShiftHours?.[i] !== 24
                      ? ` (${templateSequence.reinforcementShiftHours?.[i]}ч)`
                      : ""}
                  </span>
                </div>
              )}
              {templateSequence.rapidResponse?.[i] > 0 && (
                <div className="mt-1 flex flex-col items-center border-t border-app-border pt-1">
                  <div className="text-base font-bold text-accent-primary sm:text-lg">
                    {templateSequence.rapidResponse[i]}
                  </div>
                  <span className="text-center text-[8px] uppercase leading-tight text-accent-primary sm:text-[9px]">
                    МП
                    {templateSequence.rapidResponseShiftHours?.[i] !== 24
                      ? ` (${templateSequence.rapidResponseShiftHours?.[i]}ч)`
                      : ""}
                  </span>
                </div>
              )}
              {templateSequence.shiftLead?.[i] > 0 && (
                <div className="mt-1 flex flex-col items-center border-t border-app-border pt-1">
                  <div className="text-base font-bold text-accent-secondary sm:text-lg">
                    {templateSequence.shiftLead[i]}
                  </div>
                  <span className="text-center text-[8px] uppercase leading-tight text-accent-secondary sm:text-[9px]">
                    СтМ
                    {templateSequence.shiftLeadShiftHours?.[i] !== 24
                      ? ` (${templateSequence.shiftLeadShiftHours?.[i]}ч)`
                      : ""}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
