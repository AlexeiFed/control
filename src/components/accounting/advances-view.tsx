"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Trash2, Wallet } from "lucide-react";
import { deleteGuardAdvanceAction, issueGuardAdvanceAction } from "../../app/accounting/advances/actions";
import type { GuardAdvanceRecord } from "../../lib/operations/advances-repository";
import {
  formatMonthYearLongRu,
  formatDisplayDateTimeLocal,
} from "../../lib/format/display-date";
import type { PayrollHalf } from "../../lib/payroll/advance-period";
import { halfPeriodLabelRu, halfPeriodShortRu } from "../../lib/payroll/advance-period";
import { Button, ButtonLink } from "../ui/button";
import { toast } from "../../store/toast-store";

type Props = {
  monthKey: string;
  advances: GuardAdvanceRecord[];
  guardOptions: Array<{ id: string; name: string }>;
  canManage: boolean;
  issuerName: string;
};

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

export function AdvancesView({ monthKey, advances, guardOptions, canManage }: Props) {
  const [isPending, startTransition] = useTransition();
  const [guardId, setGuardId] = useState(guardOptions[0]?.id ?? "");
  const [periodHalf, setPeriodHalf] = useState<PayrollHalf>("first");
  const [amountInput, setAmountInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<GuardAdvanceRecord | null>(null);

  const { year, monthIndex0 } = useMemo(() => parseMonthKey(monthKey), [monthKey]);
  const monthLabel = formatMonthYearLongRu(year, monthIndex0);

  const sortedGuards = useMemo(
    () => [...guardOptions].sort((a, b) => a.name.localeCompare(b.name, "ru-RU")),
    [guardOptions],
  );

  function handleSubmit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (!guardId) {
      toast({ title: "Выберите охранника", message: "Выберите охранника из списка", variant: "error" });
      return;
    }
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "Укажите сумму аванса", message: "Сумма должна быть больше нуля", variant: "error" });
      return;
    }

    const formData = new FormData();
    formData.set("guardId", guardId);
    formData.set("month", monthKey);
    formData.set("periodHalf", periodHalf);
    formData.set("amountRub", String(Math.round(amount)));
    formData.set("note", noteInput);

    startTransition(async () => {
      try {
        await issueGuardAdvanceAction(formData);
        setAmountInput("");
        setNoteInput("");
        toast({ title: "Аванс выдан", message: "Запись добавлена в журнал", variant: "success" });
      } catch (error) {
        toast({
          title: "Ошибка",
          message: error instanceof Error ? error.message : "Не удалось выдать аванс",
          variant: "error",
        });
      }
    });
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    const formData = new FormData();
    formData.set("id", deleteTarget.id);
    startTransition(async () => {
      try {
        await deleteGuardAdvanceAction(formData);
        setDeleteTarget(null);
        toast({ title: "Аванс удалён", message: "Запись удалена из журнала", variant: "success" });
      } catch (error) {
        toast({
          title: "Ошибка",
          message: error instanceof Error ? error.message : "Не удалось удалить аванс",
          variant: "error",
        });
      }
    });
  }

  return (
    <section className="rounded-card border border-app-border bg-app-surface p-4 shadow-glow sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-accent-primary">
            <Wallet className="size-5" />
            <span className="text-sm uppercase tracking-[0.24em]">Выплаты</span>
          </div>
          <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">Аванс</h1>
          <p className="mt-2 text-sm text-app-muted">
            Выдача авансов охранникам за полупериод: 1–15 или 16–конец месяца.
          </p>
        </div>
        <ButtonLink href="/dashboard" variant="secondary" className="w-full sm:w-auto">
          Назад
        </ButtonLink>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Предыдущий месяц"
          onClick={() => navigateMonth(monthKey, -1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="min-w-[10rem] text-center text-sm font-medium capitalize">{monthLabel}</div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Следующий месяц"
          onClick={() => navigateMonth(monthKey, 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {canManage ? (
        <form
          onSubmit={handleSubmit}
          className="mt-6 grid gap-3 rounded-lg border border-app-border bg-app-bg/40 p-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="grid gap-1 text-xs text-app-muted sm:col-span-2 lg:col-span-1">
            Охранник
            <select
              value={guardId}
              onChange={(ev) => setGuardId(ev.target.value)}
              required
              className="min-h-[2.75rem] w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
            >
              <option value="" disabled>
                Выберите…
              </option>
              {sortedGuards.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset className="grid gap-2 sm:col-span-2 lg:col-span-1">
            <legend className="text-xs text-app-muted">Период</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["first", "second"] as const).map((half) => (
                <label
                  key={half}
                  className={`flex min-h-[2.75rem] cursor-pointer items-center justify-center rounded-button border px-2 text-center text-xs font-medium transition ${
                    periodHalf === half
                      ? "border-accent-primary bg-accent-primary/10 text-accent-primary"
                      : "border-app-border bg-app-bg text-app-muted hover:border-accent-primary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="periodHalf"
                    value={half}
                    checked={periodHalf === half}
                    onChange={() => setPeriodHalf(half)}
                    className="sr-only"
                  />
                  {halfPeriodLabelRu(half, year, monthIndex0)}
                </label>
              ))}
            </div>
          </fieldset>

          <label className="grid gap-1 text-xs text-app-muted">
            Сумма, ₽
            <input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              value={amountInput}
              onChange={(ev) => setAmountInput(ev.target.value)}
              placeholder="5000"
              className="min-h-[2.75rem] w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm tabular-nums outline-none focus:border-accent-primary"
            />
          </label>

          <label className="grid gap-1 text-xs text-app-muted sm:col-span-2 lg:col-span-1">
            Примечание
            <input
              type="text"
              value={noteInput}
              onChange={(ev) => setNoteInput(ev.target.value)}
              maxLength={500}
              placeholder="Необязательно"
              className="min-h-[2.75rem] w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
            />
          </label>

          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
              {isPending ? "Сохранение…" : "Выдать аванс"}
            </Button>
          </div>
        </form>
      ) : null}

      <div className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-app-muted">Журнал выдач</h2>
        <p className="mt-1 text-xs text-app-muted">
          {advances.length === 0
            ? "За выбранный месяц авансы ещё не выдавались."
            : `${advances.length} записей за ${monthLabel}.`}
        </p>

        {advances.length === 0 ? null : (
          <>
            <div className="mt-4 hidden overflow-auto rounded-lg border border-app-border md:block">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-app-elevated text-app-muted">
                  <tr>
                    <th className="px-4 py-3">Охранник</th>
                    <th className="px-4 py-3">Период</th>
                    <th className="px-4 py-3 text-right">Сумма</th>
                    <th className="px-4 py-3">Выдал</th>
                    <th className="px-4 py-3">Дата</th>
                    {canManage ? <th className="px-4 py-3 w-12" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {advances.map((row) => (
                    <tr key={row.id} className="border-t border-app-border">
                      <td className="px-4 py-3 font-medium">{row.guardName}</td>
                      <td className="px-4 py-3 text-app-muted">
                        {halfPeriodShortRu(row.periodHalf, year, monthIndex0)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-accent-success">
                        {rub.format(row.amountRub)}
                      </td>
                      <td className="px-4 py-3 text-app-muted">{row.issuedByName || "—"}</td>
                      <td className="px-4 py-3 text-app-muted">{formatIssuedAt(row.issuedAt)}</td>
                      {canManage ? (
                        <td className="px-4 py-3">
                          <Button
                            type="button"
                            variant="icon"
                            size="icon"
                            className="text-accent-danger hover:bg-accent-danger/10"
                            aria-label="Удалить аванс"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 space-y-3 md:hidden">
              {advances.map((row) => (
                <article
                  key={row.id}
                  className="rounded-lg border border-app-border bg-app-bg/50 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{row.guardName}</div>
                      <div className="mt-1 text-xs text-app-muted">
                        {halfPeriodLabelRu(row.periodHalf, year, monthIndex0)} · {monthLabel}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-lg font-semibold tabular-nums text-accent-success">
                      {rub.format(row.amountRub)}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-app-muted">
                    <span>Выдал: {row.issuedByName || "—"}</span>
                    <span>{formatIssuedAt(row.issuedAt)}</span>
                  </div>
                  {row.note ? <p className="mt-2 text-xs text-app-muted">{row.note}</p> : null}
                  {canManage ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-auto px-0 text-xs text-accent-danger hover:bg-transparent hover:text-accent-danger"
                      onClick={() => setDeleteTarget(row)}
                    >
                      <Trash2 className="mr-1 size-3.5" />
                      Удалить
                    </Button>
                  ) : null}
                </article>
              ))}
            </div>
          </>
        )}
      </div>

      {deleteTarget ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-5 shadow-glow"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">Удалить аванс?</h3>
            <p className="mt-2 text-sm text-app-muted">
              {deleteTarget.guardName} — {rub.format(deleteTarget.amountRub)},{" "}
              {halfPeriodLabelRu(deleteTarget.periodHalf, year, monthIndex0)}.
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setDeleteTarget(null)}>
                Отмена
              </Button>
              <Button
                type="button"
                variant="danger"
                disabled={isPending}
                onClick={handleDeleteConfirm}
              >
                {isPending ? "Удаление…" : "Удалить"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function parseMonthKey(value: string): { year: number; monthIndex0: number } {
  const [yearStr, monthStr] = value.split("-");
  return { year: Number(yearStr), monthIndex0: Number(monthStr) - 1 };
}

function navigateMonth(monthKey: string, delta: number) {
  const { year, monthIndex0 } = parseMonthKey(monthKey);
  const date = new Date(Date.UTC(year, monthIndex0 + delta, 1));
  const nextKey = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  window.location.href = `/accounting/advances?month=${nextKey}`;
}

function formatIssuedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatDisplayDateTimeLocal(d);
}
