"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignGuardProfilePeriodAction } from "../../app/guards/actions";
import { designTokens } from "../../lib/design-tokens";
import { guardPositionLabels } from "../../lib/operations/status-labels";
import { Button } from "../ui/button";
import { ClipboardList } from "lucide-react";

type GuardServiceRecordSectionProps = {
  guardId: string;
};

export function GuardServiceRecordSection({ guardId }: GuardServiceRecordSectionProps) {
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
      <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
        <ClipboardList className="size-4 text-accent-primary" />
        <h2 className="font-bold text-sm text-app-text uppercase tracking-wider">Назначить должность</h2>
      </div>

      <form
        className="mt-4 flex flex-col gap-3 rounded-button border border-app-border/50 bg-app-surface p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          startTransition(async () => {
            const result = await assignGuardProfilePeriodAction(formData);
            if (result.warnings.length > 0 && !result.ok) {
              setWarnings(result.warnings);
              setConfirmOverlap(true);
              return;
            }
            setWarnings([]);
            setConfirmOverlap(false);
            if (result.ok) {
              router.refresh();
              const form = e.target as HTMLFormElement;
              form.reset();
            }
          });
        }}
      >
        <input type="hidden" name="guardId" value={guardId} />
        <input type="hidden" name="periodKind" value="position" />
        {confirmOverlap ? <input type="hidden" name="confirmOverlap" value="on" /> : null}

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Должность</span>
          <select
            name="position"
            required
            defaultValue="Guard"
            className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
          >
            <option value="Guard">{guardPositionLabels.Guard}</option>
            <option value="ShiftLead">{guardPositionLabels.ShiftLead}</option>
            <option value="Curator">{guardPositionLabels.Curator}</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">С даты</span>
          <input
            type="date"
            name="effectiveFrom"
            required
            className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">По дату (пусто — бессрочно)</span>
          <input
            type="date"
            name="effectiveTo"
            className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-app-muted font-medium">Комментарий</span>
          <input
            type="text"
            name="note"
            placeholder="Необязательно"
            className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
          />
        </label>

        {warnings.length > 0 ? (
          <div
            className="rounded-button border px-3 py-2 text-sm"
            style={{
              borderColor: `${designTokens.color.accent.warning}40`,
              backgroundColor: `${designTokens.color.accent.warning}12`,
              color: designTokens.color.accent.warning,
            }}
          >
            <p className="font-semibold">Пересечение периодов</p>
            <ul className="mt-1 list-disc pl-4">
              {warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs">Повторите сохранение для подтверждения.</p>
          </div>
        ) : null}

        <div className="mt-2">
          <Button type="submit" disabled={pending} className="w-full">
            {confirmOverlap && warnings.length > 0 ? "Подтвердить назначение" : "Назначить"}
          </Button>
        </div>
      </form>
    </article>
  );
}
