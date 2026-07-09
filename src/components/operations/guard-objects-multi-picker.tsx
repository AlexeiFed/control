"use client";

import { Button } from "../ui/button";
import type { ObjectListRow } from "../../lib/operations/objects-repository";

type GuardObjectsMultiPickerProps = {
  objects: ObjectListRow[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  menuKey: string;
  openMenu: string | null;
  onOpenMenuChange: (key: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  size?: "sm" | "lg";
  className?: string;
};

export function formatGuardObjectsLabel(
  selectedIds: string[],
  objects: ObjectListRow[],
  emptyLabel = "Без объекта",
): string {
  if (selectedIds.length === 0) return emptyLabel;
  const names = selectedIds
    .map((id) => objects.find((o) => o.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return emptyLabel;
  if (names.length <= 2) return names.join(", ");
  return `${names.length} объекта`;
}

export function GuardObjectsMultiPicker({
  objects,
  selectedIds,
  onSelectedIdsChange,
  menuKey,
  openMenu,
  onOpenMenuChange,
  search,
  onSearchChange,
  size = "lg",
  className = "",
}: GuardObjectsMultiPickerProps) {
  const isOpen = openMenu === menuKey;
  const filtered = objects.filter((object) =>
    search.trim() ? object.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  function toggleObject(objectId: string) {
    onSelectedIdsChange(
      selectedIds.includes(objectId)
        ? selectedIds.filter((id) => id !== objectId)
        : [...selectedIds, objectId],
    );
  }

  return (
    <div className={`relative ${className}`} data-dropdown={menuKey}>
      <Button
        type="button"
        variant="outline"
        size={size}
        className="w-full justify-start bg-app-bg font-medium"
        onClick={() => {
          onOpenMenuChange(isOpen ? null : menuKey);
          if (!isOpen) onSearchChange("");
        }}
      >
        <span className="truncate">{formatGuardObjectsLabel(selectedIds, objects)}</span>
      </Button>
      {isOpen ? (
        <div className="absolute z-10 mt-2 max-h-56 w-full min-w-[14rem] overflow-auto rounded-button border border-app-border bg-app-surface p-2 shadow-glow">
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Поиск объекта"
            className="mb-2 w-full rounded-button border border-app-border bg-app-bg px-2 py-1 text-sm outline-none focus:border-accent-primary"
          />
          <Button
            type="button"
            variant="menu"
            size="sm"
            className="mb-1 w-full justify-start"
            onClick={() => {
              onSelectedIdsChange([]);
              onOpenMenuChange(null);
            }}
          >
            Снять все
          </Button>
          {filtered.map((object) => {
            const selected = selectedIds.includes(object.id);
            return (
              <Button
                key={object.id}
                type="button"
                variant="menu"
                size="sm"
                className={`mb-1 w-full justify-start ${selected ? "font-semibold text-accent-primary" : ""}`}
                onClick={() => toggleObject(object.id)}
              >
                {selected ? "✓ " : ""}
                {object.name}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
