# Mobile Objects and Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить мобильные карточки объектов и двухнедельный календарь смен 2×7, сохранив текущие десктопные таблицы и серверные проверки.

**Architecture:** Чистый builder формирует мобильную модель 14-дневного графика из существующих `objects`, `guards`, `shifts` и норм. Отдельный мобильный компонент только отображает эту модель и передаёт выбранный день/смену обратно в `SchedulerGrid`; формы и server actions не дублируются. Страница объектов использует те же состояния и формы, но получает отдельную мобильную разметку внутри `ObjectsTable`.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Lucide, `src/lib/design-tokens.ts`.

---

### Task 1: Модель мобильного календаря 2×7

**Files:**
- Create: `src/lib/scheduling/mobile-schedule-calendar.ts`
- Create: `tests/scheduling/mobile-schedule-calendar.test.ts`
- Reuse: `src/lib/scheduling/schedule-shortage.ts`
- Reuse: `src/lib/scheduling/operational-day-timeline.ts`

- [ ] **Step 1: Написать падающие тесты builder**

Добавить imports `describe/expect/it`, `buildMobileScheduleCards`, `createSchedulerGuard`,
`createSchedulerShift`, `SecurityObject`, `Shift` и `ExpectedShifts`. Определить базовые fixtures:

```ts
const dayIsos = Array.from({ length: 14 }, (_, index) => `2026-07-${String(13 + index).padStart(2, "0")}`);
const weekDays = dayIsos.map((iso, index) => ({
  iso,
  label: `${index < 7 ? "Неделя 1" : "Неделя 2"} · ${iso}`,
  date: new Date(`${iso}T00:00:00+10:00`),
}));
const objectItem: SecurityObject = {
  id: "o1",
  name: "ТЦ Север",
  address: "ул. Ленина, 18",
  status: "Active",
  operationalDayStartTime: "08:00",
};
const guard = createSchedulerGuard({ id: "g1", name: "Иванов Иван", status: "Active" });
const fullNorm: ExpectedShifts = {
  regular: 1,
  reinforcement: 0,
  shiftHours: 12,
  reinforcementShiftHours: 12,
  rapidResponse: 0,
  rapidResponseShiftHours: 12,
  shiftLead: 0,
  shiftLeadShiftHours: 12,
};

function makeInput(shifts: Shift[] = [], norms: Record<string, ExpectedShifts> = {}) {
  return {
    objects: [objectItem],
    guards: [guard],
    shifts,
    weekDays,
    expectedShiftsByObjectDay: { o1: norms },
    holidayDateKeys: new Set<string>(),
    todayIso: "2026-07-13",
  };
}

describe("buildMobileScheduleCards", () => {
  it("returns exactly 14 ordered day cells for every object", () => {
    const [card] = buildMobileScheduleCards(makeInput());
    expect(card?.days.map((day) => day.dateIso)).toEqual(dayIsos);
  });

  it("assigns a tail shift to the operational day before the anchor", () => {
    const anchoredObject = { ...objectItem, operationalDayStartTime: "09:00" };
    const tail = createSchedulerShift({
      id: "tail",
      guardId: guard.id,
      objectId: objectItem.id,
      startsAt: new Date("2026-07-14T08:00:00+10:00"),
      endsAt: new Date("2026-07-14T09:00:00+10:00"),
    });
    const [card] = buildMobileScheduleCards({
      ...makeInput([tail]),
      objects: [anchoredObject],
    });
    expect(card?.days[0]?.shifts.map((shift) => shift.id)).toEqual(["tail"]);
  });

  it("calculates regular and special-kind shortages with existing metrics", () => {
    const [card] = buildMobileScheduleCards(makeInput([], { "2026-07-13": fullNorm }));
    expect(card?.days[0]?.shortageHours).toBe(12);
    expect(card?.days[0]?.hasShortage).toBe(true);
  });

  it("keeps no-show shifts visible but excludes them from worked hours", () => {
    const noShow = {
      ...createSchedulerShift({
        id: "no-show",
        guardId: guard.id,
        objectId: objectItem.id,
        startsAt: new Date("2026-07-13T08:00:00+10:00"),
        endsAt: new Date("2026-07-13T20:00:00+10:00"),
      }),
      isNoShow: true,
    };
    const [card] = buildMobileScheduleCards(makeInput([noShow], { "2026-07-13": fullNorm }));
    expect(card?.days[0]?.shifts[0]?.isNoShow).toBe(true);
    expect(card?.days[0]?.workedHours).toBe(0);
  });
});
```

- [ ] **Step 2: Запустить тест и подтвердить падение**

Run:

```bash
npx vitest run tests/scheduling/mobile-schedule-calendar.test.ts
```

Expected: FAIL — модуль `mobile-schedule-calendar` ещё не существует.

- [ ] **Step 3: Реализовать типы и builder**

Создать публичный контракт:

```ts
export type MobileScheduleShift = {
  id: string;
  guardId: string;
  guardName: string;
  startTime: string;
  endTime: string;
  durationHours: number;
  shiftKind: ShiftKind;
  isNoShow: boolean;
};

export type MobileScheduleDay = {
  dateIso: string;
  label: string;
  isToday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  workedHours: number;
  shortageHours: number;
  hasShortage: boolean;
  shifts: MobileScheduleShift[];
};

export type MobileScheduleCard = {
  objectId: string;
  objectName: string;
  address: string;
  totalShortageHours: number;
  days: MobileScheduleDay[];
};

export function buildMobileScheduleCards(input: {
  objects: readonly SecurityObject[];
  guards: readonly Guard[];
  shifts: readonly Shift[];
  weekDays: readonly { iso: string; label: string; date: Date }[];
  expectedShiftsByObjectDay: Record<string, Record<string, ExpectedShifts>>;
  holidayDateKeys: ReadonlySet<string>;
  todayIso: string;
}): MobileScheduleCard[];
```

Внутри:

1. Построить `guardNameById` и `anchorByObjectId`.
2. Для каждого объекта и дня выбрать смены через `shiftBelongsToOperationalDayColumn`.
3. Получить план через `computeDayPlanMetrics`.
4. Суммировать дефицит:

```ts
const shortageHours = metrics
  ? metrics.hoursShort +
    metrics.reinforcementHoursShort +
    metrics.rapidResponseHoursShort +
    metrics.shiftLeadHoursShort
  : 0;
```

5. Форматировать время через `dateTimeToHmKhabarovsk`.
6. Не копировать расчёты рабочего времени из JSX `SchedulerGrid`.

- [ ] **Step 4: Запустить тесты builder**

Run:

```bash
npx vitest run tests/scheduling/mobile-schedule-calendar.test.ts tests/scheduling/schedule-shortage.test.ts
```

Expected: PASS.

### Task 2: Мобильный календарь смен и интеграция с SchedulerGrid

**Files:**
- Create: `src/components/operations/scheduler-mobile-calendar.tsx`
- Modify: `src/components/operations/scheduler-grid.tsx`

- [ ] **Step 1: Создать презентационный компонент**

Контракт компонента:

```ts
type SchedulerMobileCalendarProps = {
  cards: readonly MobileScheduleCard[];
  canWrite: boolean;
  onAssign: (objectId: string, dateIso: string, shiftKind: ShiftKind) => void;
  onEditShift: (objectId: string, dateIso: string, shiftId: string) => void;
};
```

Разметка:

- корневой контейнер `grid gap-4 md:hidden`;
- карточка объекта `rounded-card border border-app-border bg-app-surface`;
- две группы `days.slice(0, 7)` и `days.slice(7, 14)`;
- каждая группа — `grid grid-cols-7`;
- ячейка дня имеет `min-w-0`, дату, до двух компактных смен, `+N` для остальных и строку дефицита;
- вся пустая часть ячейки открывает обычное назначение;
- существующая смена вызывает `onEditShift`;
- `aria-label` содержит полную дату, смены и дефицит;
- текущий день, праздник и тип смены оформляются через Tailwind-токены или значения `designTokens`.

Не показывать drag-to-fill и копирование недели в мобильной карточке.

- [ ] **Step 2: Подключить builder в SchedulerGrid**

В `SchedulerGrid` создать:

```ts
const mobileScheduleCards = useMemo(
  () =>
    buildMobileScheduleCards({
      objects: visibleObjects,
      guards,
      shifts,
      weekDays,
      expectedShiftsByObjectDay,
      holidayDateKeys,
      todayIso,
    }),
  [visibleObjects, guards, shifts, weekDays, expectedShiftsByObjectDay, holidayDateKeys, todayIso],
);
```

Перед десктопной таблицей отрисовать `SchedulerMobileCalendar`.

- [ ] **Step 3: Переиспользовать открытие назначения**

Добавить локальные функции без новой бизнес-логики:

```ts
function openMobileAssignment(objectId: string, dateIso: string, shiftKind: ShiftKind) {
  const dayInterval = defaultDayShiftInterval(resolveObjectAnchor(objectId));
  setQuickAssign({
    objectId,
    dateIso,
    startTime: dayInterval.startTime,
    endTime: dayInterval.endTime,
    shiftKind,
  });
}

function openMobileShift(objectId: string, dateIso: string, shiftId: string) {
  const shift = shifts.find((item) => item.id === shiftId);
  if (!shift) return;
  setQuickAssign({
    objectId,
    dateIso,
    replaceShiftId: shift.id,
    startTime: toTime(shift.startsAt),
    endTime: toTime(shift.endsAt),
    shiftKind: shift.shiftKind,
  });
}
```

Передать функции в мобильный компонент. Для `Accountant` `canWrite=false`: календарь остаётся доступен для чтения, кнопки назначения и редактирования отсутствуют.

- [ ] **Step 4: Скрыть десктопную таблицу на мобильном**

Текущий блок таблицы обернуть/изменить на:

```tsx
<div className="mt-6 hidden overflow-hidden rounded-card border border-app-border bg-app-surface md:block">
```

Убедиться, что синхронизируемые `headerScrollerRef` и `bodyScrollerRef` остаются только в десктопном DOM и не используются мобильным компонентом.

- [ ] **Step 5: Проверить типы и календарные тесты**

Run:

```bash
npm run lint
npx vitest run tests/scheduling/mobile-schedule-calendar.test.ts tests/scheduling/schedule-shortage.test.ts
```

Expected: оба процесса завершаются с кодом 0.

### Task 3: Полноэкранное назначение смены на мобильном

**Files:**
- Modify: `src/components/operations/scheduler-grid.tsx`
- Modify: `src/components/operations/shift-assign-time-rate-fields.tsx`

- [ ] **Step 1: Сделать dialog полноэкранным ниже md**

Изменить мобильные классы overlay/dialog, сохранив десктоп:

```tsx
<div className="fixed inset-0 z-30 grid bg-black/50 p-0 md:items-start md:justify-items-center md:px-4 md:pb-4 md:pt-3">
  <div className="flex h-dvh w-full flex-col overflow-hidden border-app-border bg-app-surface p-3 md:h-[min(98vh,68rem)] md:max-w-[min(98vw,85rem)] md:rounded-card md:border md:p-8">
```

Шапка должна иметь компактный заголовок и кнопку закрытия размером минимум 44 px.

- [ ] **Step 2: Разрешить вертикальную прокрутку формы**

Мобильная форма:

```tsx
className="mt-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-app-elevated p-3 md:mt-4 md:overflow-hidden md:rounded-card md:border md:border-app-border md:p-6"
```

Основные кнопки поместить в мобильный sticky footer:

```tsx
<div className="sticky bottom-0 z-10 -mx-3 border-t border-app-border bg-app-elevated px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:static md:mx-0 md:border-0 md:p-0">
```

- [ ] **Step 3: Выстроить время, охранника и ставки в один столбец**

В `ShiftAssignTimeRateFields` оставить текущий desktop `lg:grid-cols-2`, но убрать мобильные ограничения высоты:

```tsx
<div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 lg:items-stretch lg:gap-6 lg:[&>*]:min-w-0">
  <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">
    <ShiftOperationalDayTimeline
      shiftDateIso={shiftDateIso}
      operationalDayStartTime={operationalDayStartTime}
      startTime={startTime}
      endTime={endTime}
      onStartTimeChange={onStartTimeChange}
      onEndTimeChange={onEndTimeChange}
      occupiedIntervals={occupiedIntervals}
    />
    {leftFooter ? <div className="mt-auto flex shrink-0 flex-col gap-2">{leftFooter}</div> : null}
  </div>
  <div className="flex min-w-0 flex-col gap-4 lg:min-h-0">{sidePanel}</div>
</div>
```

Список охранников на мобильном получает ограничение `max-h-64 overflow-auto`, а на desktop сохраняет `lg:max-h-none lg:flex-1`.

- [ ] **Step 4: Проверить форму**

Run:

```bash
npm run lint
npx vitest run tests/rates/shift-rate-selection.test.ts tests/scheduling/conflicts.test.ts
```

Expected: PASS, серверные конфликты и выбор ставки не изменены.

### Task 4: Мобильные карточки страницы «Объекты»

**Files:**
- Modify: `src/components/operations/objects-table.tsx`

- [ ] **Step 1: Сохранить desktop и добавить mobile list**

Текущую таблицу поместить в `hidden md:block`. Перед ней добавить:

```tsx
<div className="mt-6 grid gap-3 md:hidden">
  {filteredObjects.map((object) => (
    <article
      key={object.id}
      className="rounded-card border border-app-border bg-app-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <ButtonLink
            href={`/objects/${object.id}`}
            variant="ghost"
            className="h-auto justify-start px-0 py-0 text-left font-semibold"
          >
            {object.name}
          </ButtonLink>
          <p className="mt-1 break-words text-sm text-app-muted">{object.address}</p>
        </div>
        <span className={`shrink-0 text-xs font-semibold ${statusClass[object.status]}`}>
          {objectStatusLabels[object.status]}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-button bg-app-elevated p-2">
          Охранники: <b>{object.guardsCount}</b>
        </div>
        <div className="rounded-button bg-app-elevated p-2">
          Неделя: <b>{object.weekShiftCount} смен</b>
        </div>
      </div>
    </article>
  ))}
</div>
```

Карточка показывает:

- `object.name` ссылкой на `/objects/${object.id}`;
- адрес;
- `objectStatusLabels[object.status]`;
- `${object.guardsCount} охранников`;
- `${object.weekShiftCount} смен / ${object.weekGuardCount} охр.`;
- действия «Открыть», «Охранники», «Шаблон», «Ставки» согласно `canEditTemplates`/`canManageRates`;
- иконки удаления и редактирования с существующими accessible labels.

- [ ] **Step 2: Переиспользовать состояние и формы охранников**

Мобильная кнопка «Охранники» использует тот же ключ:

```ts
`object-guards-${object.id}`
```

Вместо абсолютного dropdown на мобильном выводить inline-блок:

```tsx
<div className="mt-3 rounded-button border border-app-border bg-app-elevated p-3">
```

Форма должна продолжать отправлять `objectId` и CSV `guardIds` в `setObjectGuardsAction`.

- [ ] **Step 3: Переиспользовать шаблон сменности**

Вынести повторяемую разметку формы шаблона в локальную функцию/компонент `ObjectShiftTemplateForm` в этом же файле с props:

```ts
type ObjectShiftTemplateFormProps = {
  object: ObjectListRow;
  templateEffectiveFrom: string;
  regularDefaults: number[];
  reinforcementDefaults: number[];
};
```

На мобильном дни отображаются `grid grid-cols-2 gap-2`; на desktop сохраняется `md:grid-cols-8`.

- [ ] **Step 4: Переиспользовать ставки и опасные действия**

При `openRatesObjectId === object.id` отрисовать существующий:

```tsx
<ObjectRateRulesPanel
  objectId={object.id}
  rules={rateRulesByObjectId[object.id] ?? []}
/>
```

Удаление продолжает открывать один существующий confirm-dialog. Не добавлять client-only permission checks вместо server actions.

- [ ] **Step 5: Адаптировать фильтры и создание**

Сохранить текущую одноколоночную мобильную сетку, уменьшить внешние отступы:

```tsx
className="rounded-card border border-app-border bg-app-surface p-3 shadow-glow md:p-6"
```

Все поля и кнопки на мобильном имеют `w-full` и высоту не меньше 44 px.

- [ ] **Step 6: Проверить типы**

Run:

```bash
npm run lint
```

Expected: exit code 0.

### Task 5: Отступы страниц и полная проверка

**Files:**
- Modify: `src/app/objects/page.tsx`
- Modify: `src/app/scheduler/page.tsx`
- Verify: `src/lib/design-tokens.ts`

- [ ] **Step 1: Уменьшить мобильные page paddings**

`/objects`:

```tsx
<main className="min-h-screen bg-app-bg p-3 text-app-text md:p-6">
```

`/scheduler`:

```tsx
className="grid min-h-screen gap-4 bg-app-bg p-3 text-app-text [--scheduler-page-padding:0.75rem] md:gap-6 md:p-6 md:[--scheduler-page-padding:1.5rem]"
style={{
  paddingTop:
    "calc(var(--scheduler-page-padding) + var(--incident-banner-offset, 0px) + var(--compliance-banner-offset, 0px))",
}}
```

Так мобильная база равна `0.75rem`, desktop остаётся `1.5rem`, а offsets баннеров сохраняются.

- [ ] **Step 2: Выполнить автоматическую проверку**

Run:

```bash
npm run lint
npm test
```

Expected: TypeScript и полный Vitest suite завершаются с кодом 0.

- [ ] **Step 3: Проверить мобильный UI в браузере**

Проверить `/objects` и `/scheduler` на ширинах 320, 375, 390 и 768 px:

- нет горизонтального scroll у страницы;
- в графике видны все 14 дней двумя строками;
- текущий день, выходные, праздники и дефицит различимы;
- длинные названия не расширяют карточку;
- назначение открывает полноэкранную форму;
- список охранников и ставки прокручиваются;
- Accountant не получает действий записи;
- desktop при ширине 1024 px сохраняет текущую таблицу.

- [ ] **Step 4: Проверить ключевые операции**

Для Administrator/Planner:

1. Назначить обычную смену.
2. Открыть существующую смену и заменить охранника.
3. Убедиться, что пересечение, `Sick` и `OnVacation` блокируются.
4. Изменить охранников объекта.
5. Открыть и сохранить шаблон сменности.
6. Открыть ставки.
7. Отменить удаление объекта.

- [ ] **Step 5: Проверить итоговый diff**

Run:

```bash
git diff --check
git status --short
```

Expected: нет whitespace errors; новые изменения относятся только к мобильным страницам, а существующие до начала задачи пользовательские изменения не перезаписаны. Не создавать commit без отдельного запроса пользователя.
