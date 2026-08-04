"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { loadTemplateEditBaselineAction, saveShiftTemplatesAction } from "../../app/objects/actions";
import { Button } from "../ui/button";
import { formatDisplayDateFromIso } from "../../lib/format/display-date";
import {
  encodeTemplateTotalHours,
  templatePartTotalHours,
  type ActiveShiftsSequenceResult,
} from "../../lib/scheduling/object-shift-templates";
import { toast } from "../../store/toast-store";
import { SCHEDULE_SHORTAGE_REFRESH_EVENT } from "./global-schedule-shortage-bell";

const weekdayShort = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MAX_DAY_HOURS = 24 * 24;

type TemplateDraftDay = {
  regularHours: number;
  reinforcementHours: number;
  rapidResponseHours: number;
  shiftLeadHours: number;
};

type TemplateDraft = {
  effectiveFrom: string;
  days: TemplateDraftDay[];
};

function buildTemplateDraft(sequence: ActiveShiftsSequenceResult, effectiveFrom: string): TemplateDraft {
  return {
    effectiveFrom,
    days: Array.from({ length: 7 }, (_, i) => ({
      regularHours: templatePartTotalHours(sequence.regular[i] ?? 0, sequence.shiftHours[i] ?? 24),
      reinforcementHours: templatePartTotalHours(
        sequence.reinforcement[i] ?? 0,
        sequence.reinforcementShiftHours[i] ?? 24,
      ),
      rapidResponseHours: templatePartTotalHours(
        sequence.rapidResponse[i] ?? 0,
        sequence.rapidResponseShiftHours[i] ?? 24,
      ),
      shiftLeadHours: templatePartTotalHours(
        sequence.shiftLead[i] ?? 0,
        sequence.shiftLeadShiftHours[i] ?? 24,
      ),
    })),
  };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function HoursField({
  label,
  labelClassName,
  focusClassName,
  value,
  onChange,
}: {
  label: string;
  labelClassName: string;
  focusClassName: string;
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="grid gap-1">
      <span className={`text-[10px] font-semibold uppercase ${labelClassName}`}>{label}</span>
      <div className="relative">
        <input
          type="number"
          min={0}
          max={MAX_DAY_HOURS}
          value={value}
          onChange={(e) => onChange(clampInt(Number(e.target.value), 0, MAX_DAY_HOURS))}
          className={`w-full rounded-button border border-app-border bg-app-bg px-2 py-1.5 pr-7 text-center text-sm outline-none ${focusClassName}`}
          aria-label={`${label}, часов в сутки`}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-app-muted">
          ч
        </span>
      </div>
    </label>
  );
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
              шаблону на каждый день (часы в сутки)
            </p>
          ) : (
            <p className="mt-1 text-xs text-app-muted">
              Укажите общее число часов в сутки по типу смены. 0 — тип не нужен.
            </p>
          )}
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
              const regular = encodeTemplateTotalHours(day.regularHours);
              const reinforcement = encodeTemplateTotalHours(day.reinforcementHours);
              const rapid = encodeTemplateTotalHours(day.rapidResponseHours);
              const shiftLead = encodeTemplateTotalHours(day.shiftLeadHours);
              fd.set(`d${n}`, String(regular.count));
              fd.set(`h${n}`, String(regular.hours));
              fd.set(`r${n}`, String(reinforcement.count));
              fd.set(`rh${n}`, String(reinforcement.hours));
              fd.set(`mp${n}`, String(rapid.count));
              fd.set(`mph${n}`, String(rapid.hours));
              fd.set(`stm${n}`, String(shiftLead.count));
              fd.set(`stmh${n}`, String(shiftLead.hours));
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
              // Сетка обновляется через RSC; колокольчик держит свой fetch-стейт — форсим пересчёт.
              window.dispatchEvent(new CustomEvent(SCHEDULE_SHORTAGE_REFRESH_EVENT));
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
                      <HoursField
                        label="Обычные"
                        labelClassName="text-app-muted"
                        focusClassName="focus:border-accent-primary"
                        value={draftDay.regularHours}
                        onChange={(regularHours) => patchTemplateDay(i, { regularHours })}
                      />
                    </div>
                    <div className="border-b border-app-border/40 pb-2">
                      <HoursField
                        label="Усиление"
                        labelClassName="text-accent-warning"
                        focusClassName="focus:border-accent-warning"
                        value={draftDay.reinforcementHours}
                        onChange={(reinforcementHours) => patchTemplateDay(i, { reinforcementHours })}
                      />
                    </div>
                    <div className="border-b border-app-border/40 pb-2">
                      <HoursField
                        label="СтМ"
                        labelClassName="text-accent-secondary"
                        focusClassName="focus:border-accent-secondary"
                        value={draftDay.shiftLeadHours}
                        onChange={(shiftLeadHours) => patchTemplateDay(i, { shiftLeadHours })}
                      />
                    </div>
                    <div>
                      <HoursField
                        label="МП"
                        labelClassName="text-accent-primary"
                        focusClassName="focus:border-accent-primary"
                        value={draftDay.rapidResponseHours}
                        onChange={(rapidResponseHours) => patchTemplateDay(i, { rapidResponseHours })}
                      />
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
          {weekdayShort.map((day, i) => {
            const regularHours = templatePartTotalHours(
              templateSequence.regular[i] ?? 0,
              templateSequence.shiftHours[i] ?? 24,
            );
            const reinforcementHours = templatePartTotalHours(
              templateSequence.reinforcement[i] ?? 0,
              templateSequence.reinforcementShiftHours[i] ?? 24,
            );
            const rapidHours = templatePartTotalHours(
              templateSequence.rapidResponse[i] ?? 0,
              templateSequence.rapidResponseShiftHours[i] ?? 24,
            );
            const shiftLeadHours = templatePartTotalHours(
              templateSequence.shiftLead[i] ?? 0,
              templateSequence.shiftLeadShiftHours[i] ?? 24,
            );
            return (
              <div
                key={day}
                className="flex min-w-0 flex-col gap-1.5 rounded-button border border-app-border bg-app-elevated p-2 sm:gap-2 sm:p-3"
              >
                <span className="text-center text-[10px] font-bold uppercase tracking-wider text-app-muted sm:text-xs">
                  {day}
                </span>
                <div className="flex flex-col items-center">
                  <div className="text-lg font-bold sm:text-xl">{regularHours}</div>
                  <span className="text-center text-[8px] uppercase leading-tight text-app-muted sm:text-[9px]">
                    <span className="sm:hidden">осн. ч</span>
                    <span className="hidden sm:inline">Обычные, ч</span>
                  </span>
                </div>
                {reinforcementHours > 0 ? (
                  <div className="mt-1 flex flex-col items-center border-t border-app-border pt-1">
                    <div className="text-base font-bold text-accent-warning sm:text-lg">{reinforcementHours}</div>
                    <span className="text-center text-[8px] uppercase leading-tight text-accent-warning sm:text-[9px]">
                      <span className="sm:hidden">ус. ч</span>
                      <span className="hidden sm:inline">Усиление, ч</span>
                    </span>
                  </div>
                ) : null}
                {rapidHours > 0 ? (
                  <div className="mt-1 flex flex-col items-center border-t border-app-border pt-1">
                    <div className="text-base font-bold text-accent-primary sm:text-lg">{rapidHours}</div>
                    <span className="text-center text-[8px] uppercase leading-tight text-accent-primary sm:text-[9px]">
                      МП, ч
                    </span>
                  </div>
                ) : null}
                {shiftLeadHours > 0 ? (
                  <div className="mt-1 flex flex-col items-center border-t border-app-border pt-1">
                    <div className="text-base font-bold text-accent-secondary sm:text-lg">{shiftLeadHours}</div>
                    <span className="text-center text-[8px] uppercase leading-tight text-accent-secondary sm:text-[9px]">
                      СтМ, ч
                    </span>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
