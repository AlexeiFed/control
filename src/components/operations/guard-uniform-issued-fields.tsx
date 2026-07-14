"use client";

import { useState } from "react";
import type { UniformCondition } from "../../lib/format/uniform";
import { uniformConditionLabels } from "../../lib/format/uniform";

type Props = {
  defaultIssued?: boolean;
  defaultIssuedOn?: string | null;
  defaultCondition?: UniformCondition | null;
  defaultNote?: string | null;
  /** компактные классы для create-формы */
  compact?: boolean;
  fieldClassName: string;
};

export function GuardUniformIssuedFields({
  defaultIssued = false,
  defaultIssuedOn = null,
  defaultCondition = null,
  defaultNote = null,
  compact = false,
  fieldClassName,
}: Props) {
  const [issued, setIssued] = useState(defaultIssued);

  return (
    <div
      className={
        compact ? "flex flex-col gap-2 lg:col-span-2" : "md:col-span-2 flex flex-col gap-3"
      }
    >
      <label className="flex items-center gap-2 text-sm text-app-muted">
        <input
          type="checkbox"
          name="uniformIssued"
          value="on"
          checked={issued}
          onChange={(e) => {
            const next = e.target.checked;
            if (!next && issued) {
              if (!window.confirm("Снять отметку и очистить данные выдачи?")) {
                return;
              }
            }
            setIssued(next);
          }}
          className="size-4"
        />
        Форма выдана
      </label>
      {issued ? (
        <div className={compact ? "grid gap-2 sm:grid-cols-3" : "grid gap-4 md:grid-cols-3"}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-app-muted font-medium">Дата выдачи</span>
            <input
              required
              type="date"
              name="uniformIssuedOn"
              defaultValue={defaultIssuedOn ?? ""}
              className={fieldClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-app-muted font-medium">Состояние</span>
            <select
              required
              name="uniformCondition"
              defaultValue={defaultCondition ?? ""}
              className={fieldClassName}
            >
              <option value="">—</option>
              <option value="new">{uniformConditionLabels.new}</option>
              <option value="used">{uniformConditionLabels.used}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-1">
            <span className="text-app-muted font-medium">Примечание</span>
            <input
              name="uniformNote"
              defaultValue={defaultNote ?? ""}
              className={fieldClassName}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
