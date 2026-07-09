"use client";

import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Banknote,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileSpreadsheet,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition, type FormEvent } from "react";
import {
  addCuratorWorkEntryAction,
  createCuratorAction,
  deleteCuratorAction,
  deleteCuratorWorkEntryAction,
  fetchCuratorDayEntriesAction,
  fetchCuratorMonthAggregatesAction,
  backfillCuratorShiftsAction,
  updateCuratorMonthlyPaymentAction,
  updateCuratorTariffsAction,
  updateCuratorWorkEntryAction,
} from "../../app/admin/curators/actions";
import { Button, ButtonLink, buttonVariants } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  computeCuratorEntryRub,
  curatorWorkTypeLabels,
  isScheduleCuratorWorkType,
  type CuratorTariffs,
  type CuratorWorkType,
} from "../../lib/curators/work-entry-amount";
import { CURATORS_OFFICE_TIMEZONE } from "../../lib/curators/khabarovsk-date";
import { designTokens } from "../../lib/design-tokens";
import { toast } from "../../store/toast-store";
import {
  formatDisplayDateFromIso,
  getDaysInMonth,
  formatMonthYearLongRu,
} from "../../lib/format/display-date";

const CAL_COLS = "repeat(7, minmax(0, 1fr))" as const;

export type CuratorDashboardRow = {
  id: string;
  guardId: string;
  firstName: string;
  lastName: string;
  totalRub: number;
};

type DayEntry = {
  id: string;
  curatorId: string;
  curatorName: string;
  workType: CuratorWorkType;
  hours: number | null;
  amountRub: number;
  isBaseIncluded: boolean;
  customHourlyRate: number | null;
  shiftId: string | null;
  objectId: string | null;
  description: string;
  paymentFormula: string;
  ruleName: string | null;
  objectHourlyRateRub: number | null;
  isAdminLocked: boolean;
};

const manualWorkTypes = [
  "RouteObjects",
  "NightInspection",
  "ReplacementShift",
  "MonthlySalary",
] as const satisfies readonly CuratorWorkType[];

type CuratorPaymentState = {
  isPaid: boolean;
  paidAmountRub: number;
};

type Props = {
  todayIso: string;
  initialSelectedIso: string;
  curators: CuratorDashboardRow[];
  initialSumsByDate: Record<string, number>;
  initialRubByCuratorId: Record<string, number>;
  initialPaymentsByCuratorId: Record<string, CuratorPaymentState>;
  initialMonthlySalaryIsoByCuratorId: Record<string, string>;
  initialDayEntries: DayEntry[];
  initialTariffs: CuratorTariffs;
};

const rub = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

function clampTariffInt(raw: string): number {
  const n = Math.round(Number(raw.replace(",", ".")) || 0);
  return Math.min(9_999_999, Math.max(0, n));
}

function parseIso(iso: string): { y: number; m0: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m0: m - 1, d };
}

/** Сетка по месяцу (UTC-безопасно), Пн — первый день недели. */
function buildMonthGrid(year: number, monthIndex0: number): Array<Array<number | null>> {
  const first = new Date(Date.UTC(year, monthIndex0, 1));
  const startWeekday = (first.getUTCDay() + 6) % 7;
  const daysInMonth = getDaysInMonth(year, monthIndex0);
  const cells: Array<number | null> = [];
  for (let i = 0; i < startWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: Array<Array<number | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    rows.push(cells.slice(i, i + 7));
  }
  return rows;
}

function isoFromParts(y: number, m0: number, day: number): string {
  return `${String(y).padStart(4, "0")}-${String(m0 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function isoToUtcDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function utcDateToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftIsoDays(iso: string, days: number): string {
  const next = isoToUtcDate(iso);
  next.setUTCDate(next.getUTCDate() + days);
  return utcDateToIso(next);
}

function monthStartIso(y: number, m0: number): string {
  return isoFromParts(y, m0, 1);
}

function monthEndIso(y: number, m0: number): string {
  const days = getDaysInMonth(y, m0);
  return isoFromParts(y, m0, days);
}

function fortnightStartIso(selectedIso: string): string {
  const day = isoToUtcDate(selectedIso);
  const weekdayMonFirst = (day.getUTCDay() + 6) % 7;
  return shiftIsoDays(selectedIso, -weekdayMonFirst);
}

export function CuratorsDashboard({
  todayIso,
  initialSelectedIso,
  curators,
  initialSumsByDate,
  initialRubByCuratorId,
  initialPaymentsByCuratorId,
  initialMonthlySalaryIsoByCuratorId,
  initialDayEntries,
  initialTariffs,
}: Props) {
  const initialParts = useMemo(() => parseIso(initialSelectedIso), [initialSelectedIso]);
  const [viewY, setViewY] = useState(initialParts.y);
  const [viewM0, setViewM0] = useState(initialParts.m0);
  const [selectedIso, setSelectedIso] = useState(initialSelectedIso);
  const [sumsByDate, setSumsByDate] = useState(initialSumsByDate);
  const [rubByCuratorId, setRubByCuratorId] = useState(initialRubByCuratorId);
  const [paymentsByCuratorId, setPaymentsByCuratorId] = useState(initialPaymentsByCuratorId);
  const [monthlySalaryIsoByCuratorId, setMonthlySalaryIsoByCuratorId] = useState(
    initialMonthlySalaryIsoByCuratorId,
  );
  const [dayEntries, setDayEntries] = useState(initialDayEntries);
  const [selectedCuratorId, setSelectedCuratorId] = useState<string | null>(curators[0]?.id ?? null);
  const [workType, setWorkType] = useState<CuratorWorkType>("RouteObjects");
  const [hoursInput, setHoursInput] = useState("1");
  const [isBaseIncluded, setIsBaseIncluded] = useState(true);
  const [customHourlyRateInput, setCustomHourlyRateInput] = useState("");
  const [monthlySalaryRubInput, setMonthlySalaryRubInput] = useState("");
  const [amountRubInput, setAmountRubInput] = useState("");
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget] = useState<{
    id: string;
    curatorName: string;
    workLabel: string;
    amountLabel: string;
  } | null>(null);
  const [pendingPreview, setPendingPreview] = useState<number | null>(null);
  const [exportPeriod, setExportPeriod] = useState<"month" | "fortnight">("month");
  const [tariffs, setTariffs] = useState<CuratorTariffs>(initialTariffs);
  const [isSavingEntry, startSaveEntry] = useTransition();

  useEffect(() => {
    setTariffs(initialTariffs);
  }, [
    initialTariffs.routeBaseRub,
    initialTariffs.routeHourlyRub,
    initialTariffs.nightInspectionRub,
    initialTariffs.replacementHourlyRub,
    initialTariffs.scheduleRegularHourlyRub,
  ]);

  const monthLabel = useMemo(() => {
    return formatMonthYearLongRu(viewY, viewM0);
  }, [viewY, viewM0]);

  const reloadMonth = useCallback(async () => {
    const next = await fetchCuratorMonthAggregatesAction(viewY, viewM0);
    setSumsByDate(next.sumsByDate);
    setRubByCuratorId(next.rubByCuratorId);
    setPaymentsByCuratorId(next.paymentsByCuratorId);
    setMonthlySalaryIsoByCuratorId(next.monthlySalaryIsoByCuratorId);
  }, [viewY, viewM0]);

  const saveCuratorPayment = useCallback(
    async (curatorId: string, patch: Partial<CuratorPaymentState>) => {
      const current = paymentsByCuratorId[curatorId] ?? { isPaid: false, paidAmountRub: 0 };
      const next: CuratorPaymentState = {
        isPaid: patch.isPaid ?? current.isPaid,
        paidAmountRub: patch.paidAmountRub ?? current.paidAmountRub,
      };
      setPaymentsByCuratorId((prev) => ({ ...prev, [curatorId]: next }));
      try {
        await updateCuratorMonthlyPaymentAction({
          curatorId,
          year: viewY,
          monthIndex0: viewM0,
          isPaid: next.isPaid,
          paidAmountRub: next.paidAmountRub,
        });
      } catch {
        setPaymentsByCuratorId((prev) => ({ ...prev, [curatorId]: current }));
      }
    },
    [paymentsByCuratorId, viewM0, viewY],
  );

  const reloadDay = useCallback(async () => {
    const rows = await fetchCuratorDayEntriesAction(selectedIso);
    setDayEntries(rows);
  }, [selectedIso]);

  const resetEntryForm = useCallback(() => {
    setEditingEntryId(null);
    setWorkType("RouteObjects");
    setHoursInput("1");
    setIsBaseIncluded(true);
    setCustomHourlyRateInput("");
    setMonthlySalaryRubInput("");
    setAmountRubInput("");
  }, []);

  const refreshEntryViews = useCallback(async () => {
    await Promise.all([reloadDay(), reloadMonth()]);
  }, [reloadDay, reloadMonth]);

  const handleEntryFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      if (workType === "RouteObjects") {
        formData.set("isBaseIncluded", isBaseIncluded ? "true" : "false");
      }
      const save = editingEntryId ? updateCuratorWorkEntryAction : addCuratorWorkEntryAction;
      startSaveEntry(() => {
        void (async () => {
          try {
            await save(formData);
            await refreshEntryViews();
            resetEntryForm();
          } catch (err) {
            const message = err instanceof Error ? err.message : "Не удалось сохранить начисление";
            toast({ title: "Ошибка", message, variant: "error", durationMs: 6500 });
          }
        })();
      });
    },
    [workType, isBaseIncluded, editingEntryId, refreshEntryViews, resetEntryForm],
  );

  const handleScheduleEntryFormSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      startSaveEntry(() => {
        void (async () => {
          await updateCuratorWorkEntryAction(formData);
          await refreshEntryViews();
          resetEntryForm();
        })();
      });
    },
    [refreshEntryViews, resetEntryForm],
  );

  const handleDeleteEntryConfirm = useCallback(() => {
    if (!deleteEntryTarget) return;
    const formData = new FormData();
    formData.set("entryId", deleteEntryTarget.id);
    formData.set("workDate", selectedIso);
    startSaveEntry(() => {
      void (async () => {
        await deleteCuratorWorkEntryAction(formData);
        await refreshEntryViews();
        setDeleteEntryTarget(null);
      })();
    });
  }, [deleteEntryTarget, selectedIso, refreshEntryViews]);

  useEffect(() => {
    void reloadMonth();
  }, [reloadMonth]);

  useEffect(() => {
    void reloadDay();
  }, [reloadDay]);

  useEffect(() => {
    if (workType === "NightInspection") {
      setPendingPreview(computeCuratorEntryRub("NightInspection", null, tariffs));
      return;
    }
    if (workType === "MonthlySalary") {
      const salary = monthlySalaryRubInput.trim() !== "" ? Number(monthlySalaryRubInput.replace(",", ".")) : null;
      setPendingPreview(
        salary != null && salary > 0
          ? computeCuratorEntryRub("MonthlySalary", null, tariffs, { monthlySalaryRub: salary })
          : null,
      );
      return;
    }
    const h = Number(hoursInput.replace(",", ".")) || 0;
    const customRate = customHourlyRateInput ? Number(customHourlyRateInput.replace(",", ".")) : null;
    setPendingPreview(
      h > 0
        ? computeCuratorEntryRub(workType, h, tariffs, {
            isBaseIncluded,
            customHourlyRate: customRate,
          })
        : null,
    );
  }, [workType, hoursInput, tariffs, isBaseIncluded, customHourlyRateInput, monthlySalaryRubInput]);

  const grid = useMemo(() => buildMonthGrid(viewY, viewM0), [viewY, viewM0]);

  const dayTotal = useMemo(
    () => dayEntries.reduce((a, e) => a + e.amountRub, 0),
    [dayEntries],
  );

  const monthTotalRub = useMemo(
    () => Object.values(sumsByDate).reduce((a, v) => a + v, 0),
    [sumsByDate],
  );

  const editingEntry = useMemo(
    () => (editingEntryId ? dayEntries.find((e) => e.id === editingEntryId) ?? null : null),
    [dayEntries, editingEntryId],
  );

  const selectedCuratorMonthlySalaryIso = useMemo(() => {
    if (!selectedCuratorId) return null;
    return monthlySalaryIsoByCuratorId[selectedCuratorId] ?? null;
  }, [monthlySalaryIsoByCuratorId, selectedCuratorId]);

  const isEditingMonthlySalaryEntry = editingEntry?.workType === "MonthlySalary";

  const monthlySalaryBlocked = useMemo(() => {
    if (workType !== "MonthlySalary" || !selectedCuratorMonthlySalaryIso) return false;
    if (isEditingMonthlySalaryEntry && editingEntryId) return false;
    return true;
  }, [workType, selectedCuratorMonthlySalaryIso, isEditingMonthlySalaryEntry, editingEntryId]);

  const isEditingSchedule =
    editingEntry?.shiftId != null && isScheduleCuratorWorkType(editingEntry.workType);

  const exportRange = useMemo(() => {
    if (exportPeriod === "fortnight") {
      const startIso = fortnightStartIso(selectedIso);
      const endIso = shiftIsoDays(startIso, 13);
      return {
        startIso,
        endIso,
        label: `2 недели: ${formatDisplayDateFromIso(startIso)}..${formatDisplayDateFromIso(endIso)}`,
      };
    }

    const startIso = monthStartIso(viewY, viewM0);
    const endIso = monthEndIso(viewY, viewM0);
    return {
      startIso,
      endIso,
      label: `Месяц: ${formatDisplayDateFromIso(startIso)}..${formatDisplayDateFromIso(endIso)}`,
    };
  }, [exportPeriod, selectedIso, viewM0, viewY]);

  const t13ExportHref = useMemo(() => {
    const params = new URLSearchParams();
    params.set("start", exportRange.startIso);
    params.set("end", exportRange.endIso);
    params.set("period", exportPeriod);
    return `/api/admin/curators/export/t13?${params.toString()}`;
  }, [exportPeriod, exportRange.endIso, exportRange.startIso]);

  function shiftMonth(delta: number) {
    const d = new Date(Date.UTC(viewY, viewM0 + delta, 1));
    setViewY(d.getUTCFullYear());
    setViewM0(d.getUTCMonth());
  }

  return (
    <main className="min-h-screen bg-app-bg p-6 text-app-text">
      <motion.section
        initial={false}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-accent-primary">
              <ClipboardList className="size-5" />
              <span className="text-sm uppercase tracking-[0.24em]">Администрирование</span>
            </div>
            <h1 className="mt-3 text-3xl font-semibold">Кураторы</h1>
            <p className="mt-2 max-w-2xl text-sm text-app-muted">
              Учёт по дням и расчёт начислений. «Сегодня» — по хабаровскому времени (UTC+10). В календаре отмечены дни с
              суммами.
            </p>
          </div>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div
              className="flex items-center gap-2 rounded-card border border-app-border bg-app-elevated px-4 py-3 text-sm"
              style={{ boxShadow: `0 0 24px ${designTokens.color.accent.primary}22` }}
            >
              <Wallet className="size-4 text-accent-success" />
              <div>
                <div className="text-xs uppercase tracking-wider text-app-muted">Всего начислено</div>
                <div className="font-semibold tabular-nums text-accent-success">{rub.format(monthTotalRub)}</div>
              </div>
            </div>
            <ButtonLink href="/dashboard" variant="secondary">
              Назад
            </ButtonLink>
          </div>
        </div>

        <div className="mt-8 grid w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1.35fr)_minmax(0,0.8fr)]">
          <aside className="min-w-0 overflow-hidden">
            <div className="rounded-card border border-app-border bg-app-elevated p-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-app-muted">Кураторы</h2>
              <form action={createCuratorAction} className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <input
                  name="firstName"
                  required
                  placeholder="Имя"
                  className="min-h-[2.25rem] w-full min-w-0 rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent-primary"
                />
                <input
                  name="lastName"
                  required
                  placeholder="Фамилия"
                  className="min-h-[2.25rem] w-full min-w-0 rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm outline-none focus:border-accent-primary"
                />
                <Button
                  type="submit"
                  size="sm"
                  className="shrink-0"
                >
                  <Plus className="size-3.5" />
                  Добавить
                </Button>
              </form>

              <ul className="mt-4 max-h-[620px] space-y-2 overflow-y-auto pr-1">
                {curators.map((c) => {
                  const active = selectedCuratorId === c.id;
                  const payment = paymentsByCuratorId[c.id] ?? { isPaid: false, paidAmountRub: 0 };
                  return (
                    <li key={c.id}>
                      <div
                        className={`flex items-center gap-1.5 rounded-button border px-2 py-1.5 text-sm transition ${
                          active ? "border-accent-primary bg-app-bg" : "border-app-border hover:border-accent-primary/60"
                        }`}
                      >
                        <Button
                          type="button"
                          onClick={() => setSelectedCuratorId(c.id)}
                          variant="ghost"
                          className="h-auto min-w-0 flex-1 justify-start px-0 py-0 text-left hover:bg-transparent"
                        >
                          <div className="truncate font-medium leading-tight">
                            {c.lastName} {c.firstName}
                          </div>
                          <div className="truncate text-[11px] tabular-nums text-accent-success">
                            {rub.format(rubByCuratorId[c.id] ?? 0)}
                          </div>
                        </Button>
                        <div
                          className="flex shrink-0 items-center gap-1"
                          onClick={(ev) => ev.stopPropagation()}
                        >
                          <Checkbox
                            id={`paid-${c.id}`}
                            checked={payment.isPaid}
                            onCheckedChange={(checked) => {
                              void saveCuratorPayment(c.id, { isPaid: !!checked });
                            }}
                            aria-label="Выплачено"
                          />
                          <input
                            type="number"
                            min={0}
                            step={1}
                            title="Сумма выплаты, ₽"
                            value={payment.paidAmountRub || ""}
                            placeholder="₽"
                            onChange={(ev) => {
                              const raw = ev.target.value;
                              const paidAmountRub = raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0));
                              setPaymentsByCuratorId((prev) => ({
                                ...prev,
                                [c.id]: { ...payment, paidAmountRub },
                              }));
                            }}
                            onBlur={(ev) => {
                              const raw = ev.target.value;
                              const paidAmountRub = raw === "" ? 0 : Math.max(0, Math.round(Number(raw) || 0));
                              void saveCuratorPayment(c.id, { paidAmountRub });
                            }}
                            className="h-7 w-16 rounded-button border border-app-border bg-app-bg px-1.5 text-[11px] tabular-nums outline-none focus:border-accent-primary"
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={() => {
                            setDeleteEntryTarget(null);
                            setDeleteTarget({
                              id: c.id,
                              name: `${c.lastName} ${c.firstName}`.trim(),
                            });
                          }}
                          variant="icon"
                          size="icon"
                          className="size-7 shrink-0 text-accent-danger hover:bg-accent-danger/10"
                          aria-label="Удалить куратора"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
                {curators.length === 0 ? <p className="text-sm text-app-muted">Добавьте первого куратора.</p> : null}
              </ul>
            </div>
          </aside>

          <section className="min-w-0 overflow-hidden">
            <div className="rounded-card border border-app-border bg-app-elevated p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2 text-accent-primary">
                  <CalendarRange className="size-4 shrink-0" />
                  <span className="truncate text-sm font-semibold capitalize">{monthLabel}</span>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    variant="secondary"
                    size="icon"
                    aria-label="Предыдущий месяц"
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    variant="secondary"
                    size="icon"
                    aria-label="Следующий месяц"
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
              </div>

              <div
                className="mt-3 grid gap-1 text-center text-xs uppercase tracking-wide text-app-muted"
                style={{ gridTemplateColumns: CAL_COLS }}
              >
                {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                  <div key={d} className="rounded-md bg-app-bg/60 px-1 py-1.5">
                    {d}
                  </div>
                ))}
              </div>

              <div className="mt-1.5 grid gap-1">
                {grid.map((week, wi) => (
                  <div key={wi} className="grid gap-1" style={{ gridTemplateColumns: CAL_COLS }}>
                    {week.map((day, di) => {
                      if (day == null) {
                        return <div key={`e-${wi}-${di}`} className="min-h-[4rem] rounded-md bg-app-bg/20" />;
                      }
                      const iso = isoFromParts(viewY, viewM0, day);
                      const sum = sumsByDate[iso] ?? 0;
                      const isSelected = iso === selectedIso;
                      const isToday = iso === todayIso;
                      return (
                        <Button
                          key={iso}
                          type="button"
                          onClick={() => setSelectedIso(iso)}
                          variant="outline"
                          className={`min-h-[4rem] flex-col rounded-md px-1 py-1 text-xs leading-tight ${
                            isSelected
                              ? "border-accent-primary bg-accent-primary/10 font-semibold text-accent-primary"
                              : "border-app-border/50 bg-app-bg/60 hover:border-accent-primary/40"
                          } ${isToday && !isSelected ? "ring-1 ring-accent-warning/60" : ""}`}
                        >
                          <span className="text-sm">{day}</span>
                          {sum > 0 ? (
                            <span className="mt-1 text-[10px] font-medium tabular-nums leading-tight text-accent-success">
                              {rub.format(sum)}
                            </span>
                          ) : (
                            <span className="mt-1 h-3.5 shrink-0 text-[10px] text-app-muted/50">—</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-button border border-app-border bg-app-bg/50 p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-app-muted">Экспорт Т-13</div>
                    <div className="mt-1 text-xs text-app-muted">{exportRange.label}</div>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                    <select
                      value={exportPeriod}
                      onChange={(ev) => setExportPeriod(ev.target.value as "month" | "fortnight")}
                      className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                    >
                      <option value="month">За месяц</option>
                      <option value="fortnight">За 2 недели</option>
                    </select>
                    <a
                      href={t13ExportHref}
                      className={buttonVariants()}
                    >
                      <FileSpreadsheet className="size-4" />
                      Скачать Т-13 (CSV)
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-w-0 overflow-hidden">
            <div className="rounded-card border border-app-border bg-app-elevated p-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-app-muted">Выбранный день</h2>
                  <p className="mt-1 font-mono text-lg text-app-text">{formatDisplayDateFromIso(selectedIso)}</p>
                  <p className="mt-1 text-xs text-app-muted">{selectedIso === todayIso ? "Сегодня (Хабаровск)" : null}</p>
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase tracking-wider text-app-muted">За день</div>
                  <div className="text-xl font-semibold tabular-nums text-accent-success">{rub.format(dayTotal)}</div>
                </div>
              </div>

              <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto rounded-lg border border-app-border bg-app-bg/50 p-3 text-sm">
                {dayEntries.length === 0 ? (
                  <p className="text-app-muted">Нет записей за этот день.</p>
                ) : (
                  dayEntries.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap items-start justify-between gap-2 border-b border-app-border/60 pb-2 last:border-b-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{e.curatorName}</span>
                          {e.shiftId ? (
                            <span className="rounded bg-accent-primary/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-primary">
                              График
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-app-muted">{e.description || curatorWorkTypeLabels[e.workType]}</p>
                        {e.objectHourlyRateRub != null && isScheduleCuratorWorkType(e.workType) ? (
                          <p className="text-xs text-app-muted">
                            Ставка на объекте (табель): {rub.format(e.objectHourlyRateRub)}/ч
                          </p>
                        ) : null}
                        {e.hours != null ? <p className="text-xs text-app-muted">{e.hours} ч</p> : null}
                        {e.paymentFormula ? (
                          <p className="mt-0.5 text-[11px] leading-snug text-app-muted">{e.paymentFormula}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <div className="tabular-nums font-semibold text-accent-success">{rub.format(e.amountRub)}</div>
                        <Button
                          type="button"
                          onClick={() => {
                            setEditingEntryId(e.id);
                            setSelectedCuratorId(e.curatorId);
                            setWorkType(e.workType);
                            setHoursInput(String(e.hours ?? ""));
                            setIsBaseIncluded(e.isBaseIncluded);
                            setCustomHourlyRateInput(e.customHourlyRate != null ? String(e.customHourlyRate) : "");
                            setMonthlySalaryRubInput(
                              e.workType === "MonthlySalary" ? String(e.amountRub) : "",
                            );
                            setAmountRubInput(String(e.amountRub));
                          }}
                          variant="icon"
                          size="icon"
                          className="text-accent-primary hover:bg-accent-primary/10"
                          aria-label="Редактировать начисление"
                        >
                          <Pencil className="size-4" />
                        </Button>
                        {!e.shiftId ? (
                          <Button
                            type="button"
                            onClick={() => {
                              setDeleteTarget(null);
                              setDeleteEntryTarget({
                                id: e.id,
                                curatorName: e.curatorName,
                                workLabel: e.description || curatorWorkTypeLabels[e.workType],
                                amountLabel: rub.format(e.amountRub),
                              });
                            }}
                            variant="icon"
                            size="icon"
                            className="text-accent-danger hover:bg-accent-danger/10"
                            aria-label="Удалить начисление"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="mt-4 border-t border-app-border pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-app-text">
                    {editingEntryId ? "Редактировать начисление" : "Добавить начисление"}
                  </h3>
                  {editingEntryId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={resetEntryForm}
                      className="h-auto px-2 py-1 text-xs text-app-muted hover:text-app-text"
                    >
                      Отмена
                    </Button>
                  )}
                </div>
                {!selectedCuratorId ? (
                  <p className="mt-2 text-sm text-app-muted">Выберите куратора в списке слева.</p>
                ) : isEditingSchedule && editingEntry ? (
                  <form onSubmit={handleScheduleEntryFormSubmit} className="mt-3 grid gap-3">
                    <input type="hidden" name="id" value={editingEntry.id} />
                    <input type="hidden" name="curatorId" value={selectedCuratorId} />
                    <input type="hidden" name="workDate" value={selectedIso} />
                    <input type="hidden" name="workType" value={editingEntry.workType} />
                    <input type="hidden" name="hours" value={editingEntry.hours ?? ""} />
                    <p className="text-sm text-app-text">{editingEntry.description}</p>
                    {editingEntry.paymentFormula ? (
                      <p className="text-[11px] leading-snug text-app-muted">{editingEntry.paymentFormula}</p>
                    ) : null}
                    {isScheduleCuratorWorkType(editingEntry.workType) ? (
                      <label className="grid gap-1 text-xs text-app-muted">
                        Доплата, ₽/ч (по умолчанию {rub.format(tariffs.scheduleRegularHourlyRub)}/ч)
                        <input
                          name="customHourlyRate"
                          type="number"
                          step="0.01"
                          min="0"
                          value={customHourlyRateInput}
                          onChange={(ev) => setCustomHourlyRateInput(ev.target.value)}
                          className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                        />
                      </label>
                    ) : null}
                    <label className="grid gap-1 text-xs text-app-muted">
                      К выплате, ₽
                      <input
                        name="amountRub"
                        type="number"
                        step="1"
                        min="0"
                        required
                        value={amountRubInput}
                        onChange={(ev) => setAmountRubInput(ev.target.value)}
                        className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                      />
                    </label>
                    <Button type="submit" disabled={isSavingEntry}>
                      {isSavingEntry ? "Сохранение…" : "Сохранить корректировку"}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handleEntryFormSubmit} className="mt-3 grid gap-3">
                    {editingEntryId && <input type="hidden" name="id" value={editingEntryId} />}
                    <input type="hidden" name="curatorId" value={selectedCuratorId} />
                    <input type="hidden" name="workDate" value={selectedIso} />
                    <label className="grid gap-1 text-xs text-app-muted">
                      Тип работы
                      <select
                        name="workType"
                        value={workType}
                        onChange={(ev) => {
                          const val = ev.target.value as CuratorWorkType;
                          setWorkType(val);
                          if (val !== "RouteObjects") setIsBaseIncluded(true);
                          if (val !== "ReplacementShift") setCustomHourlyRateInput("");
                          if (val !== "MonthlySalary") {
                            setMonthlySalaryRubInput("");
                          } else if (selectedCuratorId) {
                            const existingIso = monthlySalaryIsoByCuratorId[selectedCuratorId];
                            const editingSalary = editingEntry?.workType === "MonthlySalary";
                            if (existingIso && !editingSalary) {
                              toast({
                                title: "Оклад уже назначен",
                                message: `Оклад за этот месяц уже начислен ${formatDisplayDateFromIso(existingIso)}`,
                                variant: "error",
                                durationMs: 6500,
                              });
                            }
                          }
                        }}
                        className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                      >
                        {manualWorkTypes.map((k) => (
                          <option key={k} value={k}>
                            {curatorWorkTypeLabels[k]}
                          </option>
                        ))}
                      </select>
                    </label>

                    {workType === "RouteObjects" && (
                      <div className="flex items-center gap-2 px-1">
                        <Checkbox
                          id="isBaseIncluded"
                          name="isBaseIncluded"
                          checked={isBaseIncluded}
                          onCheckedChange={(checked) => setIsBaseIncluded(!!checked)}
                        />
                        <label
                          htmlFor="isBaseIncluded"
                          className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Прибавить базу за выход ({rub.format(tariffs.routeBaseRub)})
                        </label>
                      </div>
                    )}

                    {workType === "MonthlySalary" && (
                      <div className="grid gap-2">
                        {monthlySalaryBlocked && selectedCuratorMonthlySalaryIso ? (
                          <p className="rounded-button border border-accent-danger/40 bg-accent-danger/10 px-3 py-2 text-xs text-accent-danger">
                            Оклад за этот месяц уже начислен{" "}
                            {formatDisplayDateFromIso(selectedCuratorMonthlySalaryIso)}. Повторное начисление невозможно.
                          </p>
                        ) : (
                          <label className="grid gap-1 text-xs text-app-muted">
                            Оклад за месяц, ₽
                            <input
                              name="monthlySalaryRub"
                              type="number"
                              min={1}
                              step={1}
                              required
                              placeholder="Сумма оклада"
                              value={monthlySalaryRubInput}
                              onChange={(ev) => setMonthlySalaryRubInput(ev.target.value)}
                              className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                            />
                            <span className="text-[11px] text-app-muted/80">
                              Назначается один раз в месяц на выбранную дату.
                            </span>
                          </label>
                        )}
                      </div>
                    )}

                    {workType === "ReplacementShift" && (
                      <label className="grid gap-1 text-xs text-app-muted">
                        Своя ставка (по умолчанию {rub.format(tariffs.replacementHourlyRub)}/ч)
                        <input
                          name="customHourlyRate"
                          type="number"
                          placeholder="Введите сумму"
                          value={customHourlyRateInput}
                          onChange={(ev) => setCustomHourlyRateInput(ev.target.value)}
                          className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                        />
                      </label>
                    )}

                    {workType !== "NightInspection" && workType !== "MonthlySalary" && (
                      <label className="grid gap-1 text-xs text-app-muted">
                        Часы
                        <input
                          name="hours"
                          required
                          type="number"
                          inputMode="decimal"
                          step="0.25"
                          min="0.25"
                          max="72"
                          value={hoursInput}
                          onChange={(ev) => setHoursInput(ev.target.value)}
                          className="rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
                        />
                      </label>
                    )}
                    <div className="flex items-center justify-between rounded-lg border border-dashed border-accent-primary/30 bg-accent-primary/5 px-3 py-2 text-sm">
                      <span className="text-app-muted">К выплате по строке</span>
                      <span className="font-semibold tabular-nums text-accent-primary">
                        {pendingPreview != null && pendingPreview > 0 ? rub.format(pendingPreview) : "—"}
                      </span>
                    </div>
                    <Button type="submit" disabled={isSavingEntry || monthlySalaryBlocked}>
                      {isSavingEntry ? "Сохранение…" : editingEntryId ? "Обновить" : "Сохранить"}
                    </Button>
                  </form>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-8 rounded-card border border-app-border bg-app-elevated p-5">
          <div className="flex flex-wrap items-center gap-2 text-accent-primary">
            <Banknote className="size-5 shrink-0" />
            <h2 className="text-sm font-semibold uppercase tracking-wider">Ставки начислений</h2>
          </div>
          <p className="mt-2 max-w-3xl text-xs text-app-muted">
            Меняются суммы для новых строк. Уже сохранённые начисления в журнале не пересчитываются автоматически.
          </p>
          <form action={updateCuratorTariffsAction} className="mt-4 space-y-6">
            <div className="hidden" aria-hidden>
              <input type="hidden" name="returnDate" value={selectedIso} />
              <input type="hidden" name="routeBaseRub" value={tariffs.routeBaseRub} />
              <input type="hidden" name="routeHourlyRub" value={tariffs.routeHourlyRub} />
              <input type="hidden" name="nightInspectionRub" value={tariffs.nightInspectionRub} />
              <input type="hidden" name="replacementHourlyRub" value={tariffs.replacementHourlyRub} />
              <input type="hidden" name="scheduleRegularHourlyRub" value={tariffs.scheduleRegularHourlyRub} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-app-border bg-app-bg/40 p-4">
              <div className="text-sm font-medium text-app-text">{curatorWorkTypeLabels.RouteObjects}</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-app-muted">
                  База за выход (₽)
                  <input
                    type="number"
                    min={0}
                    max={9_999_999}
                    step={1}
                    value={tariffs.routeBaseRub}
                    onChange={(ev) =>
                      setTariffs((t) => ({ ...t, routeBaseRub: clampTariffInt(ev.target.value) }))
                    }
                    className="min-h-[2.25rem] w-full rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent-primary"
                  />
                </label>
                <label className="grid gap-1 text-xs text-app-muted">
                  За час на маршруте (₽/ч)
                  <input
                    type="number"
                    min={0}
                    max={9_999_999}
                    step={1}
                    value={tariffs.routeHourlyRub}
                    onChange={(ev) =>
                      setTariffs((t) => ({ ...t, routeHourlyRub: clampTariffInt(ev.target.value) }))
                    }
                    className="min-h-[2.25rem] w-full rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent-primary"
                  />
                </label>
              </div>
              <p className="mt-2 text-[11px] text-app-muted/80">Итого за смену: база + почасовка × часы.</p>
            </div>

            <div className="rounded-lg border border-app-border bg-app-bg/40 p-4">
              <div className="text-sm font-medium text-app-text">{curatorWorkTypeLabels.NightInspection}</div>
              <label className="mt-3 grid gap-1 text-xs text-app-muted">
                Фикс за выезд (₽)
                <input
                  type="number"
                  min={0}
                  max={9_999_999}
                  step={1}
                  value={tariffs.nightInspectionRub}
                  onChange={(ev) =>
                    setTariffs((t) => ({ ...t, nightInspectionRub: clampTariffInt(ev.target.value) }))
                  }
                  className="min-h-[2.25rem] w-full max-w-xs rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent-primary"
                />
              </label>
            </div>

            <div className="rounded-lg border border-app-border bg-app-bg/40 p-4">
              <div className="text-sm font-medium text-app-text">{curatorWorkTypeLabels.ReplacementShift}</div>
              <label className="mt-3 grid gap-1 text-xs text-app-muted">
                Ставка за час (₽/ч)
                <input
                  type="number"
                  min={0}
                  max={9_999_999}
                  step={1}
                  value={tariffs.replacementHourlyRub}
                  onChange={(ev) =>
                    setTariffs((t) => ({ ...t, replacementHourlyRub: clampTariffInt(ev.target.value) }))
                  }
                  className="min-h-[2.25rem] w-full max-w-xs rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent-primary"
                />
              </label>
              <p className="mt-2 text-[11px] text-app-muted/80">Ручная замена охранника: часы × ставка.</p>
            </div>

            <div className="rounded-lg border border-app-border bg-app-bg/40 p-4">
              <div className="text-sm font-medium text-app-text">{curatorWorkTypeLabels.ScheduleRegular}</div>
              <label className="mt-3 grid gap-1 text-xs text-app-muted">
                Доплата за час дежурства (₽/ч)
                <input
                  type="number"
                  min={0}
                  max={9_999_999}
                  step={1}
                  value={tariffs.scheduleRegularHourlyRub}
                  onChange={(ev) =>
                    setTariffs((t) => ({ ...t, scheduleRegularHourlyRub: clampTariffInt(ev.target.value) }))
                  }
                  className="min-h-[2.25rem] w-full max-w-xs rounded-button border border-app-border bg-app-bg px-2.5 py-1.5 text-sm tabular-nums outline-none focus:border-accent-primary"
                />
              </label>
              <p className="mt-2 text-[11px] text-app-muted/80">
                Смена, усиление и МП из графика: фиксированная доплата × часы, независимо от ставки объекта.
              </p>
            </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-app-border pt-4 lg:flex-row lg:items-center lg:justify-between">
              <p className="text-xs text-app-muted">
                После сохранения страница обновится; превью «К выплате по строке» считается по этим ставкам.
              </p>
              <Button type="submit" className="w-full shrink-0 sm:w-auto">
                Сохранить ставки
              </Button>
            </div>
          </form>

          <form
            action={backfillCuratorShiftsAction}
            className="mt-4 flex flex-wrap items-end gap-3 border-t border-app-border pt-4"
          >
            <input type="hidden" name="fromDate" value="2026-04-01" />
            <input type="hidden" name="returnDate" value={selectedIso} />
            <div>
              <p className="text-xs font-medium text-app-text">Синхронизация с графика</p>
              <p className="mt-1 text-[11px] text-app-muted">Импорт смен кураторов с 01.04.2026</p>
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Запустить бэкфилл
            </Button>
          </form>
        </div>
      </motion.section>

      <AnimatePresence>
        {deleteEntryTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal
            aria-labelledby="entry-delete-title"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-6 shrink-0 text-accent-warning" />
                <div>
                  <h2 id="entry-delete-title" className="text-lg font-semibold">
                    Удалить начисление?
                  </h2>
                  <p className="mt-2 text-sm text-app-muted">
                    {deleteEntryTarget.curatorName} — {deleteEntryTarget.workLabel}, {deleteEntryTarget.amountLabel}.
                    Подтверди удаление строки за {formatDisplayDateFromIso(selectedIso)}.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setDeleteEntryTarget(null)}
                  variant="secondary"
                >
                  Отмена
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isSavingEntry}
                  onClick={handleDeleteEntryConfirm}
                >
                  {isSavingEntry ? "Удаление…" : "Удалить"}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {deleteTarget ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            role="dialog"
            aria-modal
            aria-labelledby="curator-delete-title"
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-md rounded-card border border-app-border bg-app-surface p-6 shadow-glow"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="size-6 shrink-0 text-accent-warning" />
                <div>
                  <h2 id="curator-delete-title" className="text-lg font-semibold">
                    Удалить куратора?
                  </h2>
                  <p className="mt-2 text-sm text-app-muted">
                    {deleteTarget.name} — будут удалены все начисления этого куратора. Действие необратимо.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  variant="secondary"
                >
                  Отмена
                </Button>
                <form action={deleteCuratorAction}>
                  <input type="hidden" name="id" value={deleteTarget.id} />
                  <Button
                    type="submit"
                    variant="danger"
                  >
                    Удалить
                  </Button>
                </form>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </main>
  );
}
