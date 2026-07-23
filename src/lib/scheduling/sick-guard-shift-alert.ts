import { toDateIsoKhabarovsk } from "../format/display-date";
import type { GuardStatus } from "./types";

/** Будущие (и сегодняшние) смены охранника со статусом «Болеет» — нужны замена/внимание. */
export function shouldAlertSickGuardFutureShift(
  guardStatus: GuardStatus | undefined,
  shiftDateIso: string,
  now = new Date(),
): boolean {
  if (guardStatus !== "Sick") return false;
  return shiftDateIso >= toDateIsoKhabarovsk(now);
}
