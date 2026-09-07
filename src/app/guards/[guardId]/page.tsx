import { notFound } from "next/navigation";
import { GuardProfileDeferredSections } from "../../../components/operations/guard-profile-deferred";
import { GuardProfileEditor } from "../../../components/operations/guard-profile-editor";
import { GuardReturnToWorkButton } from "../../../components/operations/guard-return-to-work-button";
import { GuardTraineeSection } from "../../../components/operations/guard-trainee-section";
import { GuardUniformReturnControl } from "../../../components/operations/guard-uniform-return-control";
import { ButtonLink } from "../../../components/ui/button";
import { assertPermission } from "../../../lib/auth/rbac";
import { requireSession } from "../../../lib/auth/session";
import { getGuardDetails } from "../../../lib/operations/guards-repository";
import { listGuardProfilePeriods } from "../../../lib/operations/guard-profile-periods-repository";
import { resolveGuardProfileFromPeriods } from "../../../lib/guards/profile-periods";
import { canReturnGuardToWork } from "../../../lib/guards/return-to-work";
import type { Guard } from "../../../lib/scheduling/types";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
  guardStatusLabels,
} from "../../../lib/operations/status-labels";
import { designTokens } from "../../../lib/design-tokens";
import {
  formatTshirtStatusDisplay,
  formatUniformConditionLabel,
  formatUniformSizeDisplay,
  hasGuardUniform,
} from "../../../lib/format/uniform";
import {
  formatDisplayDateFromIso,
  formatDisplayDateLocal,
  toDateIsoKhabarovsk,
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

  // Только лёгкие данные — shell стримится сразу; смены/история — в Suspense.
  const [guard, profilePeriods] = await Promise.all([
    getGuardDetails(guardId),
    listGuardProfilePeriods(guardId),
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
        <div className="flex flex-col gap-3 border-b border-app-border/40 pb-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:pb-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-accent-primary sm:text-xs">
              Карточка охранника
            </p>
            <h1 className="mt-2 flex flex-wrap items-center gap-2 text-xl font-bold text-app-text sm:gap-3 sm:text-3xl">
              <span className="min-w-0">
                {[guard.lastName, guard.firstName, guard.middleName].filter(Boolean).join(" ")}
              </span>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase sm:text-xs ${statusColors}`}
              >
                {statusLabel}
              </span>
            </h1>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-start">
            {canReturnGuardToWork(guard.status) ? (
              <GuardReturnToWorkButton guardId={guard.id} dismissedOn={guard.dismissedOn} />
            ) : null}
            <ButtonLink href="/guards" variant="secondary" className="w-full justify-center sm:w-auto">
              Назад к реестру
            </ButtonLink>
          </div>
        </div>

        <div className="grid items-start gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          <article className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:gap-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
              <Briefcase className="size-4 text-accent-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-app-text">Основные данные</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <span className="text-app-muted">Должность:</span>
              <span className="font-semibold text-app-text">{guardPositionLabels[guard.position]}</span>

              <span className="text-app-muted">Дата рождения:</span>
              <span className="font-semibold text-app-text">
                {guard.birthDate ? formatDisplayDateFromIso(guard.birthDate) : "—"}
              </span>

              <span className="text-app-muted">Занятость:</span>
              <span className="font-semibold text-app-text">
                {guardEmploymentLabels[guard.employmentType]}
              </span>

              <span className="text-app-muted">Дата оф. труд.:</span>
              <span className="font-semibold text-app-text">
                {guard.employedOn ? formatDisplayDateFromIso(guard.employedOn) : "—"}
              </span>

              <span className="text-app-muted">Дата увольнения:</span>
              <span className="font-semibold text-app-text">
                {guard.dismissedOn ? formatDisplayDateFromIso(guard.dismissedOn) : "—"}
              </span>
            </div>

            {positionPeriods.length > 0 && (
              <div className="mt-2 border-t border-app-border/40 pt-4">
                <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-app-muted">
                  Послужной список
                </h4>
                <div className="relative ml-2 space-y-4 border-l border-app-border/60 pl-4">
                  {positionPeriods.map((period) => (
                    <div key={period.id} className="relative">
                      <div className="absolute -left-[20.5px] top-1.5 size-2 rounded-full border border-app-surface bg-accent-primary" />
                      <div className="flex flex-col gap-1 text-xs sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                        <span className="font-bold text-app-text">
                          {guardPositionLabels[period.position || "Guard"]}
                        </span>
                        <span className="shrink-0 tabular-nums text-app-muted">
                          {formatDisplayDateFromIso(period.effectiveFrom)} —{" "}
                          {period.effectiveTo ? formatDisplayDateFromIso(period.effectiveTo) : "…"}
                        </span>
                      </div>
                      {period.note ? (
                        <p className="mt-0.5 italic text-app-muted">{period.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </article>

          <article className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:gap-4 sm:p-5">
            <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
              <Phone className="size-4 text-accent-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-app-text">Связь и логистика</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <span className="text-app-muted">Телефон:</span>
              <span className="font-bold text-app-text">{guard.phone || "—"}</span>

              <span className="text-app-muted">Конт. телефон:</span>
              <span className="font-semibold text-app-text">{guard.contactPhone || "—"}</span>

              <span className="text-app-muted">Личное авто:</span>
              <span className="flex items-center gap-1 font-semibold text-app-text">
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
                      guard.uniformIssuedOn ? formatDisplayDateFromIso(guard.uniformIssuedOn) : null,
                      guard.uniformCondition
                        ? formatUniformConditionLabel(guard.uniformCondition)
                        : null,
                      guard.uniformNote || null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : guard.uniformReturnedOn
                    ? `Нет · сдана ${formatDisplayDateFromIso(guard.uniformReturnedOn)}`
                    : "Нет"}
              </span>
              <span className="text-app-muted">Выдана футболка:</span>
              <span className="font-semibold text-app-text">
                {formatTshirtStatusDisplay({
                  issued: guard.tshirtIssued,
                  size: guard.tshirtSize,
                  issuedOn: guard.tshirtIssuedOn,
                  returnedOn: guard.tshirtReturnedOn,
                })}
              </span>
              {guard.uniformIssued || guard.tshirtIssued ? (
                <GuardUniformReturnControl
                  guardId={guard.id}
                  uniformIssued={guard.uniformIssued}
                  uniformIssuedOn={guard.uniformIssuedOn}
                  tshirtIssued={guard.tshirtIssued}
                  tshirtIssuedOn={guard.tshirtIssuedOn}
                />
              ) : null}
            </div>
          </article>

          <article className="flex flex-col gap-3 rounded-button border border-app-border bg-app-elevated p-3 shadow-sm sm:col-span-2 sm:gap-4 sm:p-5 lg:col-span-1">
            <div className="flex items-center gap-2 border-b border-app-border/40 pb-2.5">
              <ShieldCheck className="size-4 text-accent-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-app-text">Документы и допуски</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <span className="text-app-muted">Удостоверение:</span>
              <span className="font-semibold text-app-text">
                {guardLicenseLabels[guard.licenseType ?? "None"]}
              </span>

              <span className="text-app-muted">Номер удостоверения:</span>
              <span className="font-semibold text-app-text">{guard.licenseNumber || "—"}</span>

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
                  <span className="font-bold text-accent-danger">Не пройдена</span>
                )}
              </span>

              <span className="text-app-muted">Период. проверка:</span>
              <span className="font-semibold text-app-text">
                {guard.periodicCheckPassedOn ? (
                  formatDisplayDateFromIso(guard.periodicCheckPassedOn)
                ) : (
                  <span className="font-bold text-accent-warning">Не пройдена</span>
                )}
              </span>

              <span className="text-app-muted">Личная карточка:</span>
              <span className="font-semibold text-app-text">
                {guard.personalCardAssignedOn
                  ? formatDisplayDateFromIso(guard.personalCardAssignedOn)
                  : "Нет"}
              </span>

              <span className="text-app-muted">Номер личной карточки:</span>
              <span className="font-semibold text-app-text">{guard.personalCardNumber || "—"}</span>

              <span className="text-app-muted">Стажёр:</span>
              <div className="flex flex-col items-start">
                <span
                  className={`flex items-center gap-1 font-bold ${resolvedGuard.isTrainee ? "" : "text-app-muted"}`}
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

        <GuardProfileEditor guard={guard} />

        <GuardProfileDeferredSections
          guardId={guard.id}
          assignedObjects={guard.objects}
          initialDate={initialDate}
        />
      </section>
    </main>
  );
}
