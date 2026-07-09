"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isPendingNavigationTarget } from "../../lib/navigation/pending-target";

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentPathWithSearch = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setPending(false);
  }, [currentPathWithSearch]);

  useEffect(() => {
    function onAppNavPending(event: Event) {
      const detail = (event as CustomEvent<{ pending?: boolean }>).detail;
      setPending(detail?.pending !== false);
    }
    window.addEventListener("app:nav-pending", onAppNavPending as EventListener);
    return () => window.removeEventListener("app:nav-pending", onAppNavPending as EventListener);
  }, []);

  useEffect(() => {
    function startPendingFromAnchor(anchor: HTMLAnchorElement) {
      const href = anchor.getAttribute("href");
      if (!href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (isPendingNavigationTarget(currentPathWithSearch, href)) setPending(true);
    }

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (anchor instanceof HTMLAnchorElement) startPendingFromAnchor(anchor);
    }

    // Не вешаем прогресс на submit: server actions и revalidatePath не меняют URL,
    // а сброс pending завязан только на pathname/searchParams — получался «вечный» лоадер.

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
    };
  }, [currentPathWithSearch]);

  useEffect(() => {
    if (!pending) return;
    const timeout = window.setTimeout(() => setPending(false), 20_000);
    return () => window.clearTimeout(timeout);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[70]">
      <div className="h-1 w-full overflow-hidden bg-accent-primary/10">
        <div className="h-full w-1/2 animate-[navigation-progress_1.1s_ease-in-out_infinite] rounded-full bg-accent-primary" />
      </div>
      <div className="mx-auto mt-3 w-fit rounded-full border border-app-border bg-app-surface px-4 py-2 text-sm font-semibold text-app-text shadow-glow">
        Загружаю раздел...
      </div>
    </div>
  );
}
