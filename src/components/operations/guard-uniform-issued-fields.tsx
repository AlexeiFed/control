"use client";

import { useState } from "react";
import type { UniformCondition } from "../../lib/format/uniform";
import {
  uniformConditionLabels,
  uniformSizeLetterOptions,
  uniformSizeNumericOptions,
  uniformSizeToFormValue,
} from "../../lib/format/uniform";
import { DateInput } from "../ui/date-input";

type Props = {
  defaultIssued?: boolean;
  defaultIssuedOn?: string | null;
  defaultCondition?: UniformCondition | null;
  defaultNote?: string | null;
  defaultTshirtIssued?: boolean;
  defaultTshirtSize?: number | null;
  defaultTshirtIssuedOn?: string | null;
  /** компактные классы для create-формы */
  compact?: boolean;
  fieldClassName: string;
};

function UniformSizeSelect({
  name,
  defaultValue,
  className,
  required,
}: {
  name: string;
  defaultValue?: string;
  className: string;
  required?: boolean;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} required={required} className={className}>
      <option value="">—</option>
      <optgroup label="Буквенный">
        {uniformSizeLetterOptions.map((size) => (
          <option key={size.value} value={size.value}>
            {size.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Числовой (44–70)">
        {uniformSizeNumericOptions.map((size) => (
          <option key={size.value} value={size.value}>
            {size.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function GuardUniformIssuedFields({
  defaultIssued = false,
  defaultIssuedOn = null,
  defaultCondition = null,
  defaultNote = null,
  defaultTshirtIssued = false,
  defaultTshirtSize = null,
  defaultTshirtIssuedOn = null,
  compact = false,
  fieldClassName,
}: Props) {
  const [issued, setIssued] = useState(defaultIssued);
  const [tshirtIssued, setTshirtIssued] = useState(defaultTshirtIssued);

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
            <DateInput
              required
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
      <label className="flex items-center gap-2 text-sm text-app-muted">
        <input
          type="checkbox"
          name="tshirtIssued"
          value="on"
          checked={tshirtIssued}
          onChange={(e) => {
            const next = e.target.checked;
            if (!next && tshirtIssued) {
              if (!window.confirm("Снять отметку и очистить данные выдачи футболки?")) {
                return;
              }
            }
            setTshirtIssued(next);
          }}
          className="size-4"
        />
        Выдана футболка
      </label>
      {tshirtIssued ? (
        <div className={compact ? "grid gap-2 sm:grid-cols-2" : "grid gap-4 md:grid-cols-2"}>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-app-muted font-medium">Размер</span>
            <UniformSizeSelect
              name="tshirtSize"
              required
              defaultValue={uniformSizeToFormValue(defaultTshirtSize)}
              className={fieldClassName}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-app-muted font-medium">Дата выдачи</span>
            <DateInput
              required
              name="tshirtIssuedOn"
              defaultValue={defaultTshirtIssuedOn ?? ""}
              className={fieldClassName}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
