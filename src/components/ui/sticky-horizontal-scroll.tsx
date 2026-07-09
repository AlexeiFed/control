"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./button";

type StickyHorizontalScrollProps = {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
};

type BarRect = {
  left: number;
  width: number;
};

function scrollRange(el: HTMLElement): number {
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

/**
 * Горизонтальный скролл таблицы: нативный ползунок скрыт, зеркальный — fixed внизу viewport
 * по ширине контейнера (иначе на узкой таблице ползунок не доезжает до правого края).
 */
export function StickyHorizontalScroll({
  children,
  className,
  scrollClassName,
}: StickyHorizontalScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickyRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [ghostWidth, setGhostWidth] = useState(0);
  const [barRect, setBarRect] = useState<BarRect>({ left: 0, width: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  const updateMetrics = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const rect = scroll.getBoundingClientRect();
    setBarRect({
      left: Math.max(0, rect.left),
      width: Math.max(0, rect.width),
    });
    setHasOverflow(scroll.scrollWidth > scroll.clientWidth + 1);
    setGhostWidth(Math.ceil(scroll.scrollWidth));
  }, []);

  const applyScrollLeft = useCallback((source: "table" | "sticky") => {
    const scroll = scrollRef.current;
    const sticky = stickyRef.current;
    if (!scroll || !sticky || syncingRef.current) return;

    const tableRange = scrollRange(scroll);
    const stickyRange = scrollRange(sticky);

    syncingRef.current = true;
    if (source === "table") {
      if (tableRange <= 0 || stickyRange <= 0) {
        sticky.scrollLeft = 0;
      } else {
        sticky.scrollLeft = (scroll.scrollLeft / tableRange) * stickyRange;
      }
    } else if (stickyRange <= 0 || tableRange <= 0) {
      scroll.scrollLeft = 0;
    } else {
      scroll.scrollLeft = (sticky.scrollLeft / stickyRange) * tableRange;
    }
    syncingRef.current = false;
  }, []);

  const scheduleSyncFromTable = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      applyScrollLeft("table");
    });
  }, [applyScrollLeft]);

  const scheduleSyncFromSticky = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      applyScrollLeft("sticky");
    });
  }, [applyScrollLeft]);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    updateMetrics();

    const resizeObserver = new ResizeObserver(() => {
      updateMetrics();
    });
    resizeObserver.observe(scroll);
    if (scroll.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(scroll.firstElementChild);
    }

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => setIsInView(entry?.isIntersecting ?? false),
      { root: null, threshold: 0 },
    );
    intersectionObserver.observe(scroll);

    scroll.addEventListener("scroll", scheduleSyncFromTable, { passive: true });
    window.addEventListener("resize", updateMetrics);
    window.addEventListener("scroll", updateMetrics, { passive: true });

    return () => {
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      scroll.removeEventListener("scroll", scheduleSyncFromTable);
      window.removeEventListener("resize", updateMetrics);
      window.removeEventListener("scroll", updateMetrics);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [scheduleSyncFromTable, updateMetrics]);

  useEffect(() => {
    const sticky = stickyRef.current;
    if (!sticky) return;

    sticky.addEventListener("scroll", scheduleSyncFromSticky, { passive: true });
    return () => sticky.removeEventListener("scroll", scheduleSyncFromSticky);
  }, [scheduleSyncFromSticky, hasOverflow, isInView, barRect.width, ghostWidth]);

  useEffect(() => {
    if (hasOverflow) {
      scheduleSyncFromTable();
    }
  }, [hasOverflow, scheduleSyncFromTable, ghostWidth, barRect.width]);

  const showStickyBar = mounted && hasOverflow && isInView && barRect.width > 0;

  const stickyBar = showStickyBar ? (
    <div
      ref={stickyRef}
      className="registry-sticky-h-scroll pointer-events-auto bottom-0 z-[60] border-t border-app-border bg-app-surface shadow-[0_-4px_12px_rgb(15_23_42_/_0.08)]"
      style={{
        left: barRect.left,
        width: barRect.width,
      }}
      aria-hidden
    >
      <div className="h-px" style={{ width: ghostWidth }} />
    </div>
  ) : null;

  return (
    <>
      <div
        ref={scrollRef}
        className={cn(
          "registry-table-h-scroll w-full min-w-0 max-w-full overscroll-x-contain",
          scrollClassName,
          className,
        )}
      >
        {children}
      </div>
      {mounted && stickyBar ? createPortal(stickyBar, document.body) : null}
    </>
  );
}
