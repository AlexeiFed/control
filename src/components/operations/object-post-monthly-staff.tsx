"use client";

import { useState } from "react";
import { Users } from "lucide-react";
import { Button } from "../ui/button";
import { replaceMonthlyPostGuardsAction } from "../../app/objects/actions";
import { designTokens } from "../../lib/design-tokens";

type ObjectPostMonthlyStaffProps = {
  objectId: string;
  postId: string;
  month: string;
  objectGuardIds: string[];
  assignedGuardIds: string[];
  guardNames: Record<string, string>;
  canManage: boolean;
};

export function ObjectPostMonthlyStaff({
  objectId,
  postId,
  month,
  objectGuardIds,
  assignedGuardIds,
  guardNames,
  canManage,
}: ObjectPostMonthlyStaffProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function toggleGuard(guardId: string, checked: boolean) {
    if (!canManage || pending) return;
    const next = checked
      ? [...new Set([...assignedGuardIds, guardId])]
      : assignedGuardIds.filter((id) => id !== guardId);

    setPending(true);
    try {
      const fd = new FormData();
      fd.set("objectId", objectId);
      fd.set("postId", postId);
      fd.set("month", month);
      fd.set("guardIds", next.join(","));
      await replaceMonthlyPostGuardsAction(fd);
    } finally {
      setPending(false);
    }
  }

  if (!canManage && assignedGuardIds.length === 0) return null;

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 gap-1 px-2 text-xs text-app-muted"
        onClick={() => setOpen((v) => !v)}
        disabled={!canManage && assignedGuardIds.length === 0}
      >
        <Users className="size-3.5" />
        Штат ({assignedGuardIds.length})
      </Button>

      {open && canManage ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-full z-50 mt-1 min-w-[220px] rounded-button border border-app-border bg-app-surface p-2 shadow-lg"
            style={{ borderColor: designTokens.color.border }}
          >
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-app-muted">
              Штат поста на месяц
            </p>
            {objectGuardIds.length === 0 ? (
              <p className="px-1 py-2 text-xs text-app-muted">
                Сначала назначьте охранников на объект.
              </p>
            ) : (
              <div className="max-h-48 space-y-0.5 overflow-auto">
                {objectGuardIds.map((guardId) => {
                  const checked = assignedGuardIds.includes(guardId);
                  return (
                    <label
                      key={guardId}
                      className="flex cursor-pointer items-center gap-2 rounded-button px-2 py-1.5 text-xs hover:bg-app-elevated"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={(e) => void toggleGuard(guardId, e.target.checked)}
                        className="size-3.5 rounded border-app-border"
                      />
                      <span>{guardNames[guardId] ?? "Неизвестный"}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
