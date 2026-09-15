/** Зарплата в выгрузках: рубли вниз до целого, без копеек. */
export function floorRub(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

export function floorCentsToRub(cents: number): number {
  if (!Number.isFinite(cents) || cents <= 0) return 0;
  return Math.floor(cents / 100);
}
