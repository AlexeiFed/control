"use client";

import { useLayoutEffect, useState } from "react";

export type DropdownPortalPosition = { top: number; left: number };

type UseDropdownPortalPositionOptions = {
  isOpen: boolean;
  anchorRef: React.RefObject<HTMLElement | null>;
  menuRef: React.RefObject<HTMLElement | null>;
  menuWidth: number;
  estimatedHeight?: number;
  deps?: unknown[];
};

export function useDropdownPortalPosition({
  isOpen,
  anchorRef,
  menuRef,
  menuWidth,
  estimatedHeight = 280,
  deps = [],
}: UseDropdownPortalPositionOptions): DropdownPortalPosition | null {
  const [position, setPosition] = useState<DropdownPortalPosition | null>(null);
  const gap = 8;

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setPosition(null);
      return;
    }

    const sync = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const menuHeight = menuRef.current?.offsetHeight ?? estimatedHeight;
      const spaceBelow = window.innerHeight - anchor.bottom;
      const spaceAbove = anchor.top;
      const openUp = spaceBelow < menuHeight + gap && spaceAbove > spaceBelow;

      let top = openUp ? anchor.top - menuHeight - gap : anchor.bottom + gap;
      top = Math.max(gap, Math.min(top, window.innerHeight - menuHeight - gap));

      let left = anchor.left + anchor.width / 2 - menuWidth / 2;
      left = Math.max(gap, Math.min(left, window.innerWidth - menuWidth - gap));

      setPosition({ top, left });
    };

    sync();
    const ro = menuRef.current ? new ResizeObserver(sync) : null;
    if (menuRef.current) ro?.observe(menuRef.current);
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [isOpen, menuWidth, estimatedHeight, anchorRef, menuRef, ...deps]);

  return position;
}
