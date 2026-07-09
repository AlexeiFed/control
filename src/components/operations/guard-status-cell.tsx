"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { updateGuardStatusAction } from "../../app/guards/actions";
import type { GuardListRow } from "../../lib/operations/guards-repository";
import { useDropdownPortalPosition } from "../../lib/guards/use-dropdown-portal-position";
import { guardStatusLabels, guardStatusOptions } from "../../lib/operations/status-labels";
import type { GuardStatus } from "../../lib/scheduling/types";
import { Button } from "../ui/button";

const MENU_WIDTH = 208;
const statusClass = {
  Active: "text-status-active",
  Sick: "text-accent-danger",
  OnVacation: "text-accent-warning",
  Inactive: "text-status-inactive",
  Dismissed: "text-status-inactive",
} as const;

type GuardStatusCellProps = {
  guard: GuardListRow;
  openMenu: string | null;
  setOpenMenu: (value: string | null | ((current: string | null) => string | null)) => void;
};

export function GuardStatusCell({ guard, openMenu, setOpenMenu }: GuardStatusCellProps) {
  const menuKey = `status-${guard.id}`;
  const [dismissedDate, setDismissedDate] = useState(guard.dismissedOn ?? "");
  const [dismissStep, setDismissStep] = useState(false);
  const isOpen = openMenu === menuKey;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuPosition = useDropdownPortalPosition({
    isOpen,
    anchorRef,
    menuRef,
    menuWidth: MENU_WIDTH,
    estimatedHeight: dismissStep ? 200 : 240,
    deps: [dismissStep, dismissedDate],
  });

  useEffect(() => {
    if (!isOpen) setDismissStep(false);
  }, [isOpen]);

  useEffect(() => {
    setDismissedDate(guard.dismissedOn ?? "");
  }, [guard.dismissedOn]);

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
      {dismissStep ? (
        <form action={updateGuardStatusAction} className="flex flex-col gap-2">
          <input type="hidden" name="guardId" value={guard.id} />
          <input type="hidden" name="status" value="Dismissed" />
          <p className={`text-xs font-medium ${statusClass.Dismissed}`}>Уволен</p>
          <label className="flex flex-col gap-1 text-xs text-app-muted">
            <span>Дата увольнения</span>
            <input
              type="date"
              name="dismissedOn"
              required
              value={dismissedDate}
              onChange={(e) => setDismissedDate(e.target.value)}
              className="h-8 w-full rounded-button border border-app-border bg-app-bg px-2 text-xs outline-none focus:border-accent-primary"
            />
          </label>
          <Button type="submit" variant="primary" size="sm" className="w-full">
            Сохранить
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setDismissStep(false)}
          >
            Назад
          </Button>
        </form>
      ) : (
        <div className="flex flex-col gap-1">
          {guardStatusOptions.map((statusOption) =>
            statusOption.value === "Dismissed" ? (
              <Button
                key={statusOption.value}
                type="button"
                variant="menu"
                size="sm"
                className={`justify-start ${statusClass.Dismissed}`}
                onClick={() => setDismissStep(true)}
              >
                {statusOption.label}
              </Button>
            ) : (
              <form key={statusOption.value} action={updateGuardStatusAction}>
                <input type="hidden" name="guardId" value={guard.id} />
                <input type="hidden" name="status" value={statusOption.value} />
                <Button
                  type="submit"
                  variant="menu"
                  size="sm"
                  className={`w-full justify-start ${statusClass[statusOption.value as GuardStatus]}`}
                >
                  {statusOption.label}
                </Button>
              </form>
            ),
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div className="relative mx-auto w-full max-w-[9rem]">
      <span ref={anchorRef} className="block w-full">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-center bg-app-bg"
          onClick={() => setOpenMenu((current) => (current === menuKey ? null : menuKey))}
        >
          <span className={statusClass[guard.status]}>{guardStatusLabels[guard.status]}</span>
        </Button>
      </span>
      {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
