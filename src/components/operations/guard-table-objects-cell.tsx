"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  clearGuardObjectAssignments,
  toggleGuardObjectAssignment,
} from "../../app/guards/actions";
import { Button } from "../ui/button";
import { formatGuardObjectsLabel } from "./guard-objects-multi-picker";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import { toast } from "../../store/toast-store";

const MENU_WIDTH = 256;
const MENU_GAP = 8;

type GuardTableObjectsCellProps = {
  guardId: string;
  objectIds: string[];
  objectNames: string[];
  objects: ObjectListRow[];
  openMenu: string | null;
  setOpenMenu: (key: string | null) => void;
  rowObjectSearch: string;
  setRowObjectSearch: (value: string) => void;
};

type MenuPosition = {
  top: number;
  left: number;
};

export function GuardTableObjectsCell({
  guardId,
  objectIds,
  objectNames,
  objects,
  openMenu,
  setOpenMenu,
  rowObjectSearch,
  setRowObjectSearch,
}: GuardTableObjectsCellProps) {
  const router = useRouter();
  const menuKey = `object-${guardId}`;
  const isOpen = openMenu === menuKey;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [localIds, setLocalIds] = useState(objectIds);
  const [localNames, setLocalNames] = useState(objectNames);
  const [pendingObjectId, setPendingObjectId] = useState<string | null>(null);
  const [isClearing, startClear] = useTransition();

  useEffect(() => {
    setLocalIds(objectIds);
    setLocalNames(objectNames);
  }, [objectIds, objectNames]);

  const filtered = objects.filter((object) =>
    rowObjectSearch.trim() ? object.name.toLowerCase().includes(rowObjectSearch.trim().toLowerCase()) : true,
  );

  useLayoutEffect(() => {
    if (!isOpen || !anchorRef.current) {
      setMenuPosition(null);
      return;
    }

    const syncPosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const menuHeight = menuRef.current?.offsetHeight ?? 280;
      const spaceBelow = window.innerHeight - anchor.bottom;
      const spaceAbove = anchor.top;
      const openUp = spaceBelow < menuHeight + MENU_GAP && spaceAbove > spaceBelow;

      let top = openUp ? anchor.top - menuHeight - MENU_GAP : anchor.bottom + MENU_GAP;
      top = Math.max(MENU_GAP, Math.min(top, window.innerHeight - menuHeight - MENU_GAP));

      let left = anchor.left + anchor.width / 2 - MENU_WIDTH / 2;
      left = Math.max(MENU_GAP, Math.min(left, window.innerWidth - MENU_WIDTH - MENU_GAP));

      setMenuPosition({ top, left });
    };

    syncPosition();
    const ro = menuRef.current ? new ResizeObserver(syncPosition) : null;
    ro?.observe(menuRef.current!);
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [isOpen, filtered.length, rowObjectSearch, localIds.length]);

  async function handleToggle(objectId: string, objectName: string) {
    setPendingObjectId(objectId);
    try {
      const result = await toggleGuardObjectAssignment(guardId, objectId);
      setLocalIds(result.objectIds);
      setLocalNames(result.objectNames);
      setOpenMenu(menuKey);
      toast({
        variant: "success",
        title: result.assigned ? "Объект назначен" : "Объект снят",
        message: result.assigned
          ? `${objectName} добавлен`
          : `${objectName} убран из назначений`,
        durationMs: 2200,
      });
      router.refresh();
    } catch {
      toast({
        variant: "error",
        title: "Не удалось обновить объекты",
        message: "Попробуйте ещё раз",
        durationMs: 4000,
      });
    } finally {
      setPendingObjectId(null);
    }
  }

  function handleClearAll() {
    startClear(async () => {
      try {
        const result = await clearGuardObjectAssignments(guardId);
        setLocalIds(result.objectIds);
        setLocalNames(result.objectNames);
        setOpenMenu(menuKey);
        toast({
          variant: "success",
          title: "Назначения сняты",
          message: "Все объекты убраны",
          durationMs: 2200,
        });
        router.refresh();
      } catch {
        toast({
          variant: "error",
          title: "Не удалось снять объекты",
          message: "Попробуйте ещё раз",
          durationMs: 4000,
        });
      }
    });
  }

  const menuPanel = isOpen ? (
    <div
      ref={menuRef}
      data-dropdown={menuKey}
      className="rounded-button border border-app-border bg-app-surface p-2 shadow-glow"
      style={{
        position: "fixed",
        top: menuPosition?.top ?? -9999,
        left: menuPosition?.left ?? -9999,
        width: MENU_WIDTH,
        zIndex: 200,
        visibility: menuPosition ? "visible" : "hidden",
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        value={rowObjectSearch}
        onChange={(event) => setRowObjectSearch(event.target.value)}
        placeholder="Поиск объекта"
        className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-2 py-1 text-xs outline-none focus:border-accent-primary"
      />
      <div className="max-h-56 overflow-auto">
        <Button
          type="button"
          variant="menu"
          size="sm"
          disabled={isClearing || localIds.length === 0}
          className="mb-1 w-full justify-start"
          onClick={handleClearAll}
        >
          Снять все
        </Button>
        {filtered.map((object) => {
          const assigned = localIds.includes(object.id);
          const pending = pendingObjectId === object.id;
          return (
            <Button
              key={object.id}
              type="button"
              variant="menu"
              size="sm"
              disabled={pending}
              className={`mb-1 w-full justify-start ${assigned ? "font-semibold text-accent-primary" : ""} ${pending ? "opacity-60" : ""}`}
              onClick={() => void handleToggle(object.id, object.name)}
            >
              {assigned ? "✓ " : ""}
              {object.name}
              {pending ? " …" : ""}
            </Button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-2 w-full"
        onClick={() => setOpenMenu(null)}
      >
        Готово
      </Button>
    </div>
  ) : null;

  return (
    <div className="relative mx-auto min-w-[8rem] max-w-[14rem]">
      <span ref={anchorRef} className="block w-full">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center bg-app-bg"
          title={localNames.length > 0 ? localNames.join(", ") : undefined}
          onClick={() => {
            setOpenMenu(isOpen ? null : menuKey);
            if (!isOpen) setRowObjectSearch("");
          }}
        >
          <span className="truncate">
            {formatGuardObjectsLabel(localIds, objects, "Не назначен")}
          </span>
        </Button>
      </span>
      {typeof document !== "undefined" && menuPanel
        ? createPortal(menuPanel, document.body)
        : null}
    </div>
  );
}
