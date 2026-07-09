export const UNIFORM_SIZE_MIN = 44;
export const UNIFORM_SIZE_MAX = 70;
export const UNIFORM_HEIGHT_MIN = 150;
export const UNIFORM_HEIGHT_MAX = 220;

/** Буквенные размеры формы (в БД — коды 1…7). */
export const UNIFORM_SIZE_LETTERS = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"] as const;
export type UniformSizeLetter = (typeof UNIFORM_SIZE_LETTERS)[number];

export const UNIFORM_SIZE_LETTER_CODE: Record<UniformSizeLetter, number> = {
  XS: 1,
  S: 2,
  M: 3,
  L: 4,
  XL: 5,
  XXL: 6,
  XXXL: 7,
};

const CODE_TO_LETTER = Object.fromEntries(
  Object.entries(UNIFORM_SIZE_LETTER_CODE).map(([letter, code]) => [code, letter]),
) as Record<number, UniformSizeLetter>;

export function isUniformSizeLetterCode(value: number): boolean {
  return value >= 1 && value <= UNIFORM_SIZE_LETTERS.length;
}

export function isValidUniformSizeStored(value: number): boolean {
  return (
    isUniformSizeLetterCode(value) ||
    (Number.isInteger(value) && value >= UNIFORM_SIZE_MIN && value <= UNIFORM_SIZE_MAX)
  );
}

/** Значение из `<select>` → код в БД. */
export function parseUniformSizeFormValue(raw: unknown): number | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  if ((UNIFORM_SIZE_LETTERS as readonly string[]).includes(s)) {
    return UNIFORM_SIZE_LETTER_CODE[s as UniformSizeLetter];
  }
  const n = Number(s);
  if (!Number.isInteger(n) || !isValidUniformSizeStored(n)) return null;
  return n;
}

/** Код в БД → значение `<option value>`. */
export function uniformSizeToFormValue(size: number | null | undefined): string {
  if (size == null) return "";
  const letter = CODE_TO_LETTER[size];
  return letter ?? String(size);
}

export function formatUniformSizeDisplay(size: number): string {
  return CODE_TO_LETTER[size] ?? String(size);
}

/** @deprecated Используйте числовой диапазон через uniformSizeNumericOptions. */
export const uniformSizeOptions = Array.from(
  { length: UNIFORM_SIZE_MAX - UNIFORM_SIZE_MIN + 1 },
  (_, i) => UNIFORM_SIZE_MIN + i,
);

export const uniformSizeLetterOptions = UNIFORM_SIZE_LETTERS.map((letter) => ({
  value: letter,
  label: letter,
}));

export const uniformSizeNumericOptions = uniformSizeOptions.map((size) => ({
  value: String(size),
  label: String(size),
}));

export const uniformHeightOptions = Array.from(
  { length: UNIFORM_HEIGHT_MAX - UNIFORM_HEIGHT_MIN + 1 },
  (_, i) => UNIFORM_HEIGHT_MIN + i,
);

export function hasGuardUniform(
  size: number | null | undefined,
  height: number | null | undefined,
): boolean {
  return size != null && height != null;
}

export function formatGuardUniformTooltip(size: number, height: number): string {
  return `Размер: ${formatUniformSizeDisplay(size)}, рост: ${height}`;
}
