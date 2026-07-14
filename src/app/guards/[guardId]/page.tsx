import { notFound } from "next/navigation";
import { GuardHistoryCard } from "../../../components/operations/guard-history-card";
import { GuardProfileEditor } from "../../../components/operations/guard-profile-editor";
import { GuardServiceRecordSection } from "../../../components/operations/guard-service-record-section";
import { GuardTraineeSection } from "../../../components/operations/guard-trainee-section";
import { GuardScheduleSection } from "../../../components/operations/guard-schedule-section";
import { ButtonLink } from "../../../components/ui/button";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import {
  getGuardDetails,
  listGuardServiceHistory,
  listGuardShiftHistory,
} from "../../../lib/operations/guards-repository";
import { listGuardProfilePeriods } from "../../../lib/operations/guard-profile-periods-repository";
import { resolveGuardProfileFromPeriods } from "../../../lib/guards/profile-periods";
import type { Guard } from "../../../lib/scheduling/types";
import { listObjects } from "../../../lib/operations/objects-repository";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
  guardStatusLabels,
} from "../../../lib/operations/status-labels";
import { designTokens } from "../../../lib/design-tokens";
import {
  formatUniformConditionLabel,
  formatUniformSizeDisplay,
  hasGuardUniform,
} from "../../../lib/format/uniform";
import { calculateShiftHours } from "../../../lib/scheduling/hour-calculator";
import {
  formatDisplayDateFromIso,
  formatDisplayDateLocal,
  formatMonthYearLongRu,
  getKhabarovskComponents,
  intervalOverlaps,
  khabarovskMonthRangeContaining,
  khabarovskWeekRangeContaining,
  toDateIsoKhabarovsk,
  addDaysToIsoDate,
} from "../../../lib/format/display-date";
import { Phone, ShieldCheck, Car, Briefcase } from "lucide-react";

type GuardDetailsPageProps = {
  params: Promise<{ guardId: string }>;
  searchParams?: Promise<{ date?: string }>;
};

export default async function GuardDetailsPage({ params, searchParams }: GuardDetailsPageProps) {
  const session = await requireSession();
  assertPermission(session.user.role, "guards:manage");

  const { guardId } = await params;
  const { date } = (await searchParams) ?? {};

  const [guard, history, serviceHistory, profilePeriods, objects] = await Promise.all([
    getGuardDetails(guardId),
    listGuardShiftHistory(guardId),
    listGuardServiceHistory(guardId),
    listGuardProfilePeriods(guardId),
    listObjects(),
  ]);
  if (!guard) notFound();

  const initialDate = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateIsoKhabarovsk(new Date());
  const guardForResolution: Guard = {
    id: guard.id,
    name: `${guard.lastName} ${guard.firstName}`.trim(),
    status: guard.status,
    phone: guard.phone,
    position: guard.position,
    licenseType: guard.licenseType,
    employmentType: guard.employmentType,
    isTrainee: guard.isTrainee,
    traineeUntil: guard.traineeUntil ? new Date(`${guard.traineeUntil}T12:00:00+10:00`) : null,
    hasCar: guard.hasCar,
  };
  const resolved = resolveGuardProfileFromPeriods(guardForResolution, initialDate, profilePeriods);
  const resolvedGuard = resolved.guard;
  const traineeExpired = !!(
    resolvedGuard.isTrainee &&
    resolvedGuard.traineeUntil &&
    toDateIsoKhabarovsk(resolvedGuard.traineeUntil) < toDateIsoKhabarovsk(new Date())
  );

  const positionPeriods = profilePeriods
    .filter((p) => p.periodKind === "position")
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  const weekRange = khabarovskWeekRangeContaining(initialDate);
  const monthRange = khabarovskMonthRangeContaining(initialDate);
  const weekStats = sumHours(history.filter((shift) => intervalOverlaps(shift, weekRange)));
  const monthStats = sumHours(history.filter((shift) => intervalOverlaps(shift, monthRange)));
  const weekEndIso = addDaysToIsoDate(toDateIsoKhabarovsk(weekRange.start), 6);
  const weekCardTitle = `За неделю (${formatDayMonthShort(toDateIsoKhabarovsk(weekRange.start))}–${formatDayMonthShort(weekEndIso)})`;
  const monthKh = getKhabarovskComponents(new Date(`${initialDate}T12:00:00+10:00`));
  const monthCardTitle = `За месяц (${formatMonthYearLongRu(monthKh.year, monthKh.month0).replace(/\s*г\.?\s*$/, "").toLowerCase()})`;

  const statusLabel = guardStatusLabels[guard.status];
  const statusColors = {
    Active: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    Sick: "bg-rose-500/10 text-rose-600 border-rose-500/20",
    OnVacation: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    Inactive: "bg-slate-500/10 text-slate-600 border-slate-500/20",
    Dismissed: "bg-red-500/10 text-red-600 border-red-500/20",
  }[guard.status] || "bg-slate-500/10 text-slate-600 border-slate-500/20";

  return (
    <main
      className="min-h-screen bg-app-bg p-3 text-app-text animate-fadeIn sm:p-6"
      style={{
        paddingTop:
          "calc(0.75rem + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
      }}
    >
      <section className="flex flex-col gap-4 rounded-card border border-app-border bg-app-surface p-3 shadow-glow sm:gap-6 sm:p-6">
        {/* Заголовок страницы */}
        <div className="flex flex-col gap-3 border-b border-app-border/40 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent-primary sm:text-xs">
              Карточка охранника
            </p>
            <h1 className="mt-2 flex flex-wrap items-center gap-2 text-xl font-bold text-app-text sm:gap-3 sm:text-3xl">
              <span className="min-w-0">
                {[guard.lastName, guard.firstName, guard.middleName].filter(Boolean).join(" ")}
              </span>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase sm:text-xs ${statusColors}`}>
                {statusLabel}
              </span>
            </h1>
          </div>
          <ButtonLink href="/guards" variant="secondary" className="w-full justify-center sm:w-auto">
            Назад к реестру
          </ButtonLink>
        </div>

        {/* 1. Вся информация в удобном читаемом виде */}
        <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {/* Блок: Основные данные */}
          <article className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:gap-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
              <Briefcase className="size-4 text-accent-primary" />
              <h3 className="font-bold text-sm text-app-text uppercase tracking-wider">Основные данные</h3>
            </div>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
              <span className="text-app-muted">Должность:</span>
              <span className="font-semibold text-app-text">{guardPositionLabels[guard.position]}</span>

              <span className="text-app-muted">Дата рождения:</span>
              <span className="font-semibold text-app-text">
                {guard.birthDate ? formatDisplayDateFromIso(guard.birthDate) : "—"}
              </span>

              <span className="text-app-muted">Занятость:</span>
              <span className="font-semibold text-app-text">{guardEmploymentLabels[guard.employmentType]}</span>

              <span className="text-app-muted">Дата оф. труд.:</span>
              <span className="font-semibold text-app-text">
                {guard.employedOn ? formatDisplayDateFromIso(guard.employedOn) : "—"}
              </span>

              <span className="text-app-muted">Дата увольнения:</span>
              <span className="font-semibold text-app-text">
                {guard.dismissedOn ? formatDisplayDateFromIso(guard.dismissedOn) : "—"}
              </span>
            </div>

            {/* Послужной список (Timeline) */}
            {positionPeriods.length > 0 && (
              <div className="mt-2 border-t border-app-border/40 pt-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-app-muted mb-3">Послужной список</h4>
                <div className="relative border-l border-app-border/60 pl-4 ml-2 space-y-4">
                  {positionPeriods.map((period) => (
                    <div key={period.id} className="relative">
                      {/* Маркер на таймлайне */}
                      <div className="absolute -left-[20.5px] top-1.5 size-2 rounded-full border border-app-surface bg-accent-primary" />
                      <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                        <span className="font-bold text-app-text">
                          {guardPositionLabels[period.position || "Guard"]}
                        </span>
                        <span className="shrink-0 text-app-muted tabular-nums">
                          {formatDisplayDateFromIso(period.effectiveFrom)} —{" "}
                          {period.effectiveTo ? formatDisplayDateFromIso(period.effectiveTo) : "…"}
                        </span>
                      </div>
                      {period.note ? (
                        <p className="mt-0.5 text-app-muted italic">{period.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          {/* Блок: Связь и логистика */}
          <article className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:gap-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
              <Phone className="size-4 text-accent-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-app-text">Связь и логистика</h3>
            </div>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
              <span className="text-app-muted">Телефон:</span>
              <span className="font-bold text-app-text">{guard.phone || "—"}</span>

              <span className="text-app-muted">Конт. телефон:</span>
              <span className="font-semibold text-app-text">{guard.contactPhone || "—"}</span>

              <span className="text-app-muted">Личное авто:</span>
              <span className="font-semibold text-app-text flex items-center gap-1">
                {guard.hasCar ? (
                  <>
                    <Car className="size-4 text-status-active" />
                    <span>Есть</span>
                  </>
                ) : (
                  "Нет"
                )}
              </span>

              <span className="text-app-muted">Размер / рост:</span>
              <span className="font-semibold text-app-text">
                {hasGuardUniform(guard.uniformSize, guard.uniformHeight)
                  ? `${formatUniformSizeDisplay(guard.uniformSize!)} / ${guard.uniformHeight}`
                  : "—"}
              </span>

              <span className="text-app-muted">Форма выдана:</span>
              <span className="font-semibold text-app-text">
                {guard.uniformIssued
                  ? [
                      "Да",
                      guard.uniformIssuedOn
                        ? formatDisplayDateFromIso(guard.uniformIssuedOn)
                        : null,
                      guard.uniformCondition
                        ? formatUniformConditionLabel(guard.uniformCondition)
                        : null,
                      guard.uniformNote || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : "Нет"}
              </span>
            </div>
          </article>

          {/* Блок: Документы и допуски */}
          <article className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:col-span-2 sm:gap-4 sm:p-5 lg:col-span-1">
            <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
              <ShieldCheck className="size-4 text-accent-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-app-text">Документы и допуски</h3>
            </div>
            <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
              <span className="text-app-muted">Удостоверение:</span>
              <span className="font-semibold text-app-text">
                {guardLicenseLabels[guard.licenseType ?? "None"]}
              </span>

              <span className="text-app-muted">Разряд:</span>
              <span className="font-semibold text-app-text">
                {guard.licenseType === "Licensed" && guard.licenseGrade != null
                  ? String(guard.licenseGrade)
                  : "—"}
              </span>

              <span className="text-app-muted">Действует до:</span>
              <span className="font-semibold text-app-text">
                {guard.licenseValidUntil ? formatDisplayDateFromIso(guard.licenseValidUntil) : "—"}
              </span>

              <span className="text-app-muted">Медкомиссия:</span>
              <span className="font-semibold text-app-text">
                {guard.medicalCommissionPassedOn ? (
                  formatDisplayDateFromIso(guard.medicalCommissionPassedOn)
                ) : (
                  <span className="text-accent-danger font-bold">Не пройдена</span>
                )}
              </span>

              <span className="text-app-muted">Период. проверка:</span>
              <span className="font-semibold text-app-text">
                {guard.periodicCheckPassedOn ? (
                  formatDisplayDateFromIso(guard.periodicCheckPassedOn)
                ) : (
                  <span className="text-accent-warning font-bold">Не пройдена</span>
                )}
              </span>

              <span className="text-app-muted">Личная карточка:</span>
              <span className="font-semibold text-app-text">
                {guard.personalCardAssignedOn ? (
                  formatDisplayDateFromIso(guard.personalCardAssignedOn)
                ) : (
                  "Нет"
                )}
              </span>

              <span className="text-app-muted">Стажёр:</span>
              <div className="flex flex-col items-start">
                <span
                  className={`font-bold flex items-center gap-1 ${resolvedGuard.isTrainee ? "" : "text-app-muted"}`}
                  style={
                    resolvedGuard.isTrainee
                      ? {
                          color: traineeExpired
                            ? designTokens.color.accent.warning
                            : designTokens.color.accent.success,
                        }
                      : undefined
                  }
                >
                  {resolvedGuard.isTrainee ? (
                    <>
                      <span>Да</span>
                      {resolvedGuard.traineeUntil && (
                        <span className="text-xs font-normal">
                          (до {formatDisplayDateLocal(resolvedGuard.traineeUntil)})
                        </span>
                      )}
                    </>
                  ) : (
                    "Нет"
                  )}
                </span>
                <GuardTraineeSection
                  guardId={guard.id}
                  isTrainee={resolvedGuard.isTrainee}
                  traineeUntil={
                    resolvedGuard.traineeUntil ? toDateIsoKhabarovsk(resolvedGuard.traineeUntil) : null
                  }
                />
              </div>
            </div>
          </article>
        </div>

        {/* 2. Скрытая по умолчанию форма редактирования */}
        <GuardProfileEditor guard={guard} objects={objects} />

        {/* Сводные показатели по часам */}
        <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
          <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-app-muted">Закрепленные объекты</h2>
            <ul className="mt-2 space-y-1 text-sm font-semibold text-app-text sm:mt-3">
              {guard.objects.length > 0 ? (
                guard.objects.map((object) => <li key={object.id} className="list-disc list-inside">{object.name}</li>)
              ) : (
                <li className="text-app-muted font-normal">Нет закрепленных объектов</li>
              )}
            </ul>
          </article>
          <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
            <h2 className="text-xs font-semibold text-app-muted">{weekCardTitle}</h2>
            <p className="mt-2 text-2xl font-extrabold text-accent-primary sm:mt-3 sm:text-3xl">{weekStats.totalHours} ч</p>
          </article>
          <article className="rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:p-5">
            <h2 className="text-xs font-semibold text-app-muted">{monthCardTitle}</h2>
            <p className="mt-2 text-2xl font-extrabold text-accent-primary sm:mt-3 sm:text-3xl">{monthStats.totalHours} ч</p>
          </article>
        </div>

        <div className="grid items-start gap-4 sm:gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GuardHistoryCard entries={serviceHistory} />
          </div>
          <div>
            <GuardServiceRecordSection guardId={guard.id} />
          </div>
        </div>

        <GuardScheduleSection
          guardId={guard.id}
          history={history}
          assignedObjects={guard.objects}
          initialDate={initialDate}
        />
      </section>
    </main>
  );
}

function formatDayMonthShort(isoDate: string): string {
  const formatted = formatDisplayDateFromIso(isoDate);
  const parts = formatted.split(".");
  if (parts.length < 2) return formatted;
  return `${parts[0]}.${parts[1]}`;
}

function sumHours(shifts: Array<{ startsAt: Date; endsAt: Date }>) {
  const totalHours = shifts.reduce((sum, shift) => {
    const hours = calculateShiftHours({ startsAt: shift.startsAt, endsAt: shift.endsAt });
    return sum + hours.totalHours;
  }, 0);
  return { totalHours: Math.round(totalHours * 100) / 100 };
}
