"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../ui/button";

type MultiSelectFilterProps = {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  values: ReadonlyArray<string>;
  onChange: (next: string[]) => void;
  emptyLabel: string;
  /** Подпись когда выбрано несколько: «N объектов» */
  selectedCountLabel: (count: number) => string;
};

export function MultiSelectFilter({
  label,
  options,
  values,
  onChange,
  emptyLabel,
  selectedCountLabel,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();
  const selected = new Set(values);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target || rootRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const summary =
    values.length === 0
      ? emptyLabel
      : values.length === 1
        ? (options.find((o) => o.value === values[0])?.label ?? values[0])
        : selectedCountLabel(values.length);

  const toggle = (value: string) => {
    if (selected.has(value)) {
      onChange(values.filter((v) => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  return (
    <div ref={rootRef} className={cn("relative grid min-w-0 gap-1 text-sm", open ? "z-30" : "z-0")}>
      <span className="text-app-muted">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex min-w-0 items-center justify-between gap-2 rounded-button border border-app-border bg-app-surface px-3 py-2 text-left text-app-text",
          open && "border-accent-primary",
        )}
      >
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-app-muted transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-50 max-h-64 overflow-auto rounded-button border border-app-border bg-app-surface p-1 shadow-glow"
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-button px-2 py-1.5 text-left text-sm text-app-muted hover:bg-app-elevated"
            onClick={() => onChange([])}
          >
            {emptyLabel}
          </button>
          {options.map((option) => {
            const isOn = selected.has(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isOn}
                className="flex w-full items-center gap-2 rounded-button px-2 py-1.5 text-left text-sm text-app-text hover:bg-app-elevated"
                onClick={() => toggle(option.value)}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    isOn
                      ? "border-accent-primary bg-accent-primary text-white"
                      : "border-app-border bg-app-surface",
                  )}
                >
                  {isOn ? <Check className="size-3" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
