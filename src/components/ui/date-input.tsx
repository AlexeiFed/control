"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import {
  DISPLAY_DATE_PLACEHOLDER,
  extractDisplayDateDigits,
  formatDisplayDateFromDigits,
  isoToDisplayDateInput,
  parseDisplayDateToIso,
} from "../../lib/format/display-date";
import { designTokens } from "../../lib/design-tokens";

type DateInputProps = {
  name?: string;
  /** ISO `YYYY-MM-DD` (controlled). */
  value?: string;
  /** ISO `YYYY-MM-DD` (uncontrolled). */
  defaultValue?: string;
  /** Вызывается с ISO или `""`, когда дата очищена / ещё неполная. */
  onChange?: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  id?: string;
  "aria-label"?: string;
  placeholder?: string;
};

function clampIsoToRange(iso: string, min?: string, max?: string): string | null {
  if (min && iso < min) return null;
  if (max && iso > max) return null;
  return iso;
}

export function DateInput({
  name,
  value,
  defaultValue = "",
  onChange,
  required = false,
  disabled = false,
  min,
  max,
  className = "",
  id,
  "aria-label": ariaLabel,
  placeholder = DISPLAY_DATE_PLACEHOLDER,
}: DateInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const textRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [iso, setIso] = useState(() => (controlled ? value : defaultValue) || "");
  const [display, setDisplay] = useState(() => isoToDisplayDateInput((controlled ? value : defaultValue) || ""));
  const [invalid, setInvalid] = useState(false);

  const syncValidity = useCallback(
    (el: HTMLInputElement | null, nextDisplay: string, nextInvalid: boolean) => {
      if (!el) return;
      if (!nextDisplay.trim()) {
        el.setCustomValidity(required ? "Укажите дату" : "");
        return;
      }
      if (nextInvalid) {
        el.setCustomValidity("Некорректная дата (дд.мм.гггг)");
        return;
      }
      const parsed = parseDisplayDateToIso(nextDisplay);
      if (!parsed || !clampIsoToRange(parsed, min, max)) {
        el.setCustomValidity("Некорректная дата (дд.мм.гггг)");
        return;
      }
      el.setCustomValidity("");
    },
    [max, min, required],
  );

  useEffect(() => {
    syncValidity(textRef.current, display, invalid);
  }, [display, invalid, syncValidity]);

  useEffect(() => {
    if (!controlled) return;
    const nextIso = value || "";
    setIso(nextIso);
    if (document.activeElement !== textRef.current) {
      setDisplay(isoToDisplayDateInput(nextIso));
      setInvalid(false);
    }
  }, [controlled, value]);

  const commitIso = useCallback(
    (nextIso: string) => {
      setIso(nextIso);
      onChange?.(nextIso);
    },
    [onChange],
  );

  const applyDigits = useCallback(
    (digits: string) => {
      const masked = formatDisplayDateFromDigits(digits);
      setDisplay(masked);
      if (digits.length === 0) {
        setInvalid(false);
        commitIso("");
        return;
      }
      if (digits.length < 8) {
        setInvalid(false);
        // неполная дата — не трогаем ISO в uncontrolled (форма ещё не submit),
        // в controlled сообщаем пусто только если раньше было значение и юзер стирает
        return;
      }
      const parsed = parseDisplayDateToIso(masked);
      const inRange = parsed ? clampIsoToRange(parsed, min, max) : null;
      if (!inRange) {
        setInvalid(true);
        return;
      }
      setInvalid(false);
      setDisplay(isoToDisplayDateInput(inRange));
      commitIso(inRange);
    },
    [commitIso, max, min],
  );

  const openPicker = useCallback(() => {
    const el = pickerRef.current;
    if (!el || disabled) return;
    try {
      if (typeof el.showPicker === "function") {
        el.showPicker();
        return;
      }
    } catch {
      /* fallback below */
    }
    el.click();
  }, [disabled]);

  return (
    <div className="relative w-full">
      {name ? <input type="hidden" name={name} value={iso} /> : null}
      <input
        ref={textRef}
        id={inputId}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={invalid}
        value={display}
        pattern="\d{2}\.\d{2}\.\d{4}"
        title="Формат: дд.мм.гггг"
        onChange={(e) => applyDigits(extractDisplayDateDigits(e.target.value))}
        onBlur={() => {
          if (!display.trim()) {
            setInvalid(false);
            commitIso("");
            return;
          }
          const parsed = parseDisplayDateToIso(display);
          const inRange = parsed ? clampIsoToRange(parsed, min, max) : null;
          if (!inRange) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setDisplay(isoToDisplayDateInput(inRange));
          if (inRange !== iso) commitIso(inRange);
        }}
        className={`w-full ${className} pr-9 ${invalid ? "border-accent-danger" : ""}`.trim()}
        style={invalid ? { borderColor: designTokens.color.accent.danger } : undefined}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        onClick={openPicker}
        aria-label="Открыть календарь"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-app-muted hover:text-app-text disabled:opacity-50"
      >
        <Calendar className="size-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        disabled={disabled}
        min={min}
        max={max}
        value={iso || ""}
        onChange={(e) => {
          const next = e.target.value;
          if (!next) {
            setDisplay("");
            setInvalid(false);
            commitIso("");
            return;
          }
          const inRange = clampIsoToRange(next, min, max);
          if (!inRange) {
            setInvalid(true);
            return;
          }
          setInvalid(false);
          setDisplay(isoToDisplayDateInput(inRange));
          commitIso(inRange);
        }}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        aria-hidden
      />
    </div>
  );
}
