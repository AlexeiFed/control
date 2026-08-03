import type { GuardStatus } from "../scheduling/types";

/** Уволенный можно вернуть в работу отдельным действием (не сменой статуса на Active). */
export function canReturnGuardToWork(status: GuardStatus): boolean {
  return status === "Dismissed";
}

export function validateReturnToWorkDate(input: {
  returnedOn: string;
  dismissedOn: string | null;
}): { ok: true } | { ok: false; error: string } {
  const returnedOn = input.returnedOn.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(returnedOn)) {
    return { ok: false, error: "Укажите дату возврата" };
  }
  const dismissedOn = input.dismissedOn?.trim() || null;
  if (dismissedOn && returnedOn < dismissedOn) {
    return { ok: false, error: "Дата возврата не может быть раньше даты увольнения" };
  }
  return { ok: true };
}

/**
 * Дата закрытия старых периодов перед возвратом.
 * Нужна, чтобы trim по returnedOn не «дотягивал» послужной список до дня возврата.
 */
export function profileCloseDateBeforeReturn(input: {
  returnedOn: string;
  dismissedOn: string | null;
}): string {
  const returnedOn = input.returnedOn.trim();
  const dismissedOn = input.dismissedOn?.trim() || null;
  if (dismissedOn && dismissedOn <= returnedOn) return dismissedOn;
  return returnedOn;
}
