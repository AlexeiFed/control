export const PHONE_RU_PLACEHOLDER = "+7 (___) ___ __ __";

const RU_LOCAL_DIGITS = 10;

/** Локальные 10 цифр (без кода страны). */
export function extractRuPhoneDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (!digits) return "";

  const hasCountryInValue = value.includes("+7");

  // +7 в маске или 7XXXXXXXXXX при вставке — убираем код страны, не первую цифру номера.
  if (digits.startsWith("7") && (hasCountryInValue || digits.length > RU_LOCAL_DIGITS)) {
    digits = digits.slice(1);
  }

  // 8XXXXXXXXXX (11 цифр): ведущая 8 — префикс набора, не первая цифра номера.
  if (digits.startsWith("8") && digits.length > RU_LOCAL_DIGITS) {
    digits = digits.slice(1);
  }

  return digits.slice(0, RU_LOCAL_DIGITS);
}

/** Маска +7 (XXX) XXX XX XX; пустая строка, если цифр нет. */
export function formatRuPhoneFromDigits(digits: string): string {
  const d = extractRuPhoneDigits(digits);
  if (!d) return "";

  let formatted = "+7";
  if (d.length > 0) {
    formatted += ` (${d.slice(0, 3)}`;
    if (d.length >= 3) formatted += ")";
    if (d.length > 3) formatted += ` ${d.slice(3, 6)}`;
    if (d.length > 6) formatted += ` ${d.slice(6, 8)}`;
    if (d.length > 8) formatted += ` ${d.slice(8, 10)}`;
  }
  return formatted;
}

export function formatRuPhoneDisplay(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const formatted = formatRuPhoneFromDigits(trimmed);
  return formatted || trimmed;
}

/** Пусто или полный номер (10 цифр после +7). */
export function isValidRuPhone(value: string): boolean {
  const digits = extractRuPhoneDigits(value);
  return digits.length === 0 || digits.length === RU_LOCAL_DIGITS;
}

export function normalizeRuPhoneForStorage(value: string): string {
  const digits = extractRuPhoneDigits(value);
  if (!digits) return "";
  return formatRuPhoneFromDigits(digits);
}
