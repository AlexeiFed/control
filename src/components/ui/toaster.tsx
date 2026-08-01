"use client";

import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { designTokens } from "../../lib/design-tokens";
import { useToastStore, type ToastItem, type ToastVariant } from "../../store/toast-store";
import { Button } from "./button";

function variantStyle(variant: ToastVariant) {
  switch (variant) {
    case "success":
      return {
        icon: CheckCircle2,
        accent: designTokens.color.accent.success,
        bg: `${designTokens.color.accent.success}14`,
        label: "Успешно",
      } as const;
    case "error":
      return {
        icon: XCircle,
        accent: designTokens.color.accent.danger,
        bg: `${designTokens.color.accent.danger}22`,
        label: "Ошибка",
      } as const;
    case "warning":
      return {
        icon: AlertTriangle,
        accent: designTokens.color.accent.warning,
        bg: `${designTokens.color.accent.warning}18`,
        label: "Внимание",
      } as const;
    default:
      return {
        icon: Info,
        accent: designTokens.color.accent.primary,
        bg: `${designTokens.color.accent.primary}12`,
        label: "Инфо",
      } as const;
  }
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const last = toasts[toasts.length - 1];
    if (!last) return;
    if (last.variant !== "error") return;
    if (Date.now() - last.createdAt > 800) return;

    document.body.classList.add("toast-screen-shake");
    const id = window.setTimeout(() => document.body.classList.remove("toast-screen-shake"), 260);
    return () => window.clearTimeout(id);
  }, [toasts]);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[120] flex flex-col items-center gap-2 px-4"
      style={{
        // Выше баннеров инцидентов/внимания (z-99…110); ниже стека баннеров по вертикали.
        top: "calc(1rem + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px) + var(--periodic-check-banner-offset, 0px) + var(--medical-commission-banner-offset, 0px))",
      }}
    >
      <div className="grid w-full max-w-xl gap-2">
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </div>
  );
}

function ToastRow({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const { icon: Icon, accent, bg, label } = useMemo(() => variantStyle(toast.variant), [toast.variant]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className={[
        "pointer-events-auto rounded-button border shadow-glow transition duration-300 ease-out will-change-transform",
        toast.variant === "error" ? "toast-shake" : "",
        mounted ? "translate-y-0 scale-100 opacity-100" : "-translate-y-4 scale-[0.95] opacity-0",
      ].join(" ")}
      style={{
        background: `linear-gradient(180deg, ${bg}, ${designTokens.color.surface} 55%)`,
        borderColor: toast.variant === "error" ? `${accent}cc` : `${accent}66`,
        boxShadow:
          toast.variant === "error"
            ? `0 0 0 1px ${accent}55, 0 0 70px ${accent}22, ${designTokens.shadow.glow}`
            : `${designTokens.shadow.glow}, 0 0 0 1px ${accent}22`,
      }}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <div
          className="mt-0.5 grid h-9 w-9 place-items-center rounded-button"
          style={{ background: `${accent}1a`, color: accent }}
          aria-hidden="true"
          title={label}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {toast.title ? <div className="text-sm font-semibold text-app-text">{toast.title}</div> : null}
          <div className="text-sm text-app-text">{toast.message}</div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          onClick={onDismiss}
          aria-label="Закрыть уведомление"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

