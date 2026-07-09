"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, X } from "lucide-react";
import { assignGuardProfilePeriodAction } from "../../app/guards/actions";
import { designTokens } from "../../lib/design-tokens";
import { toDateIsoKhabarovsk, formatDisplayDateFromIso } from "../../lib/format/display-date";
import { Button } from "../ui/button";

type GuardTraineeSectionProps = {
  guardId: string;
  isTrainee: boolean;
  traineeUntil: string | null;
};

export function GuardTraineeSection({ guardId, isTrainee, traineeUntil }: GuardTraineeSectionProps) {
  const [open, setOpen] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confirmOverlap, setConfirmOverlap] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!isTrainee) return null;

  const todayIso = toDateIsoKhabarovsk(new Date());

  function closeModal() {
    setOpen(false);
    setWarnings([]);
    setConfirmOverlap(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 w-fit text-xs font-semibold text-accent-primary hover:underline"
      >
        Изменить
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: `${designTokens.color.text}99` }}
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guard-trainee-modal-title"
          >
            <button
              type="button"
              className="absolute right-3 top-3 rounded-button p-2 text-app-muted hover:bg-app-elevated hover:text-app-text"
              onClick={closeModal}
              aria-label="Закрыть"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-2 pr-10">
              <GraduationCap className="size-4 text-accent-primary" />
              <h2 id="guard-trainee-modal-title" className="text-lg font-semibold text-app-text">
                Статус стажёра
              </h2>
            </div>

            <p className="mt-3 text-sm text-app-muted">
              {traineeUntil
                ? `Стажировка до ${formatDisplayDateFromIso(traineeUntil)}. После этой даты статус снимется автоматически.`
                : "Стажировка без даты окончания — снимите вручную, когда охранник станет полноценным сотрудником."}
            </p>

            <form
              className="mt-4 flex flex-col gap-3 rounded-button border border-app-border/50 bg-app-elevated p-4"
              onSubmit={(event) => {
                event.preventDefault();
                const formData = new FormData(event.currentTarget);
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
                    closeModal();
                    router.refresh();
                  }
                });
              }}
            >
              <input type="hidden" name="guardId" value={guardId} />
              <input type="hidden" name="periodKind" value="trainee" />
              {confirmOverlap ? <input type="hidden" name="confirmOverlap" value="on" /> : null}

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-app-muted">Снять статус стажёра с даты</span>
                <input
                  type="date"
                  name="effectiveFrom"
                  required
                  defaultValue={todayIso}
                  className="rounded-button border border-app-border bg-app-bg px-3 py-2 outline-none focus:border-accent-primary"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-app-muted">Комментарий</span>
                <input
                  type="text"
                  name="note"
                  placeholder="Напр.: принят в штат досрочно"
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
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">Повторите сохранение для подтверждения.</p>
                </div>
              ) : null}

              <div className="grid gap-2 sm:grid-cols-2">
                <Button type="button" variant="secondary" onClick={closeModal} disabled={pending}>
                  Отмена
                </Button>
                <Button type="submit" disabled={pending}>
                  {confirmOverlap && warnings.length > 0 ? "Подтвердить снятие" : "Снять статус стажёра"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
