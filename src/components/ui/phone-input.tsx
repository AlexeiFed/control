"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  extractRuPhoneDigits,
  formatRuPhoneFromDigits,
  isValidRuPhone,
  PHONE_RU_PLACEHOLDER,
} from "../../lib/format/phone-ru";
import { designTokens } from "../../lib/design-tokens";

type PhoneInputProps = {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  required?: boolean;
};

export function PhoneInput({
  name,
  defaultValue = "",
  placeholder = PHONE_RU_PLACEHOLDER,
  ariaLabel,
  className = "",
  required = false,
}: PhoneInputProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nationalDigits, setNationalDigits] = useState(() => extractRuPhoneDigits(defaultValue));
  const display = formatRuPhoneFromDigits(nationalDigits);
  const stored = display;
  const [invalid, setInvalid] = useState(false);

  const updateDigits = useCallback((digits: string) => {
    const next = digits.slice(0, 10);
    setNationalDigits(next);
    setInvalid(next.length > 0 && !isValidRuPhone(formatRuPhoneFromDigits(next)));
  }, []);

  useEffect(() => {
    updateDigits(extractRuPhoneDigits(defaultValue));
  }, [defaultValue, updateDigits]);

  const placeCursor = useCallback((position: number) => {
    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) return;
      const safe = Math.max(0, Math.min(position, input.value.length));
      input.setSelectionRange(safe, safe);
    });
  }, []);

  const removeLastDigit = useCallback(() => {
    if (!nationalDigits) return;
    const next = nationalDigits.slice(0, -1);
    updateDigits(next);
    placeCursor(formatRuPhoneFromDigits(next).length);
  }, [nationalDigits, placeCursor, updateDigits]);

  const removeDigitAt = useCallback(
    (index: number) => {
      if (index < 0 || index >= nationalDigits.length) return;
      const next = nationalDigits.slice(0, index) + nationalDigits.slice(index + 1);
      updateDigits(next);
      const formatted = formatRuPhoneFromDigits(next);
      let cursor = 0;
      let seen = 0;
      for (let i = 0; i < formatted.length && seen < index; i += 1) {
        if (/\d/.test(formatted[i] ?? "")) seen += 1;
        cursor = i + 1;
      }
      placeCursor(cursor);
    },
    [nationalDigits, placeCursor, updateDigits],
  );

  return (
    <>
      <input type="hidden" name={name} value={stored} />
      <input
        ref={inputRef}
        id={inputId}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={display}
        onChange={(event) => updateDigits(extractRuPhoneDigits(event.target.value))}
        onKeyDown={(event) => {
          const input = event.currentTarget;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? start;
          if (start !== end) return;

          if (event.key === "Backspace" && start > 0) {
            const charBefore = display[start - 1];
            if (charBefore && !/\d/.test(charBefore)) {
              event.preventDefault();
              removeLastDigit();
            }
            return;
          }

          if (event.key === "Delete" && start < display.length) {
            const charAt = display[start];
            if (charAt && !/\d/.test(charAt)) {
              event.preventDefault();
              const nationalIndex = display.slice(0, start).replace(/\D/g, "").length;
              const digitIndex = display.includes("+7") ? Math.max(0, nationalIndex - 1) : nationalIndex;
              if (digitIndex < nationalDigits.length) {
                removeDigitAt(digitIndex);
              }
            }
          }
        }}
        onBlur={() => setInvalid(nationalDigits.length > 0 && !isValidRuPhone(display))}
        aria-invalid={invalid}
        className={`${className} ${invalid ? "border-accent-danger" : ""}`.trim()}
        style={invalid ? { borderColor: designTokens.color.accent.danger } : undefined}
      />
    </>
  );
}
