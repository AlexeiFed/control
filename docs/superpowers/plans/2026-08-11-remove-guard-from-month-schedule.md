# Remove Guard From Month Schedule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Иконка удаления в колонке «Охранник» месячной сетки убирает охранника из графика выбранного месяца: удаляет его смены на объекте за месяц, чистит monthly staff, пересчитывает табель/недоборы без ручного F5; другие месяцы и `guard_object_assignments` не трогает.

**Architecture:** Server action + repository-транзакция (delete shifts с логикой `replaced_by` + delete `object_monthly_post_guards`). UI в `object-month-schedule-grid.tsx`: Trash2 + confirm + toast + `router.refresh()` + shortage/incident refresh events. Границы месяца — тот же `getMonthRangeKhabarovsk`, что у списка смен объекта.

**Tech Stack:** Next.js App Router, TypeScript, Zod, Vitest, `pg`, Lucide, `designTokens`, существующий `revalidateAfterShiftMutation`.

## Global Constraints

- RBAC: только `Administrator` / `Planner` (`schedule:write` + objects manage как у соседних schedule mutations).
- Scope удаления смен: `objectId` + `guardId` + Khabarovsk month `[start, end)`.
- Не трогать `guard_object_assignments`.
- Не переназначать смены другому охраннику.
- UI обновление: `router.refresh()` + `SCHEDULE_SHORTAGE_REFRESH_EVENT` + `dispatchIncidentReplacementsRefresh()` — без ручного F5.
- UI/цвета через `designTokens` / app-* классы.
- Спека: `docs/superpowers/specs/2026-08-11-remove-guard-from-month-schedule-design.md`.
- Git commit только если пользователь явно попросил.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/operations/scheduler-repository.ts` | export month range; `removeGuardFromObjectMonthSchedule` |
| `src/lib/operations/object-monthly-post-guards-repository.ts` | `deleteGuardFromObjectMonthStaff` |
| `src/app/objects/actions.ts` | `removeGuardFromObjectMonthScheduleAction` |
| `src/components/operations/object-month-schedule-grid.tsx` | Trash2 UI + confirm + client refresh |
| `tests/scheduling/month-range-khabarovsk.test.ts` | границы месяца не задевают соседний |
| `tests/scheduling/remove-guard-month-schedule.test.ts` | pure helper порядка удаления replacement-смен (если вынесен) |

---

### Task 1: Month range export + unit test

**Files:**
- Modify: `src/lib/operations/scheduler-repository.ts` — export `getMonthRangeKhabarovsk`
- Create: `tests/scheduling/month-range-khabarovsk.test.ts`

**Interfaces:**
- Produces: `getMonthRangeKhabarovsk(year: number, monthIndex0: number): { start: string; end: string }`
  - `start` = `{YYYY}-{MM}-01T00:00:00+10:00`
  - `end` = first day of next month `T00:00:00+10:00`

- [x] **Step 1: Write failing test**

```ts
import { describe, expect, it } from "vitest";
import { getMonthRangeKhabarovsk } from "../../src/lib/operations/scheduler-repository";

describe("getMonthRangeKhabarovsk", () => {
  it("август 2026: [2026-08-01+10, 2026-09-01+10)", () => {
    expect(getMonthRangeKhabarovsk(2026, 7)).toEqual({
      start: "2026-08-01T00:00:00+10:00",
      end: "2026-09-01T00:00:00+10:00",
    });
  });

  it("декабрь → январь следующего года", () => {
    expect(getMonthRangeKhabarovsk(2026, 11)).toEqual({
      start: "2026-12-01T00:00:00+10:00",
      end: "2027-01-01T00:00:00+10:00",
    });
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (not exported)**

Run: `npx vitest run tests/scheduling/month-range-khabarovsk.test.ts`
Expected: FAIL import / not exported

- [ ] **Step 3: Export function**

В `scheduler-repository.ts` заменить `function getMonthRangeKhabarovsk` на `export function getMonthRangeKhabarovsk` (тело не менять).

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/scheduling/month-range-khabarovsk.test.ts`
Expected: PASS

---

### Task 2: Repository — remove guard from month

**Files:**
- Modify: `src/lib/operations/object-monthly-post-guards-repository.ts`
- Modify: `src/lib/operations/scheduler-repository.ts`

**Interfaces:**
- Consumes: `getMonthRangeKhabarovsk`, existing `tableColumnExists`, `getDbPool`
- Produces:
  - `deleteGuardFromObjectMonthStaff(objectId: string, guardId: string, month: string): Promise<void>`
  - `removeGuardFromObjectMonthSchedule(objectId: string, guardId: string, year: number, monthIndex0: number): Promise<{ deletedShifts: number }>`

- [ ] **Step 1: Staff delete helper**

В `object-monthly-post-guards-repository.ts` добавить:

```ts
export async function deleteGuardFromObjectMonthStaff(
  objectId: string,
  guardId: string,
  month: string,
): Promise<void> {
  await query(
    `DELETE FROM object_monthly_post_guards
     WHERE object_id = $1 AND guard_id = $2 AND month = $3`,
    [objectId, guardId, month],
  );
}
```

- [ ] **Step 2: Bulk remove in one DB transaction**

В `scheduler-repository.ts` добавить `removeGuardFromObjectMonthSchedule`:

Логика (одна транзакция на `pool.connect()`):

1. `{ start, end } = getMonthRangeKhabarovsk(year, monthIndex0)`
2. `month = YYYY-MM` из year/monthIndex0
3. `SELECT id, replaced_by_shift_id FROM shifts WHERE object_id=$1 AND guard_id=$2 AND ends_at > $3 AND starts_at < $4 FOR UPDATE`
   - overlap тот же, что `listScheduledGuardsByObjectForLocalMonth`: `ends_at > start AND starts_at < end`
4. Для каждой найденной смены — та же семантика, что `deleteShiftById`:
   - если колонка `replaced_by_shift_id` есть:
     - `UPDATE shifts SET replaced_by_shift_id = NULL WHERE replaced_by_shift_id = shift.id`
     - если у смены есть `replaced_by_shift_id`:
       - обнулить ссылки на replacement
       - `DELETE FROM shifts WHERE id = replacementId`
     - `DELETE FROM shifts WHERE id = shift.id`
   - иначе просто `DELETE FROM shifts WHERE id = ANY(...)`
5. Важно: итерировать осторожно — если replacement уже удалён как часть другой строки, не падать; либо сначала собрать все id (основные + replacements), обнулить все `replaced_by_shift_id` ссылающиеся на них, затем `DELETE FROM shifts WHERE id = ANY($ids)`.
6. **Предпочтительный порядок (меньше гонок):**
   ```
   ids = selected shift ids
   replacementIds = non-null replaced_by from those rows
   allIds = unique(ids ∪ replacementIds)
   UPDATE shifts SET replaced_by_shift_id = NULL WHERE replaced_by_shift_id = ANY(allIds)
   DELETE FROM shifts WHERE id = ANY(allIds)
   ```
7. Вызвать `deleteGuardFromObjectMonthStaff(objectId, guardId, month)` **в той же транзакции** через `client.query` (не через отдельный `query()`, чтобы не выйти из tx). Либо инлайн SQL DELETE staff.
8. COMMIT; return `{ deletedShifts: ids.length }` (число исходных смен охранника, не включая auto-deleted replacements — или считать все удалённые; в toast лучше «удалено N смен охранника» = `ids.length`).

Не вызывать `deleteShiftById` в цикле снаружи транзакции — это N отдельных BEGIN/COMMIT.

- [ ] **Step 3: Smoke-check types**

Run: `npx tsc --noEmit -p tsconfig.json` (или проектный script typecheck, если есть)
Expected: no errors on new signatures

---

### Task 3: Server action

**Files:**
- Modify: `src/app/objects/actions.ts`

**Interfaces:**
- Consumes: `removeGuardFromObjectMonthSchedule`
- Produces: `removeGuardFromObjectMonthScheduleAction(formData: FormData): Promise<{ ok: true; deletedShifts: number } | { ok: false; error: string }>`

- [ ] **Step 1: Schema + action**

```ts
const removeGuardFromObjectMonthScheduleSchema = z.object({
  objectId: z.string().uuid(),
  guardId: z.string().uuid(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

export async function removeGuardFromObjectMonthScheduleAction(formData: FormData) {
  const session = await requireSession();
  assertPermission(session.user.role, "schedule:write");
  if (session.user.role !== "Administrator" && session.user.role !== "Planner") {
    return { ok: false as const, error: "Недостаточно прав" };
  }

  let input: z.infer<typeof removeGuardFromObjectMonthScheduleSchema>;
  try {
    input = removeGuardFromObjectMonthScheduleSchema.parse({
      objectId: formData.get("objectId"),
      guardId: formData.get("guardId"),
      month: formData.get("month"),
    });
  } catch {
    return { ok: false as const, error: "Некорректные параметры" };
  }

  const [y, m] = input.month.split("-").map(Number);
  const year = y!;
  const monthIndex0 = m! - 1;

  try {
    const { deletedShifts } = await removeGuardFromObjectMonthSchedule(
      input.objectId,
      input.guardId,
      year,
      monthIndex0,
    );
    revalidateAfterShiftMutation([
      "/scheduler",
      "/admin/curators",
      "/accounting/timesheet",
      "/dashboard",
      "/",
      `/objects/${input.objectId}`,
    ]);
    return { ok: true as const, deletedShifts };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Не удалось убрать охранника из графика",
    };
  }
}
```

Импорты: `removeGuardFromObjectMonthSchedule` из scheduler-repository; `revalidateAfterShiftMutation` из `../../lib/scheduling/revalidate-after-mutation` (как в scheduler/actions).

- [ ] **Step 2: Typecheck action file**

Run: `npx tsc --noEmit -p tsconfig.json`  
Expected: PASS for new action

---

### Task 4: UI — Trash2 in guard column

**Files:**
- Modify: `src/components/operations/object-month-schedule-grid.tsx`

**Interfaces:**
- Consumes: `removeGuardFromObjectMonthScheduleAction`
- Client side-effects after success: toast, shortage event, incident refresh, `router.refresh()`

- [ ] **Step 1: Imports + pending state**

```ts
import { removeGuardFromObjectMonthScheduleAction } from "../../app/objects/actions";
import { dispatchIncidentReplacementsRefresh } from "./global-incident-replacements-banner";
// SCHEDULE_SHORTAGE_REFRESH_EVENT уже импортирован
```

State: `const [removingGuardId, setRemovingGuardId] = useState<string | null>(null);`

- [ ] **Step 2: Handler**

```ts
async function removeGuardFromMonth(sg: ScheduleGridGuardRow) {
  if (!canWrite || removingGuardId) return;
  const monthStr = `${viewYear}-${String(viewMonth0 + 1).padStart(2, "0")}`;
  const shiftCount = monthShifts.filter((s) => s.guardId === sg.guardId).length;
  const ok = window.confirm(
    `Убрать «${sg.displayName}» из графика за ${monthLabel}?\n\n` +
      `Будет удалено ${shiftCount} смен на этом объекте. Табель и недоборы пересчитаются. Другие месяцы не изменятся.`,
  );
  if (!ok) return;

  setRemovingGuardId(sg.guardId);
  try {
    const fd = new FormData();
    fd.set("objectId", objectId);
    fd.set("guardId", sg.guardId);
    fd.set("month", monthStr);
    const result = await removeGuardFromObjectMonthScheduleAction(fd);
    if (!result.ok) {
      toast({ title: "Не удалось убрать", message: result.error, variant: "error", durationMs: 6500 });
      return;
    }
    toast({
      title: "Охранник убран из графика",
      message: `Удалено смен: ${result.deletedShifts}. ${monthLabel}`,
      variant: "success",
    });
    window.dispatchEvent(new CustomEvent(SCHEDULE_SHORTAGE_REFRESH_EVENT));
    dispatchIncidentReplacementsRefresh();
    router.refresh();
  } catch (err) {
    toast({
      title: "Не удалось убрать",
      message: humanizeClientError(err, "Ошибка удаления из графика"),
      variant: "error",
      durationMs: 6500,
    });
  } finally {
    setRemovingGuardId(null);
  }
}
```

`monthShifts` уже в props — считать смены клиента только для текста confirm; сервер удаляет по своим границам.

- [ ] **Step 3: Button in sticky name cell**

В блоке с `sg.displayName` (около строк с «Вне штата») добавить:

```tsx
<div className="flex items-start justify-between gap-1">
  <div
    className="flex min-w-0 flex-col cursor-help"
    onMouseEnter={...existing...}
    onMouseLeave={onCloseGuardPreview}
  >
    <span className="truncate">{sg.displayName}</span>
    {!sg.isAssigned && (
      <span className="text-[9px] text-accent-warning leading-none">Вне штата</span>
    )}
  </div>
  {canWrite ? (
    <button
      type="button"
      className="shrink-0 rounded p-0.5 text-app-muted opacity-70 transition hover:bg-app-elevated hover:text-status-sick hover:opacity-100 disabled:opacity-40"
      style={{ color: undefined }}
      title="Убрать из графика месяца"
      aria-label={`Убрать ${sg.displayName} из графика за ${monthLabel}`}
      disabled={removingGuardId === sg.guardId}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        void removeGuardFromMonth(sg);
      }}
      onMouseEnter={(e) => e.stopPropagation()}
    >
      <Trash2 className="size-3.5" strokeWidth={2.25} />
    </button>
  ) : null}
</div>
```

`Trash2` уже импортирован. Не открывать guard preview при клике на корзину (`stopPropagation`).

- [ ] **Step 4: Lint touched UI file**

Проверить ReadLints / `npx eslint` на `object-month-schedule-grid.tsx` если принято в проекте.

---

### Task 5: Verification

- [ ] **Step 1: Unit tests**

Run: `npx vitest run tests/scheduling/month-range-khabarovsk.test.ts`
Expected: PASS

- [ ] **Step 2: Manual checklist (dev)**

1. Открыть `/objects/{id}?month=2026-08` под Planner.
2. У охранника со сменами нажать 🗑 → Cancel → смены на месте.
3. Confirm → строка исчезает без ручного F5; toast; колокольчик недобора обновляется.
4. Табель за август: часы этого охранника на объекте ушли.
5. Переключить на июль — смены охранника на месте.
6. Галочки «Охранники объекта» — охранник всё ещё в пуле объекта.
7. Accountant — иконки нет / action отказан.

---

## Spec coverage check

| Spec requirement | Task |
|------------------|------|
| Trash + confirm | Task 4 |
| Delete month shifts object+guard | Task 2 |
| Delete monthly post guards | Task 2 |
| Keep guard_object_assignments | Task 2 (не трогаем) |
| Timesheet cascade + revalidate | Task 2–3 |
| router.refresh + bell events | Task 4 |
| Other months intact | Task 1 bounds + Task 2 overlap query |
| RBAC Planner/Admin | Task 3 |
| Zero shifts still removes staff | Task 2 step 7 always deletes staff |

## Placeholder scan

Нет TBD/TODO в шагах.
