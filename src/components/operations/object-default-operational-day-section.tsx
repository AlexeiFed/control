"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateObjectOperationalDayStartTimeAction } from "../../app/objects/actions";
import { Button } from "../ui/button";
import { toast } from "../../store/toast-store";
import { designTokens } from "../../lib/design-tokens";

type ObjectDefaultOperationalDaySectionProps = {
  objectId: string;
  defaultOperationalDayStartTime: string;
  canManage: boolean;
};

export function ObjectDefaultOperationalDaySection({
  objectId,
  defaultOperationalDayStartTime,
  canManage,
}: ObjectDefaultOperationalDaySectionProps) {
  const router = useRouter();
  const [draft, setDraft] = useState(defaultOperationalDayStartTime);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(defaultOperationalDayStartTime);
  }, [defaultOperationalDayStartTime]);

  const dirty = draft !== defaultOperationalDayStartTime;

  async function save() {
    setSaving(true);
    try {
      const fd = new FormData();
      fd.set("objectId", objectId);
      fd.set("operationalDayStartTime", draft);
      const result = await updateObjectOperationalDayStartTimeAction(fd);
      if (!result.ok) {
        toast({ title: "Не сохранено", message: result.error, variant: "error" });
        return;
      }
      toast({
        title: "Сохранено",
        message: `Для новых месяцев: ${draft} – ${draft} (+1)`,
        variant: "success",
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className="rounded-card border border-app-border bg-app-surface p-4 shadow-glow sm:p-6"
      style={{ borderColor: designTokens.color.border }}
    >
      <h2 className="mb-1 text-lg font-semibold">Операционные сутки по умолчанию</h2>
      <p className="mb-4 text-xs text-app-muted">
        Используется для новых месяцев, у которых ещё нет своей настройки в графике.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1">
          <label htmlFor={`default-op-day-${objectId}`} className="text-[10px] font-semibold uppercase tracking-wide text-app-muted">
            Начало суток
          </label>
          <input
            id={`default-op-day-${objectId}`}
            type="time"
            step={900}
            value={draft}
            disabled={!canManage || saving}
            onChange={(e) => setDraft(e.target.value)}
            className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm tabular-nums outline-none focus:border-accent-primary disabled:opacity-60"
          />
        </div>
        {canManage ? (
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
