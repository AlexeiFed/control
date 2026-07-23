"use client";

import { Plus } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";
import type {
  MobileScheduleCard,
  MobileScheduleDay,
  MobileScheduleShift,
} from "../../lib/scheduling/mobile-schedule-calendar";
import type { ShiftKind } from "../../lib/scheduling/types";

type SchedulerMobileCalendarProps = {
  cards: readonly MobileScheduleCard[];
  canWrite: boolean;
  onAssign: (objectId: string, dateIso: string, shiftKind: ShiftKind) => void;
  onEditShift: (objectId: string, dateIso: string, shiftId: string) => void;
};

const shiftKindLabel: Record<ShiftKind, string> = {
  Regular: "осн",
  Reinforcement: "ус",
  RapidResponse: "МП",
  ShiftLead: "СтМ",
};

export function SchedulerMobileCalendar({
  cards,
  canWrite,
  onAssign,
  onEditShift,
}: SchedulerMobileCalendarProps) {
  if (cards.length === 0) {
    return (
      <div className="mt-4 rounded-card border border-app-border bg-app-elevated p-4 text-sm text-app-muted md:hidden">
        Объекты не найдены.
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-4 md:hidden">
      {cards.map((card) => (
        <article
          key={card.objectId}
          className="overflow-hidden rounded-card border border-app-border bg-app-surface"
        >
          <header className="flex items-start justify-between gap-3 border-b border-app-border p-3">
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold">{card.objectName}</h2>
              <p className="mt-0.5 truncate text-[11px] text-app-muted">{card.address}</p>
            </div>
            <span
              className="shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold tabular-nums"
              style={
                card.totalShortageHours > 0
                  ? {
                      backgroundColor: `${designTokens.color.accent.warning}18`,
                      color: designTokens.color.accent.warning,
                    }
                  : {
                      backgroundColor: `${designTokens.color.accent.success}14`,
                      color: designTokens.color.accent.success,
                    }
              }
            >
              {card.totalShortageHours > 0
                ? `−${card.totalShortageHours} ч`
                : "План закрыт"}
            </span>
          </header>

          {[card.days.slice(0, 7), card.days.slice(7, 14)].map((week, weekIndex) => (
            <section key={`${card.objectId}-week-${weekIndex}`}>
              <div className="border-b border-app-border bg-app-elevated px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-app-muted">
                Неделя {weekIndex + 1}
              </div>
              <div className="grid grid-cols-7 border-l border-app-border">
                {week.map((day) => (
                  <MobileDayCell
                    key={day.dateIso}
                    card={card}
                    day={day}
                    canWrite={canWrite}
                    onAssign={onAssign}
                    onEditShift={onEditShift}
                  />
                ))}
              </div>
            </section>
          ))}
        </article>
      ))}
    </div>
  );
}

function MobileDayCell({
  card,
  day,
  canWrite,
  onAssign,
  onEditShift,
}: {
  card: MobileScheduleCard;
  day: MobileScheduleDay;
  canWrite: boolean;
  onAssign: SchedulerMobileCalendarProps["onAssign"];
  onEditShift: SchedulerMobileCalendarProps["onEditShift"];
}) {
  const visibleShifts = day.shifts.slice(0, 2);
  const hiddenCount = day.shifts.length - visibleShifts.length;
  const dayOfMonth = Number(day.dateIso.slice(-2));
  const weekday = day.label.split(",")[0] ?? day.label;
  const ariaLabel = buildDayAriaLabel(day);
  const style: React.CSSProperties = {};

  if (day.isHoliday) {
    style.backgroundImage = `linear-gradient(135deg, ${designTokens.color.shift.holidayFrom}16, ${designTokens.color.shift.holidayTo}10)`;
  } else if (day.isWeekend) {
    style.backgroundColor = `${designTokens.color.accent.warning}08`;
  }
  if (day.isToday) {
    style.boxShadow = `inset 0 0 0 2px ${designTokens.color.accent.primary}`;
  }

  return (
    <div
      className="flex min-h-[7.75rem] min-w-0 flex-col border-b border-r border-app-border p-0.5"
      style={style}
      aria-label={ariaLabel}
    >
      <div className="px-0.5 pb-0.5 text-center leading-none">
        <span className="block truncate text-[8px] text-app-muted">{weekday}</span>
        <span className="text-[11px] font-bold tabular-nums">{dayOfMonth}</span>
      </div>

      <div className="grid min-w-0 gap-0.5">
        {visibleShifts.map((shift) => (
          <MobileShiftChip
            key={shift.id}
            shift={shift}
            canWrite={canWrite}
            onClick={() => onEditShift(card.objectId, day.dateIso, shift.id)}
          />
        ))}
        {hiddenCount > 0 ? (
          <div className="truncate text-center text-[8px] font-semibold text-app-muted">
            +{hiddenCount}
          </div>
        ) : null}
      </div>

      <div className="mt-auto">
        {day.hasShortage ? (
          <div
            className="truncate px-0.5 text-center text-[8px] font-bold tabular-nums"
            style={{ color: designTokens.color.accent.warning }}
          >
            −{day.shortageHours}ч
          </div>
        ) : day.workedHours > 0 ? (
          <div className="truncate px-0.5 text-center text-[8px] font-semibold tabular-nums text-status-active">
            {day.workedHours}ч
          </div>
        ) : null}
        {canWrite ? (
          <button
            type="button"
            className="mt-0.5 flex min-h-7 w-full items-center justify-center rounded-md border border-accent-primary/45 bg-app-surface text-accent-primary transition active:bg-app-elevated"
            onClick={() => onAssign(card.objectId, day.dateIso, "Regular")}
            aria-label={`Назначить смену: ${card.objectName}, ${day.label}`}
          >
            <Plus className="size-3" aria-hidden />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function MobileShiftChip({
  shift,
  canWrite,
  onClick,
}: {
  shift: MobileScheduleShift;
  canWrite: boolean;
  onClick: () => void;
}) {
  const kindTokens = designTokens.color.shiftKind[shift.shiftKind];
  const label = `${shortGuardName(shift.guardName)} · ${shift.durationHours}ч`;
  const className =
    "block min-w-0 truncate rounded-sm border px-0.5 py-1 text-center text-[8px] font-semibold leading-none";
  const style = {
    backgroundColor: kindTokens.bg,
    borderColor: kindTokens.border,
    color: kindTokens.text,
  };

  if (!canWrite) {
    return (
      <div className={className} style={style} title={shift.guardName}>
        {label}
      </div>
    );
  }

  return (
    <button
      type="button"
      className={className}
      style={style}
      title={`${shift.guardName} · ${shift.startTime}–${shift.endTime} · ${shiftKindLabel[shift.shiftKind]}`}
      onClick={onClick}
      aria-label={`Изменить смену ${shift.guardName}, ${shift.startTime}–${shift.endTime}`}
    >
      {label}
    </button>
  );
}

function shortGuardName(name: string): string {
  const [lastName] = name.trim().split(/\s+/);
  return lastName || name;
}

function buildDayAriaLabel(day: MobileScheduleDay): string {
  const shifts = day.shifts.length
    ? day.shifts
        .map(
          (shift) =>
            `${shift.guardName}, ${shift.startTime}–${shift.endTime}, ${shift.durationHours} часов`,
        )
        .join("; ")
    : "смен нет";
  const shortage = day.hasShortage ? `, дефицит ${day.shortageHours} часов` : "";
  return `${day.label}: ${shifts}${shortage}`;
}
