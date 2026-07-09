/**
 * Краткое имя охранника для плотных ячеек графика: «Фамилия И.» из «Фамилия Иван».
 */
export function formatGuardSurnameWithInitial(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName;
  if (parts.length === 1) return parts[0]!;
  
  const last = parts[0]!; // Теперь фамилия первая
  const first = parts[1]!; // Имя второе
  const initial = first.charAt(0).toLocaleUpperCase("ru-RU");
  return `${last} ${initial}.`;
}

/** Только фамилия (первое слово ФИО) для компактных карточек графика. */
export function formatGuardLastNameOnly(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName;
  return parts[0]!; // Возвращаем первое слово (Фамилию)
}
