"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { FileSignature, X } from "lucide-react";
import { updateObjectTimesheetApprovalAction } from "../../app/objects/actions";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import { Button } from "../ui/button";
import { toast } from "../../store/toast-store";

type Props = {
  object: Pick<
    ObjectListRow,
    | "id"
    | "timesheetDirectorName"
    | "timesheetDirectorRole"
    | "timesheetSiteManagerEnabled"
  >;
};

export function ObjectTimesheetApprovalSection({ object }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <div className="space-y-4 border-t border-app-border pt-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wider text-app-muted">Подписи в табеле</span>
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            <FileSignature className="size-4" />
            Изменить
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-app-muted">Руководитель</span>
            <p className="text-sm">{object.timesheetDirectorName || "—"}</p>
          </div>
          <div className="grid gap-1">
            <span className="text-xs uppercase tracking-wider text-app-muted">Наименование должности</span>
            <p className="text-sm">{object.timesheetDirectorRole || "—"}</p>
          </div>
          <div className="grid gap-1 sm:col-span-2">
            <span className="text-xs uppercase tracking-wider text-app-muted">Начальник объекта</span>
            <p className="text-sm">{object.timesheetSiteManagerEnabled ? "Есть" : "Нет"}</p>
          </div>
        </div>
      </div>

      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-[#0F172A]/45 p-4 backdrop-blur-[2px] sm:items-center"
              role="dialog"
              aria-modal="true"
              aria-labelledby="object-timesheet-approval-title"
              onClick={() => !pending && setOpen(false)}
            >
              <div
                className="w-full max-w-lg overflow-hidden rounded-card border border-app-border bg-app-surface shadow-glow"
                onClick={(ev) => ev.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3 border-b border-app-border px-5 py-4">
                  <div>
                    <h2 id="object-timesheet-approval-title" className="text-lg font-semibold">
                      Подписи в табеле
                    </h2>
                    <p className="mt-1 text-sm text-app-muted">
                      Блоки «Согласовано» и «Утверждаю» в Excel-табеле по этому объекту.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => !pending && setOpen(false)}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-button border border-app-border bg-app-surface text-app-muted transition hover:border-accent-primary/30 hover:text-app-text"
                    aria-label="Закрыть"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <form
                  className="space-y-4 p-5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    startTransition(async () => {
                      const result = await updateObjectTimesheetApprovalAction(formData);
                      if (!result.ok) {
                        toast({ message: result.error, variant: "error" });
                        return;
                      }
                      toast({ message: "Подписи табеля сохранены", variant: "success" });
                      setOpen(false);
                      router.refresh();
                    });
                  }}
                >
                  <input type="hidden" name="objectId" value={object.id} />

                  <div className="grid gap-2">
                    <label className="text-xs uppercase tracking-wider text-app-muted" htmlFor="directorRole">
                      Наименование должности
                    </label>
                    <input
                      id="directorRole"
                      name="directorRole"
                      defaultValue={object.timesheetDirectorRole}
                      placeholder='Директор ООО "СЗ ДАУП"'
                      className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-xs uppercase tracking-wider text-app-muted" htmlFor="directorName">
                      Руководитель
                    </label>
                    <input
                      id="directorName"
                      name="directorName"
                      defaultValue={object.timesheetDirectorName}
                      placeholder="М.А. Плотников"
                      className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    />
                  </div>

                  <div className="grid gap-2">
                    <span className="text-xs uppercase tracking-wider text-app-muted">Начальник объекта</span>
                    <div className="flex gap-4 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="siteManagerEnabled"
                          value="true"
                          defaultChecked={object.timesheetSiteManagerEnabled}
                        />
                        Есть
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="siteManagerEnabled"
                          value="false"
                          defaultChecked={!object.timesheetSiteManagerEnabled}
                        />
                        Нет
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <Button type="button" variant="secondary" disabled={pending} onClick={() => setOpen(false)}>
                      Отмена
                    </Button>
                    <Button type="submit" disabled={pending}>
                      {pending ? "Сохранение…" : "Сохранить"}
                    </Button>
                  </div>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
