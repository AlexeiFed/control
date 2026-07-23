import { AlertCircle, X } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";

type ScheduleHoursShortageIconProps = {
  title?: string;
  className?: string;
  canDismiss?: boolean;
  onDismiss?: () => void;
  dismissing?: boolean;
};

/** Мигающая иконка недобора часов на датах текущей недели. */
export function ScheduleHoursShortageIcon({
  title = "Недобор часов до нормы на этой неделе",
  className = "",
  canDismiss = false,
  onDismiss,
  dismissing = false,
}: ScheduleHoursShortageIconProps) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <span
        className="schedule-shortage-blink inline-flex items-center justify-center"
        style={{ color: designTokens.color.accent.danger }}
        title={title}
        aria-label={title}
      >
        <AlertCircle className="size-3.5" strokeWidth={2.5} aria-hidden />
      </span>
      {canDismiss && onDismiss ? (
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center rounded-sm border border-app-border bg-app-surface text-app-muted outline-none hover:border-accent-danger/40 hover:text-accent-danger focus-visible:ring-2 focus-visible:ring-accent-danger/40 disabled:opacity-50"
          style={{ color: dismissing ? designTokens.color.textMuted : undefined }}
          title="Снять предупреждение на этот день"
          aria-label="Снять предупреждение на этот день"
          disabled={dismissing}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X className="size-3" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
