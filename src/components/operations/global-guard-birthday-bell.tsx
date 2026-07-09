/**
 * Глобальный индикатор дней рождения охранников: иконка торта рядом с колокольчиком недоборов.
 */

"use client";

import Link from "next/link";
import { Cake } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { designTokens } from "../../lib/design-tokens";
import type { GlobalAlertBirthdayItem } from "../../lib/operations/global-alerts";

function pluralBirthdays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "именинник";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "именинника";
  return "именинников";
}

function pluralYears(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "год";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "года";
  return "лет";
}

type GlobalGuardBirthdayBellProps = {
  items?: GlobalAlertBirthdayItem[] | null;
};

export function GlobalGuardBirthdayBell({ items = null }: GlobalGuardBirthdayBellProps) {
  const pathname = usePathname();
  const [hovered, setHovered] = useState(false);

  if (pathname === "/login" || !items || items.length === 0) {
    return null;
  }

  const accent = designTokens.color.accent.birthday;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setHovered(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHovered(false);
      }}
    >
      <button
        type="button"
        className="relative flex size-10 items-center justify-center rounded-full border bg-app-surface shadow-glow transition-all hover:scale-105"
        style={{
          borderColor: accent,
          color: accent,
          boxShadow: designTokens.shadow.glow,
        }}
        aria-label={`Сегодня день рождения: ${items.length} ${pluralBirthdays(items.length)}`}
      >
        <span
          className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow"
          style={{ backgroundColor: accent }}
        >
          {items.length}
        </span>
        <Cake className="size-5" />
      </button>

      <div
        className={`absolute right-0 top-full z-[99] w-72 pt-2 transition-all duration-150 ${
          hovered
            ? "pointer-events-auto visible translate-y-0 opacity-100"
            : "pointer-events-none invisible -translate-y-2 opacity-0"
        }`}
      >
        <div
          className="max-h-[min(70vh,24rem)] overflow-y-auto rounded-card border bg-app-surface p-3 text-xs shadow-glow"
          style={{
            borderColor: accent,
            boxShadow: designTokens.shadow.glow,
          }}
        >
          <div className="mb-2 flex items-center gap-1.5 border-b border-app-border pb-2">
            <Cake className="size-4 shrink-0" style={{ color: accent }} />
            <span className="font-bold" style={{ color: accent }}>
              Дни рождения сегодня
            </span>
          </div>

          <p className="mb-3 leading-snug text-app-muted">
            {items.length} {pluralBirthdays(items.length)} — поздравьте коллег!
          </p>

          <ul className="list-none space-y-2 p-0">
            {items.map((item) => (
              <li key={item.guardId}>
                <Link
                  href={`/guards/${item.guardId}`}
                  className="block rounded-button px-2 py-1.5 transition hover:bg-app-elevated/80"
                  onClick={() => setHovered(false)}
                >
                  <span className="font-semibold text-app-text">{item.guardName}</span>
                  <span className="mt-0.5 block text-app-muted">
                    {item.birthDateDisplay} · {item.ageYears} {pluralYears(item.ageYears)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
