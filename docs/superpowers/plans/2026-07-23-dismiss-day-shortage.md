# Dismiss Day Hours-Shortage Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать Admin/Planner снимать `!` недобора часов на день (object+date) с общим хранением в БД; при изменении смен/плана/инцидента знак возвращается; скрытие действует в сетках и глобальном колокольчике.

**Architecture:** Чистый модуль fingerprint + фильтр shortages; таблица `schedule_day_shortage_dismissals`; repository upsert/list; POST dismiss API и фильтр в GET `/api/scheduler/shortages`; UI-кнопка рядом с `ScheduleHoursShortageIcon` + проп валидных dismissed-дат на страницах объекта/scheduler.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Vitest, `pg`, Lucide, `src/lib/design-tokens.ts`, Node `crypto.createHash("sha256")`.

## Global Constraints

- RBAC: dismiss только `schedule:write` (Administrator/Planner); Accountant читает скрытое состояние без кнопки.
- Ключ dismiss: `object_id` + `date_iso` (не per-post).
- Invalidate: смена состава смен, план/шаблон, незакрытый инцидент (через fingerprint mismatch).
- UI/цвета только через `designTokens` и существующие app-* классы.
- Не чинить формулу недобора при перекрытии СтМ/Regular — вне скоупа.
- Спека: `docs/superpowers/specs/2026-07-23-dismiss-day-shortage-design.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/db/migrations/20260723_schedule_day_shortage_dismissals.sql` | DDL таблицы |
| `src/db/schema.sql` | Зеркало DDL |
| `src/lib/scheduling/schedule-shortage-dismiss.ts` | fingerprint, isDismissValid, filterShortagesByDismissals, типы plan snapshot |
| `tests/scheduling/schedule-shortage-dismiss.test.ts` | unit fingerprint + filter |
| `src/lib/operations/schedule-shortage-dismissals-repository.ts` | list + upsert |
| `src/app/api/scheduler/dismiss-day-shortage/route.ts` | POST dismiss |
| `src/app/api/scheduler/shortages/route.ts` | фильтр валидных dismiss |
| `src/components/operations/schedule-hours-shortage-icon.tsx` | кнопка снятия |
| `src/components/operations/object-month-schedule-grid.tsx` | hide + dismiss в header/footer |
| `src/components/operations/scheduler-grid.tsx` | hide + dismiss |
| `src/components/operations/global-schedule-shortage-bell.tsx` | кнопка + refetch после dismiss |
| `src/app/objects/[id]/page.tsx` / `object-detail-view.tsx` | прокинуть dismissedDays + canDismiss |
| `src/app/scheduler/page.tsx` | то же для scheduler |

---

### Task 1: Fingerprint + filter (чистая логика)

**Files:**
- Create: `src/lib/scheduling/schedule-shortage-dismiss.ts`
- Create: `tests/scheduling/schedule-shortage-dismiss.test.ts`

**Interfaces:**
- Produces:
  - `ShortageDismissPlanSnapshot` — `{ regular, shiftHours, reinforcement, reinforcementShiftHours, rapidResponse, rapidResponseShiftHours, shiftLead, shiftLeadShiftHours }`
  - `ShortageDismissShiftInput` — `{ id, startsAtIso, endsAtIso, shiftKind, postId, incidentRecordedAtIso, replacedByShiftId }`
  - `buildShortageDayFingerprint(input: { shifts: ShortageDismissShiftInput[]; plan: ShortageDismissPlanSnapshot; pendingIncident: boolean }): string`
  - `isShortageDismissValid(storedFingerprint: string, currentFingerprint: string): boolean`
  - `filterShortagesByDismissals(shortages: ScheduleObjectShortage[], validDismissKeys: ReadonlySet<string>): ScheduleObjectShortage[]` где key = `${objectId}|${dateIso}`
  - `shortageDismissKey(objectId: string, dateIso: string): string`

- [ ] **Step 1: Write failing tests**

```ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  buildShortageDayFingerprint,
  filterShortagesByDismissals,
  isShortageDismissValid,
  shortageDismissKey,
  type ShortageDismissPlanSnapshot,
  type ShortageDismissShiftInput,
} from "../../src/lib/scheduling/schedule-shortage-dismiss";
import type { ScheduleObjectShortage } from "../../src/lib/scheduling/schedule-shortage";

const plan: ShortageDismissPlanSnapshot = {
  regular: 2,
  shiftHours: 12,
  reinforcement: 0,
  reinforcementShiftHours: 24,
  rapidResponse: 0,
  rapidResponseShiftHours: 24,
  shiftLead: 1,
  shiftLeadShiftHours: 12,
};

const shiftA: ShortageDismissShiftInput = {
  id: "s-b",
  startsAtIso: "2026-07-20T08:00:00.000+10:00",
  endsAtIso: "2026-07-20T20:00:00.000+10:00",
  shiftKind: "Regular",
  postId: null,
  incidentRecordedAtIso: null,
  replacedByShiftId: null,
};

const shiftB: ShortageDismissShiftInput = {
  id: "s-a",
  startsAtIso: "2026-07-20T08:00:00.000+10:00",
  endsAtIso: "2026-07-20T20:00:00.000+10:00",
  shiftKind: "ShiftLead",
  postId: null,
  incidentRecordedAtIso: null,
  replacedByShiftId: null,
};

describe("buildShortageDayFingerprint", () => {
  it("is stable regardless of shift input order", () => {
    const a = buildShortageDayFingerprint({
      shifts: [shiftA, shiftB],
      plan,
      pendingIncident: false,
    });
    const b = buildShortageDayFingerprint({
      shifts: [shiftB, shiftA],
      plan,
      pendingIncident: false,
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when a shift is removed", () => {
    const full = buildShortageDayFingerprint({
      shifts: [shiftA, shiftB],
      plan,
      pendingIncident: false,
    });
    const partial = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: false,
    });
    expect(full).not.toBe(partial);
  });

  it("changes when plan norms change", () => {
    const base = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: false,
    });
    const changed = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan: { ...plan, regular: 3 },
      pendingIncident: false,
    });
    expect(base).not.toBe(changed);
  });

  it("changes when pendingIncident flips", () => {
    const no = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: false,
    });
    const yes = buildShortageDayFingerprint({
      shifts: [shiftA],
      plan,
      pendingIncident: true,
    });
    expect(no).not.toBe(yes);
  });
});

describe("filterShortagesByDismissals", () => {
  const shortages: ScheduleObjectShortage[] = [
    {
      objectId: "o1",
      objectName: "Объект",
      totalHoursShort: 10,
      totalReinforcementShort: 0,
      totalRapidResponseShort: 0,
      totalShiftLeadShort: 0,
      days: [
        {
          dateIso: "2026-07-20",
          dayLabel: "Пн, 20",
          hoursShort: 10,
          reinforcementShort: 0,
          rapidResponseShort: 0,
          shiftLeadShort: 0,
          expectedHoursRegular: 24,
          regularDayHours: 14,
        },
        {
          dateIso: "2026-07-21",
          dayLabel: "Вт, 21",
          hoursShort: 5,
          reinforcementShort: 0,
          rapidResponseShort: 0,
          shiftLeadShort: 0,
          expectedHoursRegular: 24,
          regularDayHours: 19,
        },
      ],
    },
  ];

  it("removes dismissed days and drops empty objects; recalculates totals", () => {
    const filtered = filterShortagesByDismissals(
      shortages,
      new Set([shortageDismissKey("o1", "2026-07-20")]),
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.days.map((d) => d.dateIso)).toEqual(["2026-07-21"]);
    expect(filtered[0]?.totalHoursShort).toBe(5);
  });

  it("drops object when all days dismissed", () => {
    const filtered = filterShortagesByDismissals(
      shortages,
      new Set([
        shortageDismissKey("o1", "2026-07-20"),
        shortageDismissKey("o1", "2026-07-21"),
      ]),
    );
    expect(filtered).toEqual([]);
  });

  it("isShortageDismissValid only on exact match", () => {
    expect(isShortageDismissValid("abc", "abc")).toBe(true);
    expect(isShortageDismissValid("abc", "abd")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- tests/scheduling/schedule-shortage-dismiss.test.ts`

Expected: FAIL (module not found / exports missing)

- [ ] **Step 3: Implement module**

```ts
import { createHash } from "node:crypto";
import type { ScheduleObjectShortage } from "./schedule-shortage";

export type ShortageDismissPlanSnapshot = {
  regular: number;
  shiftHours: number;
  reinforcement: number;
  reinforcementShiftHours: number;
  rapidResponse: number;
  rapidResponseShiftHours: number;
  shiftLead: number;
  shiftLeadShiftHours: number;
};

export type ShortageDismissShiftInput = {
  id: string;
  startsAtIso: string;
  endsAtIso: string;
  shiftKind: string;
  postId: string | null;
  incidentRecordedAtIso: string | null;
  replacedByShiftId: string | null;
};

export function shortageDismissKey(objectId: string, dateIso: string): string {
  return `${objectId}|${dateIso}`;
}

export function buildShortageDayFingerprint(input: {
  shifts: ReadonlyArray<ShortageDismissShiftInput>;
  plan: ShortageDismissPlanSnapshot;
  pendingIncident: boolean;
}): string {
  const shiftLines = [...input.shifts]
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(
      (s) =>
        [
          s.id,
          s.startsAtIso,
          s.endsAtIso,
          s.shiftKind,
          s.postId ?? "",
          s.incidentRecordedAtIso ?? "",
          s.replacedByShiftId ?? "",
        ].join("|"),
    )
    .join("\n");

  const { plan } = input;
  const planLine = [
    plan.regular,
    plan.shiftHours,
    plan.reinforcement,
    plan.reinforcementShiftHours,
    plan.rapidResponse,
    plan.rapidResponseShiftHours,
    plan.shiftLead,
    plan.shiftLeadShiftHours,
  ].join("|");

  const canonical = `${shiftLines}\nPLAN:${planLine}\npendingIncident=${input.pendingIncident ? "1" : "0"}`;
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export function isShortageDismissValid(
  storedFingerprint: string,
  currentFingerprint: string,
): boolean {
  return storedFingerprint === currentFingerprint;
}

export function filterShortagesByDismissals(
  shortages: ReadonlyArray<ScheduleObjectShortage>,
  validDismissKeys: ReadonlySet<string>,
): ScheduleObjectShortage[] {
  const out: ScheduleObjectShortage[] = [];
  for (const obj of shortages) {
    const days = obj.days.filter(
      (d) => !validDismissKeys.has(shortageDismissKey(obj.objectId, d.dateIso)),
    );
    if (days.length === 0) continue;
    out.push({
      ...obj,
      days,
      totalHoursShort: days.reduce((s, d) => s + d.hoursShort, 0),
      totalReinforcementShort: days.reduce((s, d) => s + d.reinforcementShort, 0),
      totalRapidResponseShort: days.reduce((s, d) => s + d.rapidResponseShort, 0),
      totalShiftLeadShort: days.reduce((s, d) => s + d.shiftLeadShort, 0),
    });
  }
  return out;
}

/** Хелпер для UI: Set dateIso с валидным dismiss для одного объекта. */
export function validDismissedDateIsosForObject(
  objectId: string,
  stored: ReadonlyMap<string, string>, // key = shortageDismissKey → fingerprint
  currentByDateIso: ReadonlyMap<string, string>, // dateIso → current fingerprint
): Set<string> {
  const result = new Set<string>();
  for (const [dateIso, currentFp] of currentByDateIso) {
    const key = shortageDismissKey(objectId, dateIso);
    const storedFp = stored.get(key);
    if (storedFp && isShortageDismissValid(storedFp, currentFp)) {
      result.add(dateIso);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/scheduling/schedule-shortage-dismiss.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/scheduling/schedule-shortage-dismiss.ts tests/scheduling/schedule-shortage-dismiss.test.ts
git commit -m "feat: shortage dismiss fingerprint and filter"
```

---

### Task 2: Migration + repository

**Files:**
- Create: `src/db/migrations/20260723_schedule_day_shortage_dismissals.sql`
- Modify: `src/db/schema.sql` (append CREATE TABLE block near other schedule tables)
- Create: `src/lib/operations/schedule-shortage-dismissals-repository.ts`

**Interfaces:**
- Consumes: `query` from `../db/pool`
- Produces:
  - `listShortageDismissals(objectIds: string[], dateFromIso: string, dateToIso: string): Promise<Map<string, string>>` — key `objectId|dateIso` → fingerprint
  - `upsertShortageDismissal(input: { objectId: string; dateIso: string; fingerprint: string; dismissedBy: string }): Promise<void>`

- [ ] **Step 1: Migration SQL**

```sql
CREATE TABLE IF NOT EXISTS schedule_day_shortage_dismissals (
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  date_iso date NOT NULL,
  fingerprint text NOT NULL,
  dismissed_by text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, date_iso)
);

CREATE INDEX IF NOT EXISTS schedule_day_shortage_dismissals_date_idx
  ON schedule_day_shortage_dismissals (date_iso);
```

Зеркало того же блока в конец `src/db/schema.sql` (или рядом с shifts-related ALTER).

- [ ] **Step 2: Repository**

```ts
import { query } from "../db/pool";
import { shortageDismissKey } from "../scheduling/schedule-shortage-dismiss";

export async function listShortageDismissals(
  objectIds: string[],
  dateFromIso: string,
  dateToIso: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (objectIds.length === 0) return map;

  const rows = await query<{
    object_id: string;
    date_iso: string; // pg date → string YYYY-MM-DD
    fingerprint: string;
  }>(
    `
      SELECT object_id::text, date_iso::text, fingerprint
      FROM schedule_day_shortage_dismissals
      WHERE object_id = ANY($1::uuid[])
        AND date_iso >= $2::date
        AND date_iso <= $3::date
    `,
    [objectIds, dateFromIso, dateToIso],
  );

  for (const row of rows) {
    // date_iso::text из PG может быть YYYY-MM-DD
    const iso = row.date_iso.slice(0, 10);
    map.set(shortageDismissKey(row.object_id, iso), row.fingerprint);
  }
  return map;
}

export async function upsertShortageDismissal(input: {
  objectId: string;
  dateIso: string;
  fingerprint: string;
  dismissedBy: string;
}): Promise<void> {
  await query(
    `
      INSERT INTO schedule_day_shortage_dismissals
        (object_id, date_iso, fingerprint, dismissed_by, dismissed_at)
      VALUES ($1::uuid, $2::date, $3, $4, now())
      ON CONFLICT (object_id, date_iso) DO UPDATE SET
        fingerprint = EXCLUDED.fingerprint,
        dismissed_by = EXCLUDED.dismissed_by,
        dismissed_at = now()
    `,
    [input.objectId, input.dateIso, input.fingerprint, input.dismissedBy],
  );
}
```

Если таблица ещё не задеплоена на каком-то стенде — обернуть list в try/catch `isUndefinedColumnOrTableError` → пустой Map (как в других repo). Upsert пусть бросает явную ошибку про миграцию.

- [ ] **Step 3: Apply locally (optional smoke)**

Run: `npm run db:migrate`

Expected: migration applied without error

- [ ] **Step 4: Commit**

```bash
git add src/db/migrations/20260723_schedule_day_shortage_dismissals.sql src/db/schema.sql src/lib/operations/schedule-shortage-dismissals-repository.ts
git commit -m "db: schedule day shortage dismissals table and repo"
```

---

### Task 3: Shared server helper — compute current fingerprints for week

**Files:**
- Create: `src/lib/scheduling/build-shortage-dismiss-state.ts`

**Interfaces:**
- Consumes: `buildShortageDayFingerprint`, `shiftBelongsToOperationalDayColumn`, `ExpectedShifts`, `Shift`, `ScheduleObjectRef`, `isShortageDismissValid`, `shortageDismissKey`
- Produces:
  - `aggregatePlanSnapshot(plans: ReadonlyArray<ExpectedShifts | undefined>): ShortageDismissPlanSnapshot` — суммирует counts по постам; hours берёт max/одинаковый template hour (если несколько постов: `regular +=`, hours = first non-zero или max)
  - `shiftToDismissInput(s: Shift): ShortageDismissShiftInput` — ISO через `startsAt.toISOString()` / ends; incident via `incidentRecordedAt?.toISOString() ?? null`
  - `buildValidShortageDismissKeySet(args: { objects; shifts; expectedByObjectDay; weekDayIsos; storedDismissals: Map<string,string>; pendingIncidentKeys: ReadonlySet<string> /* objectId|dateIso */ }): Set<string>`

Агрегация плана для мульти-пост: для каждого дня суммировать `regular/reinforcement/rapidResponse/shiftLead` по всем post-планам объекта; для `*ShiftHours` брать значение из первого ненулевого плана дня (как в шапке объекта — если в UI агрегат иначе, выровнять с `dayHasCurrentWeekHoursShortage`: OR по постам для shortage, но fingerprint должен включать **все** посты дня).

Практичное правило для fingerprint plan на object+day:

```ts
export function aggregatePlanSnapshot(
  plans: ReadonlyArray<ExpectedShifts | undefined>,
): ShortageDismissPlanSnapshot {
  const acc: ShortageDismissPlanSnapshot = {
    regular: 0,
    shiftHours: 24,
    reinforcement: 0,
    reinforcementShiftHours: 24,
    rapidResponse: 0,
    rapidResponseShiftHours: 24,
    shiftLead: 0,
    shiftLeadShiftHours: 24,
  };
  let gotHours = false;
  for (const p of plans) {
    if (!p) continue;
    acc.regular += p.regular;
    acc.reinforcement += p.reinforcement;
    acc.rapidResponse += p.rapidResponse;
    acc.shiftLead += p.shiftLead;
    if (!gotHours) {
      acc.shiftHours = p.shiftHours;
      acc.reinforcementShiftHours = p.reinforcementShiftHours;
      acc.rapidResponseShiftHours = p.rapidResponseShiftHours;
      acc.shiftLeadShiftHours = p.shiftLeadShiftHours;
      gotHours = true;
    }
  }
  return acc;
}
```

Для объекта без постов: один план `expectedByObjectDay[objectId][dateIso]`.

Для pending incident: смена с `incidentRecordedAt != null && replacedByShiftId == null` на этом object+operational day → `pendingIncident=true` (или Set ключей из `listPendingIncidentReplacements` отфильтрованный по дате — предпочтительно вычислять из тех же shifts, что уже в памяти).

- [ ] **Step 1: Implement `build-shortage-dismiss-state.ts`** as above; export `buildValidShortageDismissKeySet`.

- [ ] **Step 2: Unit-smoke** — optional tiny test that valid set contains key when stored fp matches; skip if covered via Task 1 filter + manual review.

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduling/build-shortage-dismiss-state.ts
git commit -m "feat: build valid shortage dismiss key set"
```

---

### Task 4: POST dismiss API + filter GET shortages

**Files:**
- Create: `src/app/api/scheduler/dismiss-day-shortage/route.ts`
- Modify: `src/app/api/scheduler/shortages/route.ts`

**Interfaces:**
- Consumes: repository, `buildShortageDayFingerprint` / `buildValidShortageDismissKeySet`, `assertPermission("schedule:write"|"schedule:read")`, `revalidateTag("global-alerts"|"scheduler")`
- Body POST: `{ objectId: uuid, dateIso: YYYY-MM-DD }`

- [ ] **Step 1: POST route** (mirror `dismiss-incident-alert/route.ts`)

```ts
import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { assertPermission, ForbiddenError } from "../../../../lib/auth/rbac";
import { requireSession } from "../../../../lib/auth/session";
import { upsertShortageDismissal } from "../../../../lib/operations/schedule-shortage-dismissals-repository";
// load shifts+plan for object+day via getSchedulerSnapshot or focused query for that week Monday containing dateIso
// compute fingerprint with buildShortageDayFingerprint
// upsertShortageDismissal({ objectId, dateIso, fingerprint, dismissedBy: session.user.id })

const bodySchema = z.object({
  objectId: z.string().uuid(),
  dateIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
```

Конкретно для fingerprint в POST:
1. `weekStart = getMondayWeekStartKhabarovsk(parse dateIso in KH zone)` — использовать существующий helper из `display-date.ts` (если принимает Date).
2. `getSchedulerSnapshot(weekStart)` или узкий SELECT смен объекта за ±2 дня.
3. Templates → expected for that day.
4. Filter shifts belonging to operational day `dateIso`.
5. `pendingIncident` из этих shifts.
6. Upsert.

Ответ: `{ ok: true }` / 403 / 400.

- [ ] **Step 2: Patch GET shortages**

После `computeScheduleShortages(...)`:

```ts
const stored = await listShortageDismissals(objectIds, weekDayIsos[0]!, weekDayIsos[weekDayIsos.length - 1]!);
const validKeys = buildValidShortageDismissKeySet({
  objects: snapshot.objects,
  shifts: snapshot.shifts,
  expectedByObjectDay: expectedShiftsByObjectDay,
  weekDayIsos,
  storedDismissals: stored,
  // pending derived inside helper from shifts
});
const shortages = filterShortagesByDismissals(rawShortages, validKeys);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/scheduler/dismiss-day-shortage/route.ts src/app/api/scheduler/shortages/route.ts
git commit -m "feat: dismiss-day-shortage API and filter shortages feed"
```

---

### Task 5: UI icon + dismiss button

**Files:**
- Modify: `src/components/operations/schedule-hours-shortage-icon.tsx`

**Interfaces:**
- Props extension:
  - `canDismiss?: boolean`
  - `onDismiss?: () => void`
  - `dismissing?: boolean`

- [ ] **Step 1: Update component**

```tsx
import { AlertCircle, X } from "lucide-react";
import { designTokens } from "../../lib/design-tokens";

type ScheduleHoursShortageIconProps = {
  title?: string;
  className?: string;
  canDismiss?: boolean;
  onDismiss?: () => void;
  dismissing?: boolean;
};

export function ScheduleHoursShortageIcon({
  title = "Недобор часов до нормы на этой неделе",
  className = "",
  canDismiss = false,
  onDismiss,
  dismissing = false,
}: ScheduleHoursShortageIconProps) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`}>
      <span
        className="schedule-shortage-blink inline-flex items-center justify-center"
        style={{ color: designTokens.color.accent.danger }}
        title={title}
        aria-label={title}
      >
        <AlertCircle className="size-3.5" strokeWidth={2.5} aria-hidden />
      </span>
      {canDismiss && onDismiss ? (
        <button
          type="button"
          className="inline-flex size-4 items-center justify-center rounded-sm border border-app-border bg-app-surface text-app-muted outline-none hover:border-accent-danger/40 hover:text-accent-danger focus-visible:ring-2 focus-visible:ring-accent-danger/40 disabled:opacity-50"
          style={{ color: dismissing ? designTokens.color.textMuted : undefined }}
          title="Снять предупреждение на этот день"
          aria-label="Снять предупреждение на этот день"
          disabled={dismissing}
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
        >
          <X className="size-3" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}
    </span>
  );
}
```

Не ломать существующие вызовы без новых props.

- [ ] **Step 2: Commit**

```bash
git add src/components/operations/schedule-hours-shortage-icon.tsx
git commit -m "feat: dismiss control on shortage icon"
```

---

### Task 6: Wire object month grid + scheduler grid

**Files:**
- Modify: `src/components/operations/object-month-schedule-grid.tsx`
- Modify: `src/components/operations/object-detail-view.tsx`
- Modify: `src/app/objects/[id]/page.tsx` (если props грузятся там)
- Modify: `src/components/operations/scheduler-grid.tsx`
- Modify: `src/app/scheduler/page.tsx`

**Interfaces:**
- New props on grids:
  - `dismissedShortageDateIsos?: ReadonlySet<string> | string[]` (для object page — даты этого объекта)
  - `onDismissShortageDay?: (dateIso: string) => void` **или** внутренний fetch в клиенте с `objectId`
  - `canDismissShortage?: boolean` (= `canWrite`)

Предпочтительная клиентская функция (общая):

```ts
async function dismissDayShortage(objectId: string, dateIso: string): Promise<void> {
  const res = await fetch("/api/scheduler/dismiss-day-shortage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectId, dateIso }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) throw new Error(body.error ?? "Не удалось снять предупреждение");
}
```

В `object-month-schedule-grid.tsx`:
1. Props: `objectId` уже есть; добавить `dismissedShortageDateIsos: Set<string>`, `canDismissShortage`.
2. Local state `optimisticDismissed: Set<string>` merge с props.
3. `showShortageIcon = dayHasCurrentWeekHoursShortage(d) && !dismissedSet.has(dateIso)`.
4. Icon: `canDismiss={canDismissShortage}` + `onDismiss` → optimistic add + POST + toast on error + router.refresh().

В `scheduler-grid.tsx` то же для дней текущего объекта/недели где сейчас рисуется `ScheduleHoursShortageIcon` (строки ~1724, ~1852, ~2057) — ключ objectId из выбранного объекта.

Серверный load на object page / scheduler page:
1. `listShortageDismissals([objectId], weekStart, weekEnd)`
2. `buildValidShortageDismissKeySet(...)` → Set dateIso
3. Pass as `dismissedShortageDateIsos={Array.from(set)}`

- [ ] **Step 1: Wire object month schedule**
- [ ] **Step 2: Wire scheduler grid**
- [ ] **Step 3: Manual lint** `npx tsc --noEmit` on touched files / `npm run lint`
- [ ] **Step 4: Commit**

```bash
git add src/components/operations/object-month-schedule-grid.tsx src/components/operations/object-detail-view.tsx src/app/objects/[id]/page.tsx src/components/operations/scheduler-grid.tsx src/app/scheduler/page.tsx
git commit -m "feat: wire shortage dismiss on schedule grids"
```

---

### Task 7: Global shortage bell dismiss

**Files:**
- Modify: `src/components/operations/global-schedule-shortage-bell.tsx`
- Modify: `src/components/operations/global-alerts-shell.tsx` (если нужно прокинуть `canDismiss`)

**Interfaces:**
- Props: `canDismiss?: boolean`
- На каждом дне в dropdown: кнопка X → POST `{ objectId: obj.objectId, dateIso: day.dateIso }` → убрать день из local state / refetch shortages

- [ ] **Step 1: Add dismiss button next to each day row when `canDismiss`**

После успешного POST: удалить день из локального `shortages` state (и объект, если days пуст); вызвать существующий fetch если uncontrolled.

- [ ] **Step 2: Pass `canDismiss={hasPermission(role, "schedule:write")}` from shell/layout**

- [ ] **Step 3: Commit**

```bash
git add src/components/operations/global-schedule-shortage-bell.tsx src/components/operations/global-alerts-shell.tsx
git commit -m "feat: dismiss shortage days from global bell"
```

---

### Task 8: Verification

- [ ] **Step 1: Run unit tests**

Run: `npm test -- tests/scheduling/schedule-shortage-dismiss.test.ts tests/scheduling/schedule-shortage.test.ts`

Expected: PASS

- [ ] **Step 2: Typecheck**

Run: `npm run lint`

Expected: no errors in touched files

- [ ] **Step 3: Manual checklist**
  1. Admin: день с `!` → X → `!` пропал в шапке объекта, scheduler, колокольчике.
  2. Удалить смену на этом дне → `!` вернулся.
  3. Снова снять → создать инцидент no-show → `!` вернулся.
  4. Изменить шаблон плана дня → `!` вернулся.
  5. Accountant: `!` видит, кнопки X нет; после dismiss админом — `!` скрыт.

- [ ] **Step 4: Final commit only if leftover fixes** (message: `fix: shortage dismiss edge cases`)

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| DB table shared dismiss | Task 2 |
| Fingerprint shifts+plan+incident | Task 1, 3 |
| Hide in object grid | Task 6 |
| Hide in scheduler | Task 6 |
| Hide in global bell | Task 4 filter + Task 7 UI |
| Admin/Planner only dismiss | Task 4, 5–7 |
| Return on shift/plan/incident change | Task 1 fingerprint mismatch |
| Outside scope: overlap math | not implemented |

Placeholder scan: none intentional. Types aligned on `shortageDismissKey`, `ShortageDismissPlanSnapshot`, `filterShortagesByDismissals`.
