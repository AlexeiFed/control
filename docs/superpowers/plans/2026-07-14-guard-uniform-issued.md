# Guard Uniform Issued Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить учёт выдачи формы охраннику (чекбокс + дата + состояние + примечание), отделив это от размера/роста; колонка и фильтр «Форма» в реестре = факт выдачи.

**Architecture:** Четыре колонки в `guards` + CHECK. Чистые хелперы в `lib/format/uniform.ts` (парсинг/валидация/лейблы/tooltip). Zod в `guards/actions.ts` нормализует checkbox off → null-поля. Общий клиентский блок полей `GuardUniformIssuedFields` в создании и редактировании; реестр/карточка/экспорт читают `uniformIssued*`.

**Tech Stack:** Next.js App Router, TypeScript, Zod, PostgreSQL migrations, Vitest, Tailwind + `src/lib/design-tokens.ts`.

**Spec:** `docs/superpowers/specs/2026-07-14-guard-uniform-issued-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/db/migrations/20260714_guard_uniform_issued.sql` | ADD columns + CHECK |
| `src/db/schema.sql` | зеркало колонок |
| `src/lib/format/uniform.ts` | types, labels, parse/normalize, tooltips |
| `src/lib/format/uniform.test.ts` | unit tests хелперов |
| `src/lib/operations/guards-repository.ts` | types, SELECT/INSERT/UPDATE |
| `src/app/guards/actions.ts` | zod + formData → create/update |
| `src/components/operations/guard-uniform-issued-fields.tsx` | checkbox + conditional fields + confirm |
| `src/components/operations/guard-filters.tsx` | create form |
| `src/components/operations/guard-profile-editor.tsx` | edit form |
| `src/app/guards/[guardId]/page.tsx` | read-only display |
| `src/components/operations/guard-registry-table.tsx` | column cell |
| `src/lib/guards/guard-registry-filter.ts` + test | filter by `uniformIssued` |
| `src/lib/guards/guard-registry-export.ts` + test | export columns |
| `src/lib/operations/curators-guards-link.ts` | default null fields if maps GuardListRow |

---

### Task 1: Хелперы выдачи формы (TDD)

**Files:**
- Modify: `src/lib/format/uniform.ts`
- Modify: `src/lib/format/uniform.test.ts`

- [ ] **Step 1: Написать падающие тесты**

В конец `src/lib/format/uniform.test.ts` добавить:

```ts
import {
  formatUniformConditionLabel,
  formatUniformIssuedTooltip,
  normalizeUniformIssuedFields,
  parseUniformCondition,
  type UniformCondition,
} from "./uniform";

describe("uniform issued", () => {
  it("parses condition", () => {
    expect(parseUniformCondition("new")).toBe("new");
    expect(parseUniformCondition("used")).toBe("used");
    expect(parseUniformCondition("")).toBe(null);
    expect(parseUniformCondition("bad")).toBe(null);
  });

  it("labels condition", () => {
    expect(formatUniformConditionLabel("new")).toBe("новое");
    expect(formatUniformConditionLabel("used")).toBe("б/у");
  });

  it("clears fields when not issued", () => {
    expect(
      normalizeUniformIssuedFields({
        issued: false,
        issuedOn: "2026-01-01",
        condition: "new",
        note: "x",
      }),
    ).toEqual({
      uniformIssued: false,
      uniformIssuedOn: null,
      uniformCondition: null,
      uniformNote: null,
    });
  });

  it("requires date and condition when issued", () => {
    expect(() =>
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "",
        condition: "new",
        note: "",
      }),
    ).toThrow(/дата/i);

    expect(() =>
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "2026-01-01",
        condition: null,
        note: "  ",
      }),
    ).toThrow(/состояние/i);
  });

  it("keeps optional note when issued", () => {
    expect(
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "2026-01-01",
        condition: "used" as UniformCondition,
        note: "  порвана  ",
      }),
    ).toEqual({
      uniformIssued: true,
      uniformIssuedOn: "2026-01-01",
      uniformCondition: "used",
      uniformNote: "порвана",
    });

    expect(
      normalizeUniformIssuedFields({
        issued: true,
        issuedOn: "2026-01-01",
        condition: "new",
        note: "   ",
      }).uniformNote,
    ).toBeNull();
  });

  it("builds tooltip", () => {
    expect(
      formatUniformIssuedTooltip({
        issuedOn: "2026-01-15",
        condition: "new",
        note: null,
      }),
    ).toMatch(/15\.01\.2026/);
    expect(
      formatUniformIssuedTooltip({
        issuedOn: "2026-01-15",
        condition: "new",
        note: null,
      }),
    ).toMatch(/новое/);
  });
});
```

- [ ] **Step 2: Запустить — ожидать FAIL**

```bash
npx vitest run src/lib/format/uniform.test.ts
```

Expected: FAIL — `parseUniformCondition` / `normalizeUniformIssuedFields` not exported.

- [ ] **Step 3: Реализовать хелперы**

В `src/lib/format/uniform.ts` добавить:

```ts
import { formatDisplayDateFromIso } from "./display-date";

export const UNIFORM_CONDITIONS = ["new", "used"] as const;
export type UniformCondition = (typeof UNIFORM_CONDITIONS)[number];

export const uniformConditionLabels: Record<UniformCondition, string> = {
  new: "новое",
  used: "б/у",
};

export function parseUniformCondition(raw: unknown): UniformCondition | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (s === "new" || s === "used") return s;
  return null;
}

export function formatUniformConditionLabel(condition: UniformCondition): string {
  return uniformConditionLabels[condition];
}

export type UniformIssuedNormalized = {
  uniformIssued: boolean;
  uniformIssuedOn: string | null;
  uniformCondition: UniformCondition | null;
  uniformNote: string | null;
};

export function normalizeUniformIssuedFields(input: {
  issued: boolean;
  issuedOn: string | null | undefined;
  condition: UniformCondition | null | undefined;
  note: string | null | undefined;
}): UniformIssuedNormalized {
  if (!input.issued) {
    return {
      uniformIssued: false,
      uniformIssuedOn: null,
      uniformCondition: null,
      uniformNote: null,
    };
  }
  const issuedOn = typeof input.issuedOn === "string" ? input.issuedOn.trim() : "";
  if (!issuedOn) {
    throw new Error("Укажите дату выдачи формы");
  }
  if (input.condition !== "new" && input.condition !== "used") {
    throw new Error("Укажите состояние формы");
  }
  const noteRaw = typeof input.note === "string" ? input.note.trim() : "";
  return {
    uniformIssued: true,
    uniformIssuedOn: issuedOn,
    uniformCondition: input.condition,
    uniformNote: noteRaw || null,
  };
}

export function formatUniformIssuedTooltip(input: {
  issuedOn: string;
  condition: UniformCondition;
  note?: string | null;
}): string {
  const parts = [
    `Дата: ${formatDisplayDateFromIso(input.issuedOn)}`,
    `Состояние: ${formatUniformConditionLabel(input.condition)}`,
  ];
  if (input.note) parts.push(`Примечание: ${input.note}`);
  return parts.join(", ");
}
```

Оставить `hasGuardUniform` / `formatGuardUniformTooltip` как есть (размер/рост).

- [ ] **Step 4: Запустить — ожидать PASS**

```bash
npx vitest run src/lib/format/uniform.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/format/uniform.ts src/lib/format/uniform.test.ts
git commit -m "feat: add uniform issued helpers and tests"
```

---

### Task 2: Миграция БД + schema.sql

**Files:**
- Create: `src/db/migrations/20260714_guard_uniform_issued.sql`
- Modify: `src/db/schema.sql` (после `uniform_height`)

- [ ] **Step 1: Создать миграцию**

```sql
-- Выдача формы охраннику (факт отдельно от размера/роста).
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_issued boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_issued_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_condition text;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_note text;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_condition_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_condition_check
  CHECK (uniform_condition IS NULL OR uniform_condition IN ('new', 'used'));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_issued_fields_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_issued_fields_check CHECK (
  (
    uniform_issued = false
    AND uniform_issued_on IS NULL
    AND uniform_condition IS NULL
    AND uniform_note IS NULL
  )
  OR (
    uniform_issued = true
    AND uniform_issued_on IS NOT NULL
    AND uniform_condition IS NOT NULL
  )
);
```

- [ ] **Step 2: Зеркало в schema.sql**

После строк `uniform_size` / `uniform_height` добавить те же `ADD COLUMN IF NOT EXISTS` и оба CHECK (DROP IF EXISTS + ADD), как в миграции.

- [ ] **Step 3: Применить миграцию локально**

Использовать принятый в проекте способ (например скрипт migrate / psql). Убедиться, что миграция проходит без ошибок на текущей БД.

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/20260714_guard_uniform_issued.sql src/db/schema.sql
git commit -m "db: add guard uniform issued columns"
```

---

### Task 3: Repository types + SELECT/INSERT/UPDATE

**Files:**
- Modify: `src/lib/operations/guards-repository.ts`
- Modify: `src/lib/operations/curators-guards-link.ts` (если собирает GuardListRow с defaults)

- [ ] **Step 1: Расширить типы**

В `GuardListRow`, `GuardRow` (snake), `CreateGuardInput`, `UpdateGuardProfileInput`, `GuardDetails` добавить:

```ts
// camel
uniformIssued: boolean;
uniformIssuedOn: string | null;
uniformCondition: "new" | "used" | null; // или import UniformCondition
uniformNote: string | null;

// snake в GuardRow
uniform_issued: boolean;
uniform_issued_on: string | null;
uniform_condition: string | null;
uniform_note: string | null;
```

- [ ] **Step 2: Optional-column helpers**

По аналогии с `getGuardsUniformSizeSelect`:

```ts
export async function getGuardsUniformIssuedSelect(mode: "aliased" | "plain") { ... }
// колонки: uniform_issued, uniform_issued_on, uniform_condition, uniform_note
// fallback: false / NULL AS ...
```

Либо один helper, возвращающий фрагмент SQL из 4 выражений, если `resolveGuardsOptionalColumn("uniform_issued")`.

- [ ] **Step 3: listGuards / getGuardDetails / mapGuardRow**

Включить новые поля в SELECT и mapping:

```ts
uniformIssued: row.uniform_issued ?? false,
uniformIssuedOn: row.uniform_issued_on ?? null,
uniformCondition: (row.uniform_condition as UniformCondition | null) ?? null,
uniformNote: row.uniform_note ?? null,
```

- [ ] **Step 4: createGuard / updateGuardProfile**

Когда колонка есть — писать 4 поля из `input`. Когда нет — пропускать (как size/height).

Ветки SQL с `hasContactPhone && hasUniform` расширить: если есть `uniform_issued`, включать в INSERT/UPDATE список колонок и params.

- [ ] **Step 5: Defaults в curators-guards-link и тестах fixtures**

Везде, где собирается `GuardListRow` вручную, добавить:

```ts
uniformIssued: false,
uniformIssuedOn: null,
uniformCondition: null,
uniformNote: null,
```

Исправить компиляцию `tsc` / тестов с fixtures.

- [ ] **Step 6: Commit**

```bash
git add src/lib/operations/guards-repository.ts src/lib/operations/curators-guards-link.ts
git commit -m "feat: persist guard uniform issued in repository"
```

---

### Task 4: Server actions + zod

**Files:**
- Modify: `src/app/guards/actions.ts`

- [ ] **Step 1: Парсинг formData**

В `createGuardAction` и `updateGuardProfileAction` читать:

```ts
uniformIssued: formData.get("uniformIssued") === "on",
uniformIssuedOn: formData.get("uniformIssuedOn"),
uniformCondition: formData.get("uniformCondition"),
uniformNote: formData.get("uniformNote"),
```

- [ ] **Step 2: Нормализация через хелпер**

После основного schema parse (или внутри superRefine) вызвать:

```ts
import {
  normalizeUniformIssuedFields,
  parseUniformCondition,
} from "../../lib/format/uniform";

let issuedFields;
try {
  issuedFields = normalizeUniformIssuedFields({
    issued: formData.get("uniformIssued") === "on",
    issuedOn: String(formData.get("uniformIssuedOn") ?? ""),
    condition: parseUniformCondition(formData.get("uniformCondition")),
    note: String(formData.get("uniformNote") ?? ""),
  });
} catch (e) {
  return { ok: false, error: e instanceof Error ? e.message : "Ошибка формы" };
}
```

Передать `...issuedFields` в `createGuard` / `updateGuardProfile`.

- [ ] **Step 3: Commit**

```bash
git add src/app/guards/actions.ts
git commit -m "feat: validate uniform issued in guard actions"
```

---

### Task 5: Фильтр и экспорт реестра (TDD)

**Files:**
- Modify: `src/lib/guards/guard-registry-filter.ts`
- Modify: `src/lib/guards/guard-registry-filter.test.ts`
- Modify: `src/lib/guards/guard-registry-export.ts`
- Modify: `tests/guards/guard-registry-export.test.ts` (если есть)

- [ ] **Step 1: Обновить тест фильтра**

В `row()` fixture добавить `uniformIssued: false, ...`. В тесте «filters by uniform absence»:

```ts
const guards = [
  row({ id: "1", uniformIssued: true, uniformIssuedOn: "2026-01-01", uniformCondition: "new" }),
  row({ id: "2", uniformIssued: false, uniformSize: null, uniformHeight: null }),
];
// hasUniform: "no" → только id "2"
// hasUniform: "yes" → только id "1"
```

Важно: охранник с size/height но `uniformIssued: false` при `hasUniform: "yes"` **не** попадает.

- [ ] **Step 2: FAIL → поменять filter**

```ts
import { /* remove hasGuardUniform */ } from "../format/uniform";

// было:
// const uniform = hasGuardUniform(guard.uniformSize, guard.uniformHeight);
// стало:
const uniform = guard.uniformIssued;
```

- [ ] **Step 3: Экспорт**

В `GUARD_REGISTRY_EXPORT_HEADERS` после «Авто» (или после «Рост») добавить:

```ts
"Форма выдана",
"Дата выдачи формы",
"Состояние формы",
"Примечание к форме",
```

В `buildGuardRegistryExportRow`:

```ts
guard.uniformIssued ? "да" : "нет",
guard.uniformIssued ? formatOptionalDate(guard.uniformIssuedOn) : "",
guard.uniformIssued && guard.uniformCondition
  ? formatUniformConditionLabel(guard.uniformCondition)
  : "",
guard.uniformIssued ? (guard.uniformNote ?? "") : "",
```

Обновить export test expectations.

- [ ] **Step 4: Запустить тесты**

```bash
npx vitest run src/lib/guards/guard-registry-filter.test.ts tests/guards/guard-registry-export.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/guards/guard-registry-filter.ts src/lib/guards/guard-registry-filter.test.ts \
  src/lib/guards/guard-registry-export.ts tests/guards/guard-registry-export.test.ts
git commit -m "feat: registry filter and export use uniform issued"
```

---

### Task 6: UI компонент полей выдачи

**Files:**
- Create: `src/components/operations/guard-uniform-issued-fields.tsx`

- [ ] **Step 1: Компонент**

```tsx
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
  const hadDetails =
    Boolean(defaultIssuedOn) || Boolean(defaultCondition) || Boolean(defaultNote?.trim());

  return (
    <div className={compact ? "flex flex-col gap-2 lg:col-span-2" : "md:col-span-2 flex flex-col gap-3"}>
      <label className="flex items-center gap-2 text-sm text-app-muted">
        <input
          type="checkbox"
          name="uniformIssued"
          value="on"
          checked={issued}
          onChange={(e) => {
            const next = e.target.checked;
            if (!next && (hadDetails || issued)) {
              // если уже были/есть данные — confirm
              const hasVisibleData = issued; // данные в DOM при текущем on
              if (hasVisibleData && !window.confirm("Снять отметку и очистить данные выдачи?")) {
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
```

Уточнить confirm: при снятии — если `issued === true` и (есть default* или пользователь уже мог заполнить), показывать confirm. Спека: confirm если уже есть дата/состояние/примечание; если данных не было — без confirm. Реализация: при uncheck, если `hadDetails ||` (поля в DOM с non-empty) — confirm. Проще и по спеке: confirm только если `hadDetails || issued` был true с момента открытия с defaults — минимум `hadDetails`; дополнительно если пользователь включил, заполнил, снял — читать значения из form не обязательно: confirm всегда при uncheck когда `issued` уже true (пользователь мог заполнить). **Итог по спеке:** confirm если были сохранённые данные ИЛИ чекбокс уже был on (безопаснее = confirm при любом uncheck с `issued===true`).

- [ ] **Step 2: Commit**

```bash
git add src/components/operations/guard-uniform-issued-fields.tsx
git commit -m "feat: add GuardUniformIssuedFields UI"
```

---

### Task 7: Встроить в create + profile editor + карточку + реестр

**Files:**
- Modify: `src/components/operations/guard-filters.tsx`
- Modify: `src/components/operations/guard-profile-editor.tsx`
- Modify: `src/app/guards/[guardId]/page.tsx`
- Modify: `src/components/operations/guard-registry-table.tsx`

- [ ] **Step 1: Create form (`guard-filters.tsx`)**

После полей размер/рост вставить:

```tsx
<GuardUniformIssuedFields
  compact
  fieldClassName="h-8 rounded-button border border-app-border bg-app-bg px-2 text-sm outline-none focus:border-accent-primary"
/>
```

- [ ] **Step 2: Profile editor**

После размер/рост:

```tsx
<GuardUniformIssuedFields
  defaultIssued={guard.uniformIssued}
  defaultIssuedOn={guard.uniformIssuedOn}
  defaultCondition={guard.uniformCondition}
  defaultNote={guard.uniformNote}
  fieldClassName={fieldClass}
/>
```

- [ ] **Step 3: Карточка просмотра**

Заменить блок «Форма одежды» на два:

1. Размер/рост (если есть — показать, иначе «—»)
2. Форма выдана: Нет / Да + дата + состояние + примечание

```tsx
<span className="text-app-muted">Форма выдана:</span>
<span className="font-semibold text-app-text">
  {guard.uniformIssued ? (
    <>
      Да
      {guard.uniformIssuedOn ? ` · ${formatDisplayDateFromIso(guard.uniformIssuedOn)}` : ""}
      {guard.uniformCondition
        ? ` · ${formatUniformConditionLabel(guard.uniformCondition)}`
        : ""}
      {guard.uniformNote ? ` · ${guard.uniformNote}` : ""}
    </>
  ) : (
    "Нет"
  )}
</span>
```

- [ ] **Step 4: Колонка реестра**

```tsx
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
```

- [ ] **Step 5: Ручная проверка**

- Создать охранника с галочкой без даты → ошибка сервера/браузера
- С галочкой + дата + б/у → сохраняется, в таблице «да», tooltip
- Снять галочку → confirm → после save «нет», поля null
- Фильтр Форма=нет скрывает выданных

- [ ] **Step 6: Commit**

```bash
git add src/components/operations/guard-filters.tsx \
  src/components/operations/guard-profile-editor.tsx \
  src/app/guards/\[guardId\]/page.tsx \
  src/components/operations/guard-registry-table.tsx
git commit -m "feat: wire uniform issued UI across guards"
```

---

### Task 8: Финальная верификация

- [ ] **Step 1: Тесты**

```bash
npx vitest run src/lib/format/uniform.test.ts \
  src/lib/guards/guard-registry-filter.test.ts \
  tests/guards/guard-registry-export.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Typecheck затронутых зон**

```bash
npx tsc --noEmit
```

Починить ошибки fixtures `GuardListRow` без новых полей.

- [ ] **Step 3: Commit fixups если были**

```bash
git add -u
git commit -m "fix: complete uniform issued type fixtures"
```

(только если есть изменения)

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Колонки + CHECK | Task 2 |
| Размер/рост отдельно | Task 7 (не трогаем логику size) |
| Checkbox + дата/состояние/примечание | Task 6–7 |
| Дата+состояние required, note optional | Task 1, 4 |
| Confirm + clear on uncheck | Task 6 + server Task 4 |
| Карточка просмотр/редакт | Task 7 |
| Реестр колонка/фильтр/экспорт/create | Task 5, 7 |
| Existing data = not issued | Task 2 DEFAULT false |
| RBAC unchanged | Task 4 (тот же assertPermission) |
