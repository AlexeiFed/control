"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GripVertical, Trash2, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../ui/button";
import {
  guardEmploymentCellTooltip,
  guardLicenseCellTooltip,
} from "../../lib/guards/guard-list-tooltips";
import {
  formatGuardTableDate,
  GuardTableHeaderLabel,
  guardRegistryLastNameClass,
  guardRegistryReminderRowClass,
  guardRegistryReminderRowStyle,
  guardTableLicenseGrade,
  guardTableLicenseValidUntil,
  guardTableTdClass,
  guardTableThClass,
} from "../../lib/guards/guard-table-cells";
import {
  DEFAULT_GUARD_REGISTRY_COLUMN_ORDER,
  GUARD_REGISTRY_COLUMN_META,
  loadGuardRegistryColumnOrder,
  loadGuardRegistryHiddenColumns,
  normalizeGuardRegistryColumnOrder,
  saveGuardRegistryColumnOrder,
  saveGuardRegistryHiddenColumns,
  type GuardRegistryColumnId,
} from "../../lib/guards/guard-registry-columns";
import { isGuardComplianceReminderRow } from "../../lib/guards/periodic-check";
import type { GuardListRow } from "../../lib/operations/guards-repository";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import {
  guardEmploymentLabels,
  guardLicenseLabels,
  guardPositionLabels,
} from "../../lib/operations/status-labels";
import { formatUniformIssuedTooltip } from "../../lib/format/uniform";
import { GuardStatusCell } from "./guard-status-cell";
import { GuardTableObjectsCell } from "./guard-table-objects-cell";
import { StickyHorizontalScroll } from "../ui/sticky-horizontal-scroll";

type GuardRegistryTableProps = {
  userId: string;
  guards: GuardListRow[];
  objects: ObjectListRow[];
  openMenu: string | null;
  setOpenMenu: (value: string | null | ((current: string | null) => string | null)) => void;
  rowObjectSearch: string;
  setRowObjectSearch: (value: string) => void;
  onDeleteGuard: (target: { id: string; name: string }) => void;
};

export function GuardRegistryTable({
  userId,
  guards,
  objects,
  openMenu,
  setOpenMenu,
  rowObjectSearch,
  setRowObjectSearch,
  onDeleteGuard,
}: GuardRegistryTableProps) {
  const router = useRouter();
  const prefsUserRef = useRef<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<GuardRegistryColumnId[]>(
    () => [...DEFAULT_GUARD_REGISTRY_COLUMN_ORDER],
  );
  const [dragColumnId, setDragColumnId] = useState<GuardRegistryColumnId | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<GuardRegistryColumnId | null>(null);
  const [hiddenColumnIds, setHiddenColumnIds] = useState<GuardRegistryColumnId[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setColumnOrder(loadGuardRegistryColumnOrder(userId));
    setHiddenColumnIds(loadGuardRegistryHiddenColumns(userId));
    prefsUserRef.current = userId;
  }, [userId]);

  const canPersistPrefs = prefsUserRef.current === userId;

  useEffect(() => {
    if (!canPersistPrefs) return;
    saveGuardRegistryHiddenColumns(hiddenColumnIds, userId);
  }, [hiddenColumnIds, userId, canPersistPrefs]);

  const toggleColumnVisibility = useCallback((columnId: GuardRegistryColumnId) => {
    setHiddenColumnIds((current) => {
      if (current.includes(columnId)) {
        return current.filter((id) => id !== columnId);
      } else {
        return [...current, columnId];
      }
    });
  }, []);

  const visibleColumns = useMemo(() => {
    return columnOrder.filter((id) => !hiddenColumnIds.includes(id));
  }, [columnOrder, hiddenColumnIds]);

  useEffect(() => {
    if (!canPersistPrefs) return;
    saveGuardRegistryColumnOrder(columnOrder, userId);
  }, [columnOrder, userId, canPersistPrefs]);

  const reorderColumns = useCallback((sourceId: GuardRegistryColumnId, targetId: GuardRegistryColumnId) => {
    const meta = GUARD_REGISTRY_COLUMN_META[sourceId];
    const targetMeta = GUARD_REGISTRY_COLUMN_META[targetId];
    if (!meta.draggable || !targetMeta.draggable || sourceId === targetId) return;

    setColumnOrder((current) => {
      const next = [...current];
      const from = next.indexOf(sourceId);
      const to = next.indexOf(targetId);
      if (from < 0 || to < 0) return current;
      next.splice(from, 1);
      next.splice(to, 0, sourceId);
      return normalizeGuardRegistryColumnOrder(next);
    });
  }, []);

  const columnCount = visibleColumns.length;

  const headerCells = useMemo(
    () =>
      visibleColumns.map((columnId) => {
        const meta = GUARD_REGISTRY_COLUMN_META[columnId];
        const isDragOver = dragOverColumnId === columnId && dragColumnId !== columnId;
        return (
          <th
            key={columnId}
            className={cn(
              guardTableThClass,
              meta.headerClass,
              meta.draggable && "select-none",
              isDragOver && "bg-accent-primary/10",
            )}
            title={meta.title}
            draggable={meta.draggable}
            onDragStart={(event) => {
              if (!meta.draggable) return;
              setDragColumnId(columnId);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", columnId);
            }}
            onDragEnd={() => {
              setDragColumnId(null);
              setDragOverColumnId(null);
            }}
            onDragOver={(event) => {
              if (!meta.draggable || !dragColumnId || dragColumnId === columnId) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setDragOverColumnId(columnId);
            }}
            onDragLeave={() => {
              if (dragOverColumnId === columnId) setDragOverColumnId(null);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!dragColumnId) return;
              reorderColumns(dragColumnId, columnId);
              setDragColumnId(null);
              setDragOverColumnId(null);
            }}
          >
            <span
              className={cn(
                "inline-flex items-center justify-center gap-0.5",
                meta.draggable && "cursor-grab active:cursor-grabbing",
              )}
            >
              {meta.draggable ? (
                <GripVertical className="size-3 shrink-0 text-app-muted/80" aria-hidden />
              ) : null}
              {meta.multilineLabel ? (
                <GuardTableHeaderLabel label={meta.multilineLabel} />
              ) : (
                <span className="block">{meta.label}</span>
              )}
            </span>
          </th>
        );
      }),
    [visibleColumns, dragColumnId, dragOverColumnId, reorderColumns],
  );

  function renderCell(columnId: GuardRegistryColumnId, guard: GuardListRow, index: number) {
    switch (columnId) {
      case "index":
        return (
          <td key={columnId} className={`${guardTableTdClass} tabular-nums text-app-muted`}>
            {index + 1}
          </td>
        );
      case "lastName":
        return (
          <td key={columnId} className={guardTableTdClass}>
            <span className={guardRegistryLastNameClass(guard)}>
              {guard.lastName}
            </span>
          </td>
        );
      case "firstName":
        return (
          <td key={columnId} className={guardTableTdClass}>
            {guard.firstName}
          </td>
        );
      case "middleName":
        return (
          <td key={columnId} className={guardTableTdClass}>
            {guard.middleName || "—"}
          </td>
        );
      case "birthDate":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {formatGuardTableDate(guard.birthDate)}
          </td>
        );
      case "phone":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {guard.phone || "—"}
          </td>
        );
      case "contactPhone":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {guard.contactPhone || "—"}
          </td>
        );
      case "position":
        return (
          <td key={columnId} className={guardTableTdClass}>
            {guardPositionLabels[guard.position]}
          </td>
        );
      case "license":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {guard.licenseType === "Licensed" ? (
              <span className="cursor-default" title={guardLicenseCellTooltip(guard)}>
                {guardLicenseLabels.Licensed}
              </span>
            ) : guard.licenseType ? (
              guardLicenseLabels[guard.licenseType]
            ) : (
              "—"
            )}
          </td>
        );
      case "grade":
        return (
          <td key={columnId} className={`${guardTableTdClass} tabular-nums text-app-muted`}>
            {guardTableLicenseGrade(guard)}
          </td>
        );
      case "licenseValid":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {guardTableLicenseValidUntil(guard)}
          </td>
        );
      case "employment":
        return (
          <td key={columnId} className={guardTableTdClass}>
            {guard.employmentType === "Employed" ? (
              <span className="cursor-default text-status-active" title={guardEmploymentCellTooltip(guard)}>
                да
              </span>
            ) : (
              <span className="text-app-muted">—</span>
            )}
          </td>
        );
      case "employedOn":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {formatGuardTableDate(guard.employedOn)}
          </td>
        );
      case "medical":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {formatGuardTableDate(guard.medicalCommissionPassedOn)}
          </td>
        );
      case "periodic":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {formatGuardTableDate(guard.periodicCheckPassedOn)}
          </td>
        );
      case "personalCard":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {formatGuardTableDate(guard.personalCardAssignedOn)}
          </td>
        );
      case "car":
        return (
          <td key={columnId} className={guardTableTdClass}>
            {guard.hasCar ? (
              <span className="text-status-active">да</span>
            ) : (
              <span className="text-app-muted">нет</span>
            )}
          </td>
        );
      case "uniform":
        return (
          <td key={columnId} className={guardTableTdClass}>
            {guard.uniformIssued ? (
              <span
                className="cursor-default text-status-active"
                title={
                  guard.uniformIssuedOn && guard.uniformCondition
                    ? formatUniformIssuedTooltip({
                        issuedOn: guard.uniformIssuedOn,
                        condition: guard.uniformCondition,
                        note: guard.uniformNote,
                      })
                    : undefined
                }
              >
                да
              </span>
            ) : (
              <span className="text-app-muted">нет</span>
            )}
          </td>
        );
      case "objects":
        return (
          <td key={columnId} className={guardTableTdClass} onClick={(event) => event.stopPropagation()}>
            <div className="mx-auto flex max-w-[14rem] justify-center">
              <GuardTableObjectsCell
                guardId={guard.id}
                objectIds={guard.objectIds}
                objectNames={guard.objectNames}
                objects={objects}
                openMenu={openMenu}
                setOpenMenu={setOpenMenu}
                rowObjectSearch={rowObjectSearch}
                setRowObjectSearch={setRowObjectSearch}
              />
            </div>
          </td>
        );
      case "status":
        return (
          <td key={columnId} className={guardTableTdClass} onClick={(event) => event.stopPropagation()}>
            <GuardStatusCell guard={guard} openMenu={openMenu} setOpenMenu={setOpenMenu} />
          </td>
        );
      case "dismissedOn":
        return (
          <td key={columnId} className={`${guardTableTdClass} text-app-muted`}>
            {formatGuardTableDate(guard.dismissedOn)}
          </td>
        );
      case "actions":
        return (
          <td key={columnId} className={guardTableTdClass} onClick={(event) => event.stopPropagation()}>
            <Button
              type="button"
              variant="icon"
              size="icon"
              className="text-accent-danger hover:bg-accent-danger/10"
              aria-label="Удалить охранника"
              onClick={() =>
                onDeleteGuard({
                  id: guard.id,
                  name: `${guard.lastName} ${guard.firstName}`.trim(),
                })
              }
            >
              <Trash2 className="size-4" />
            </Button>
          </td>
        );
      default:
        return null;
    }
  }

  return (
    <div className="mt-4 min-w-0 overflow-x-clip rounded-card border border-app-border bg-app-surface">
      <div className="flex flex-col gap-2 border-b border-app-border px-3 py-1.5 md:flex-row md:items-center md:justify-between bg-app-elevated/40">
        <p className="text-xs text-app-muted">
          Перетащите заголовок колонки (иконка ≡) для изменения порядка. Порядок и видимость сохраняются отдельно для каждого пользователя.
        </p>
        <button
          type="button"
          onClick={() => setShowSettings(!showSettings)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-primary hover:underline"
        >
          <Settings className="size-3.5" />
          {showSettings ? "Скрыть настройку колонок" : "Настройка видимости колонок"}
        </button>
      </div>

      {showSettings && (
        <div className="border-b border-app-border bg-app-surface p-3 text-xs">
          <div className="mb-2 font-semibold text-app-text">Показать/скрыть колонки:</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {Object.values(GUARD_REGISTRY_COLUMN_META)
              .filter((col) => col.draggable)
              .map((col) => {
                const isVisible = !hiddenColumnIds.includes(col.id);
                return (
                  <label key={col.id} className="inline-flex cursor-pointer items-center gap-1.5 select-none text-app-muted hover:text-app-text">
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => toggleColumnVisibility(col.id)}
                      className="rounded border-app-border text-accent-primary focus:ring-accent-primary"
                    />
                    <span>{col.label || col.title}</span>
                  </label>
                );
              })}
          </div>
        </div>
      )}

      <StickyHorizontalScroll>
        <table className="w-max min-w-full border-collapse text-center text-sm">
          <thead className="bg-app-elevated">
            <tr>{headerCells}</tr>
          </thead>
          <tbody>
            {guards.map((guard, index) => {
              const complianceReminderRow = isGuardComplianceReminderRow(guard);
              return (
                <tr
                  key={guard.id}
                  className={cn(
                    "cursor-pointer border-b border-app-border last:border-b-0",
                    complianceReminderRow && guardRegistryReminderRowClass,
                    complianceReminderRow ? "hover:brightness-95" : "hover:bg-app-elevated/50",
                  )}
                  style={guardRegistryReminderRowStyle(complianceReminderRow)}
                  onClick={() => router.push(`/guards/${guard.id}`)}
                >
                  {visibleColumns.map((columnId) => renderCell(columnId, guard, index))}
                </tr>
              );
            })}
            {guards.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-app-muted" colSpan={columnCount}>
                  Охранники не найдены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </StickyHorizontalScroll>
    </div>
  );
}
