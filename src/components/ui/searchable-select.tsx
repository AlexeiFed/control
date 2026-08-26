"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button, cn } from "./button";

type Option = { id: string; name: string };

type Props = {
  value: string;
  onChange: (id: string) => void;
  options: ReadonlyArray<Option>;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Выберите…",
  searchPlaceholder = "Поиск",
  emptyText = "Совпадений нет",
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  const selected = options.find((o) => o.id === value);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

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
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", open ? "z-30" : "z-0")}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((prev) => !prev);
          setSearch("");
        }}
        className={cn(
          "flex min-h-[2.75rem] w-full items-center justify-between gap-2 rounded-button border border-app-border bg-app-bg px-3 py-2 text-left text-sm outline-none focus:border-accent-primary",
          open && "border-accent-primary",
          !selected && "text-app-muted",
        )}
      >
        <span className="min-w-0 truncate">{selected?.name ?? placeholder}</span>
        <ChevronDown className={cn("size-4 shrink-0 text-app-muted transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="absolute z-20 mt-2 w-full rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={searchPlaceholder}
            className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-3 py-2 text-sm outline-none focus:border-accent-primary"
          />
          <div id={listId} role="listbox" className="max-h-52 overflow-auto overscroll-contain">
            {filtered.map((option) => (
              <Button
                key={option.id}
                type="button"
                variant="menu"
                size="sm"
                className={cn(
                  "mb-1 justify-start text-left",
                  option.id === value && "bg-accent-primary/10 text-accent-primary",
                )}
                onClick={() => {
                  onChange(option.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                {option.name}
              </Button>
            ))}
            {filtered.length === 0 ? (
              <div className="px-2 py-2 text-xs text-app-muted">{emptyText}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
