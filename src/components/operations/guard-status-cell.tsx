"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { returnGuardToWorkAction, updateGuardStatusAction } from "../../app/guards/actions";
import type { GuardListRow } from "../../lib/operations/guards-repository";
import { useDropdownPortalPosition } from "../../lib/guards/use-dropdown-portal-position";
import { dispatchDirectoryDataRefresh } from "../../lib/guards/directory-data-refresh";
import { canReturnGuardToWork } from "../../lib/guards/return-to-work";
import { toDateIsoKhabarovsk } from "../../lib/format/display-date";
import { guardStatusLabels, guardStatusOptions } from "../../lib/operations/status-labels";
import type { GuardStatus } from "../../lib/scheduling/types";
import { toast } from "../../store/toast-store";
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const menuKey = `status-${guard.id}`;
  const [localStatus, setLocalStatus] = useState(guard.status);
  const [dismissedDate, setDismissedDate] = useState(guard.dismissedOn ?? "");
  const [returnDate, setReturnDate] = useState(() => toDateIsoKhabarovsk(new Date()));
  const [dismissStep, setDismissStep] = useState(false);
  const [returnStep, setReturnStep] = useState(false);
  const isOpen = openMenu === menuKey;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isDismissed = canReturnGuardToWork(localStatus);

  const menuPosition = useDropdownPortalPosition({
    isOpen,
    anchorRef,
    menuRef,
    menuWidth: MENU_WIDTH,
    estimatedHeight: dismissStep || returnStep ? 220 : 260,
    deps: [dismissStep, returnStep, dismissedDate, returnDate],
  });

  useEffect(() => {
    if (!isOpen) {
      setDismissStep(false);
      setReturnStep(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setLocalStatus(guard.status);
    setDismissedDate(guard.dismissedOn ?? "");
  }, [guard.status, guard.dismissedOn]);

  function applyStatus(status: GuardStatus, dismissedOn?: string) {
    const formData = new FormData();
    formData.set("guardId", guard.id);
    formData.set("status", status);
    if (dismissedOn) formData.set("dismissedOn", dismissedOn);

    startTransition(async () => {
      const result = await updateGuardStatusAction(formData);
      if (!result.ok) {
        toast({
          variant: "error",
          title: "Статус не обновлён",
          message: result.error,
          durationMs: 4500,
        });
        return;
      }
      setLocalStatus(result.status);
      setOpenMenu(null);
      setDismissStep(false);
      setReturnStep(false);
      dispatchDirectoryDataRefresh();
      router.refresh();
      toast({
        variant: "success",
        title: "Статус обновлён",
        message: guardStatusLabels[result.status],
        durationMs: 2200,
      });
    });
  }

  function applyReturnToWork() {
    const formData = new FormData();
    formData.set("guardId", guard.id);
    formData.set("returnedOn", returnDate);

    startTransition(async () => {
      const result = await returnGuardToWorkAction(formData);
      if (!result.ok) {
        toast({
          variant: "error",
          title: "Не удалось вернуть",
          message: result.error,
          durationMs: 4500,
        });
        return;
      }
      setLocalStatus("Active");
      setOpenMenu(null);
      setReturnStep(false);
      dispatchDirectoryDataRefresh();
      router.refresh();
      toast({
        variant: "success",
        title: "Вернули в работу",
        message: "Статус Active, занятость Б/У. Дата увольнения сохранена.",
        durationMs: 3200,
      });
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
      {returnStep ? (
        <div className="flex flex-col gap-2">
          <p className={`text-xs font-medium ${statusClass.Active}`}>Вернуть в работу</p>
          <p className="text-[10px] leading-snug text-app-muted">
            Active + Б/У. Дата увольнения останется в истории.
          </p>
          <label className="flex flex-col gap-1 text-xs text-app-muted">
            <span>Дата возврата</span>
            <input
              type="date"
              required
              value={returnDate}
              min={guard.dismissedOn ?? undefined}
              onChange={(e) => setReturnDate(e.target.value)}
              disabled={isPending}
              className="h-8 w-full rounded-button border border-app-border bg-app-bg px-2 text-xs outline-none focus:border-accent-primary disabled:opacity-60"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="w-full"
            disabled={isPending || !returnDate}
            onClick={applyReturnToWork}
          >
            Вернуть
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={isPending}
            onClick={() => setReturnStep(false)}
          >
            Назад
          </Button>
        </div>
      ) : dismissStep ? (
        <div className="flex flex-col gap-2">
          <p className={`text-xs font-medium ${statusClass.Dismissed}`}>Уволен</p>
          <label className="flex flex-col gap-1 text-xs text-app-muted">
            <span>Дата увольнения</span>
            <input
              type="date"
              required
              value={dismissedDate}
              onChange={(e) => setDismissedDate(e.target.value)}
              disabled={isPending}
              className="h-8 w-full rounded-button border border-app-border bg-app-bg px-2 text-xs outline-none focus:border-accent-primary disabled:opacity-60"
            />
          </label>
          <Button
            type="button"
            variant="primary"
            size="sm"
            className="w-full"
            disabled={isPending || !dismissedDate}
            onClick={() => applyStatus("Dismissed", dismissedDate)}
          >
            Сохранить
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-full"
            disabled={isPending}
            onClick={() => setDismissStep(false)}
          >
            Назад
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {isDismissed ? (
            <Button
              type="button"
              variant="menu"
              size="sm"
              className={`justify-start ${statusClass.Active}`}
              disabled={isPending}
              onClick={() => setReturnStep(true)}
            >
              Вернуть в работу
            </Button>
          ) : null}
          {guardStatusOptions.map((statusOption) => {
            if (isDismissed && statusOption.value !== "Dismissed") return null;
            if (statusOption.value === "Dismissed") {
              return (
                <Button
                  key={statusOption.value}
                  type="button"
                  variant="menu"
                  size="sm"
                  className={`justify-start ${statusClass.Dismissed}`}
                  disabled={isPending}
                  onClick={() => setDismissStep(true)}
                >
                  {isDismissed ? "Изменить дату увольнения" : statusOption.label}
                </Button>
              );
            }
            return (
              <Button
                key={statusOption.value}
                type="button"
                variant="menu"
                size="sm"
                className={`w-full justify-start ${statusClass[statusOption.value as GuardStatus]}`}
                disabled={isPending || localStatus === statusOption.value}
                onClick={() => applyStatus(statusOption.value as GuardStatus)}
              >
                {statusOption.label}
              </Button>
            );
          })}
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
          disabled={isPending}
          onClick={() => setOpenMenu((current) => (current === menuKey ? null : menuKey))}
        >
          <span className={statusClass[localStatus]}>{guardStatusLabels[localStatus]}</span>
        </Button>
      </span>
      {typeof document !== "undefined" && menuPanel ? createPortal(menuPanel, document.body) : null}
    </div>
  );
}
