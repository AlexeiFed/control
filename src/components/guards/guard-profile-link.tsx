import { SquareArrowOutUpRight } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";

/** Иконка рядом с ФИО: карточка охранника в новой вкладке. */
export function GuardProfileLink({ guardId }: { guardId: string }) {
  return (
    <a
      href={`/guards/${encodeURIComponent(guardId)}`}
      target="_blank"
      rel="noopener noreferrer"
      title="Открыть карточку охранника"
      aria-label="Открыть карточку охранника в новой вкладке"
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm outline-none transition hover:bg-app-elevated focus-visible:ring-2 focus-visible:ring-accent-primary/40"
      style={{ color: designTokens.color.accent.primary }}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <SquareArrowOutUpRight className="size-3.5" strokeWidth={2.25} aria-hidden />
    </a>
  );
}
