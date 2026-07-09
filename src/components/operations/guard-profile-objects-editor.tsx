"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  clearGuardObjectAssignments,
  toggleGuardObjectAssignment,
} from "../../app/guards/actions";
import { Button } from "../ui/button";
import { formatGuardObjectsLabel } from "./guard-objects-multi-picker";
import type { ObjectListRow } from "../../lib/operations/objects-repository";
import { toast } from "../../store/toast-store";

type GuardProfileObjectsEditorProps = {
  guardId: string;
  objects: ObjectListRow[];
  initialObjectIds: string[];
  initialObjectNames: string[];
};

export function GuardProfileObjectsEditor({
  guardId,
  objects,
  initialObjectIds,
  initialObjectNames,
}: GuardProfileObjectsEditorProps) {
  const router = useRouter();
  const [objectIds, setObjectIds] = useState(initialObjectIds);
  const [objectNames, setObjectNames] = useState(initialObjectNames);
  const [search, setSearch] = useState("");
  const [pendingObjectId, setPendingObjectId] = useState<string | null>(null);
  const [isClearing, startClear] = useTransition();

  useEffect(() => {
    setObjectIds(initialObjectIds);
    setObjectNames(initialObjectNames);
  }, [initialObjectIds, initialObjectNames]);

  const filtered = objects.filter((object) =>
    search.trim() ? object.name.toLowerCase().includes(search.trim().toLowerCase()) : true,
  );

  async function handleToggle(objectId: string, objectName: string) {
    setPendingObjectId(objectId);
    try {
      const result = await toggleGuardObjectAssignment(guardId, objectId);
      setObjectIds(result.objectIds);
      setObjectNames(result.objectNames);
      toast({
        variant: "success",
        title: result.assigned ? "Объект назначен" : "Объект снят",
        message: result.assigned ? `${objectName} добавлен` : `${objectName} убран`,
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
        setObjectIds(result.objectIds);
        setObjectNames(result.objectNames);
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

  return (
    <div className="flex flex-col gap-2 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-app-muted">Объекты</span>
        <span className="text-xs text-app-muted">
          {formatGuardObjectsLabel(objectIds, objects, "Не назначен")}
        </span>
      </div>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Поиск объекта"
        className="h-9 w-full rounded-button border border-app-border bg-app-bg px-3 text-sm outline-none focus:border-accent-primary"
      />
      <div className="max-h-48 overflow-auto rounded-button border border-app-border bg-app-bg p-2">
        <Button
          type="button"
          variant="menu"
          size="sm"
          disabled={isClearing || objectIds.length === 0}
          className="mb-1 w-full justify-start"
          onClick={handleClearAll}
        >
          Снять все
        </Button>
        {filtered.length === 0 ? (
          <p className="px-1 py-2 text-xs text-app-muted">Объекты не найдены</p>
        ) : (
          filtered.map((object) => {
            const assigned = objectIds.includes(object.id);
            const pending = pendingObjectId === object.id;
            return (
              <Button
                key={object.id}
                type="button"
                variant="menu"
                size="sm"
                disabled={pending || isClearing}
                className={`mb-1 w-full justify-start ${assigned ? "font-semibold text-accent-primary" : ""} ${pending ? "opacity-60" : ""}`}
                onClick={() => void handleToggle(object.id, object.name)}
              >
                {assigned ? "✓ " : ""}
                {object.name}
                {pending ? " …" : ""}
              </Button>
            );
          })
        )}
      </div>
      {objectNames.length > 0 ? (
        <p className="text-xs text-app-muted">Назначено: {objectNames.join(", ")}</p>
      ) : null}
    </div>
  );
}
