"use client";

import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { designTokens } from "../../lib/design-tokens";

type ObjectSwitchTab = {
  id: string;
  name: string;
};

type ObjectSwitchTabsProps = {
  objects: ObjectSwitchTab[];
  currentObjectId: string;
  month: string;
};

const SCROLL_STEP_PX = 220;

export function ObjectSwitchTabs({ objects, currentObjectId, month }: ObjectSwitchTabsProps) {
  const router = useRouter();
  const stripRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const sortedObjects = useMemo(
    () => [...objects].sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [objects],
  );

  const updateScrollState = useCallback(() => {
    const el = stripRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(maxScroll > 2 && el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener("scroll", updateScrollState, { passive: true });
    const onWheel = (event: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      event.preventDefault();
      el.scrollLeft += event.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    const ro = new ResizeObserver(() => updateScrollState());
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateScrollState);
      el.removeEventListener("wheel", onWheel);
      ro.disconnect();
    };
  }, [sortedObjects, updateScrollState]);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-object-tab-id="${currentObjectId}"]`);
    active?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [currentObjectId, sortedObjects]);

  if (sortedObjects.length <= 1) {
    return null;
  }

  function navigateToObject(objectId: string) {
    const scrollY =
      typeof window !== "undefined" ? Math.round(window.scrollY) : undefined;
    const params = new URLSearchParams({ month });
    if (scrollY != null && scrollY > 0) {
      params.set("scrollY", String(scrollY));
    }
    router.push(`/objects/${objectId}?${params.toString()}`, { scroll: false });
  }

  function scrollStrip(direction: -1 | 1) {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * SCROLL_STEP_PX, behavior: "smooth" });
  }

  return (
    <section
      className="overflow-hidden rounded-card border border-app-border bg-app-surface shadow-glow"
      aria-label="Переключение объектов"
    >
      <div className="flex items-stretch gap-0 border-b border-app-border bg-app-elevated/50">
        <div
          className="flex shrink-0 items-center gap-1.5 border-r border-app-border px-2 py-2 sm:gap-2 sm:px-4 sm:py-3"
          style={{ color: designTokens.color.accent.primary }}
        >
          <Building2 className="size-4 shrink-0 opacity-80" aria-hidden />
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-app-muted">
            Объекты
          </span>
        </div>

        <button
          type="button"
          className="flex shrink-0 items-center justify-center border-r border-app-border px-2 text-app-muted transition-colors hover:bg-app-surface/70 hover:text-app-text disabled:pointer-events-none disabled:opacity-30"
          onClick={() => scrollStrip(-1)}
          disabled={!canScrollLeft}
          aria-label="Прокрутить объекты влево"
        >
          <ChevronLeft className="size-5" />
        </button>

        <div
          ref={stripRef}
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sortedObjects.map((item) => {
            const isActive = item.id === currentObjectId;
            const href = `/objects/${item.id}?month=${encodeURIComponent(month)}`;

            return (
              <Link
                key={item.id}
                data-object-tab-id={item.id}
                href={href}
                scroll={false}
                onClick={(event) => {
                  if (isActive) {
                    event.preventDefault();
                    return;
                  }
                  event.preventDefault();
                  navigateToObject(item.id);
                }}
                aria-current={isActive ? "page" : undefined}
                title={item.name}
                className={[
                  "group relative shrink-0 max-w-[12rem] truncate px-3 py-2.5 text-xs transition-colors sm:max-w-[16rem] sm:px-4 sm:py-3 sm:text-sm",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-primary",
                  isActive
                    ? "bg-app-surface font-semibold text-app-text"
                    : "font-medium text-app-muted hover:bg-app-surface/70 hover:text-app-text",
                ].join(" ")}
              >
                <span className="block truncate">{item.name}</span>
                <span
                  className={[
                    "pointer-events-none absolute inset-x-3 bottom-0 h-0.5 rounded-full transition-opacity",
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                  ].join(" ")}
                  style={{
                    backgroundColor: isActive
                      ? designTokens.color.accent.primary
                      : designTokens.color.border,
                  }}
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          className="flex shrink-0 items-center justify-center border-l border-app-border px-2 text-app-muted transition-colors hover:bg-app-surface/70 hover:text-app-text disabled:pointer-events-none disabled:opacity-30"
          onClick={() => scrollStrip(1)}
          disabled={!canScrollRight}
          aria-label="Прокрутить объекты вправо"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
    </section>
  );
}
