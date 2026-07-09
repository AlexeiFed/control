# План реализации уточненной модели сотрудников, ставок, усилений и смен

## Зафиксированные решения

1. Ставки должны поддерживать два режима: за час и за смену.
2. Валюта одна для всей системы: рубли. В БД хранить суммы в копейках.
3. Есть две должности: `Старший смены` и `Охранник`.
4. Удостоверение `Б/У` или `У` относится только к должности `Охранник`; для `Старший смены` поле удостоверения не применяется.
5. Трудоустройство влияет только на ставку зарплаты сотруднику, не на допуск, налоги или отчеты.
6. Стажер - квалификация для ставки и временный признак с датой окончания стажировки. Стажера можно ставить на объект одного.
7. Приоритет ставки: точный день + интервал > праздник > день недели > тип смены > дефолт.
8. В проекте не вводим отдельные дневные/ночные/вечерние ставки. Для ставок нужны обычные дневные смены, праздничные смены и усиление. Ночные минуты остаются в калькуляторе часов из-за существующего правила проекта, но не участвуют в подборе ставки.
9. Праздники имеют отдельные ставки и требуют календарь праздников.
10. Если смена пересекает несколько правил ставки, начисление дробится почасово.
11. Количество смен в сутки на объекте - шаблон расписания, а не жесткий лимит. Лишние смены не блокируем только из-за шаблона.
12. Шаблон сменности может отличаться по дням недели.
13. История ставок обязательна: старые периоды должны считаться по правилам, которые действовали на дату смены.
14. Ручной override ставки на конкретной смене нужен.
15. Экспорт должен быть двумя отдельными отчетами: счет клиенту и зарплата сотрудникам.
16. Усиление можно добавлять на любой объект, в усилении может быть несколько охранников, на графике усиление помечается красным и в табеле идет отдельным столбцом.

## Текущий контекст проекта

Проект построен как закрытая ERP на Next.js App Router + TypeScript + PostgreSQL через `pg`.
Схема БД лежит в `src/db/schema.sql`, репозитории - в `src/lib/operations/*`, серверные actions - в `src/app/*/actions.ts`.

Сейчас в системе есть:

- сотрудники-охранники в `guards`: `first_name`, `last_name`, `status`;
- объекты в `security_objects`: `name`, `address`, `status`;
- назначения сотрудников на объекты через `guard_object_assignments`;
- смены в `shifts`: `guard_id`, `object_id`, `starts_at`, `ends_at`, `total_minutes`, `month_minutes`;
- табель и CSV-экспорт в `src/lib/scheduling/timesheet.ts` и `src/app/api/accounting/export/route.ts`;
- серверный RBAC через `requireSession()` + `assertPermission()`;
- расчет часов в `src/lib/scheduling/hour-calculator.ts`.

Главные пробелы: нет ставок, рублевых начислений, телефона, должности, удостоверения, трудоустройства, стажировки с датой окончания, календаря праздников, шаблонов сменности объекта, усилений, override ставки и раздельных финансовых отчетов.

## Целевая доменная модель

### Сотрудники

Расширить `guards`:

```sql
ALTER TABLE guards ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT 'Guard'
  CHECK (position IN ('ShiftLead', 'Guard'));
ALTER TABLE guards ADD COLUMN IF NOT EXISTS license_type text
  CHECK (license_type IN ('None', 'Licensed'));
ALTER TABLE guards ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'Unemployed'
  CHECK (employment_type IN ('Employed', 'Unemployed'));
ALTER TABLE guards ADD COLUMN IF NOT EXISTS is_trainee boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS trainee_until date;
```

Обновить `status`:

```sql
ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_status_check;
ALTER TABLE guards ADD CONSTRAINT guards_status_check
  CHECK (status IN ('Active', 'Sick', 'OnVacation', 'Inactive'));
```

Правила:

- `status` отвечает за доступность: `Active`, `Sick`, `OnVacation`, `Inactive`.
- `is_trainee` и `trainee_until` отвечают за квалификацию и ставку.
- Если `position = 'ShiftLead'`, `license_type` должен быть `NULL`.
- Если `position = 'Guard'`, `license_type` обязателен: `None` для Б/У или `Licensed` для У.
- При наступлении даты после `trainee_until` UI должен подсвечивать, что стажировка истекла; автоматическое выключение `is_trainee` лучше делать отдельной задачей после базовой реализации.

TypeScript-типы:

```ts
export type GuardStatus = "Active" | "Sick" | "OnVacation" | "Inactive";
export type GuardPosition = "ShiftLead" | "Guard";
export type GuardLicenseType = "None" | "Licensed";
export type GuardEmploymentType = "Employed" | "Unemployed";
```

### Объекты и шаблон сменности

Добавить шаблон сменности объекта по дням недели:

```sql
CREATE TABLE IF NOT EXISTS object_shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  shifts_per_day int NOT NULL CHECK (shifts_per_day > 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, day_of_week, effective_from)
);
```

Использование:

- `Planner` и `Administrator` могут настраивать шаблон сменности, потому что это расписание, а не финансы.
- Шаблон используется для генерации/подсказки ожидаемых слотов на графике.
- Создание лишней обычной смены не блокируется только из-за шаблона, но UI показывает предупреждение.
- Усиление не входит в `shifts_per_day`: это отдельный дополнительный тип смены.

### Праздники

Добавить календарь праздников:

```sql
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Правила:

- `Administrator` управляет календарем праздников.
- `Accountant` может читать праздники в отчетах.
- `Planner` может видеть праздничную подсветку в графике, но не финансовые ставки.

### Смены и усиления

Расширить `shifts`:

```sql
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_kind text NOT NULL DEFAULT 'Regular'
  CHECK (shift_kind IN ('Regular', 'Reinforcement'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_client_rate_cents int CHECK (manual_client_rate_cents >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_guard_rate_cents int CHECK (manual_guard_rate_cents >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_rate_unit text
  CHECK (manual_rate_unit IN ('Hour', 'Shift'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_rate_reason text NOT NULL DEFAULT '';
```

Правила:

- `Regular` - обычная смена по шаблону объекта.
- `Reinforcement` - усиление, помечается красным на графике, может быть несколько сотрудников на один объект и день.
- Усиление попадает в отдельную колонку табеля и отдельные строки отчетов.
- Override ставки хранится на смене и имеет приоритет выше всех правил ставок.
- Override может менять клиентскую ставку, ставку сотрудника или обе сразу.
- Override должен быть доступен только `Administrator`, потому что это финансовое изменение.

### Ставки объекта

Нужны две независимые суммы:

- `client_rate_cents` - сколько выставляем хозяину объекта;
- `guard_rate_cents` - сколько начисляем сотруднику.

Добавить правила ставок:

```sql
CREATE TABLE IF NOT EXISTS object_rate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  day_of_week int CHECK (day_of_week BETWEEN 1 AND 7),
  is_holiday boolean,
  shift_kind text CHECK (shift_kind IN ('Regular', 'Reinforcement')),
  starts_at time,
  ends_at time,
  position text CHECK (position IN ('ShiftLead', 'Guard')),
  license_type text CHECK (license_type IN ('None', 'Licensed')),
  employment_type text CHECK (employment_type IN ('Employed', 'Unemployed')),
  is_trainee boolean,
  client_rate_cents int NOT NULL CHECK (client_rate_cents >= 0),
  guard_rate_cents int NOT NULL CHECK (guard_rate_cents >= 0),
  rate_unit text NOT NULL CHECK (rate_unit IN ('Hour', 'Shift')),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Индексы:

```sql
CREATE INDEX IF NOT EXISTS object_rate_rules_lookup_idx
  ON object_rate_rules (object_id, effective_from, effective_to, day_of_week, is_holiday, shift_kind);

CREATE INDEX IF NOT EXISTS object_shift_templates_lookup_idx
  ON object_shift_templates (object_id, effective_from, effective_to, day_of_week);

CREATE INDEX IF NOT EXISTS shifts_object_kind_time_idx
  ON shifts (object_id, shift_kind, starts_at, ends_at);
```

Правила подбора ставки:

1. Если на смене есть `manual_*`, использовать override для соответствующей стороны.
2. Иначе искать активное правило по `object_id` и дате смены.
3. Более точное правило выигрывает: `day_of_week + starts_at/ends_at` > `is_holiday` > `day_of_week` > `shift_kind` > дефолт.
4. Для сотрудника учитывать `position`, `license_type`, `employment_type`, `is_trainee`.
5. Для `ShiftLead` игнорировать `license_type`.
6. Если ставка не найдена, смену можно сохранить, но табель и отчеты должны показывать `Нет ставки`; финансовые суммы для такого сегмента не подставлять нулем без явной пометки.

### Расчет начислений

Создать модули:

- `src/lib/rates/rate-matching.ts` - выбор правила ставки;
- `src/lib/rates/rate-calculator.ts` - расчет сумм по смене;
- `src/lib/rates/holiday-calendar.ts` - проверка праздничной даты;
- `src/lib/scheduling/object-shift-templates.ts` - работа с шаблонами сменности.

Расчет:

- ставка `Hour`: считать по часам, дробление почасовое;
- ставка `Shift`: применять за весь отрезок правила; если смена пересекла разные правила, дробить на сегменты и считать каждый сегмент как долю смены по часам;
- смена дробится по границам часа, дня, праздника, месяца, `starts_at/ends_at` правила и `effective_from/effective_to`;
- ночные минуты продолжать считать для совместимости с текущим табелем, но ставки от ночных минут не зависят;
- результат содержит `clientAmountCents`, `guardAmountCents`, `marginCents`, `regularHours`, `reinforcementHours`, `holidayHours`, `unpricedSegments`.

## Изменения по файлам

### База и seed

- `src/db/schema.sql`: добавить поля сотрудников, шаблоны сменности, праздники, ставки, `shift_kind`, override-поля на `shifts`, индексы.
- `src/scripts/setup-local-db.ts`: обновить демо-сотрудников, объекты, шаблоны сменности, праздники, ставки и усиления.
- `src/scripts/seed-local-db.ts`: синхронизировать с `setup-local-db.ts`.

### Типы и бизнес-логика

- `src/lib/scheduling/types.ts`: добавить `GuardPosition`, `GuardLicenseType`, `GuardEmploymentType`, `shiftKind`, trainee-поля, rate-типы.
- `src/lib/operations/status-labels.ts`: добавить подписи должностей, удостоверений, трудоустройства, стажировки, типа смены и ставки.
- `src/lib/scheduling/conflicts.ts`: блокировать `Sick`, `OnVacation`, `Inactive`, пересечения и некорректные интервалы; `is_trainee` не блокировать.
- `src/lib/rates/rate-matching.ts`: реализовать приоритеты ставок.
- `src/lib/rates/rate-calculator.ts`: реализовать почасовое дробление и суммы.
- `src/lib/rates/holiday-calendar.ts`: загрузка и проверка праздников.
- `src/lib/scheduling/object-shift-templates.ts`: выбор шаблона сменности по объекту и дню недели.
- `src/lib/scheduling/timesheet.ts`: добавить клиентские суммы, зарплатные суммы, маржу, усиление и `unpriced`.

### Репозитории и actions

- `src/lib/operations/guards-repository.ts`: читать/создавать/обновлять телефон, должность, удостоверение, трудоустройство, стажировку.
- `src/app/guards/actions.ts`: расширить zod-схемы создания/редактирования сотрудника.
- `src/lib/operations/objects-repository.ts`: CRUD для ставок, шаблонов сменности и чтение праздников.
- `src/app/objects/actions.ts`: actions для шаблонов сменности; финансовые actions ставок разрешить только `Administrator`.
- `src/lib/operations/scheduler-repository.ts`: сохранять `shift_kind`, override-поля, считать предупреждения по шаблону, не блокировать превышение шаблона.
- `src/app/scheduler/actions.ts`: добавить `shiftKind`, override-поля, сообщения про отсутствие ставки и превышение шаблона.
- `src/app/api/accounting/export/route.ts`: разделить экспорт на клиентский и зарплатный отчет.

### UI

- `src/components/operations/guard-filters.tsx`: добавить телефон, должность, удостоверение, трудоустройство, стажировку и дату окончания стажировки.
- `src/app/guards/[guardId]/page.tsx`: показать телефон, должность, удостоверение, трудоустройство, стажировку, объекты и реальные смены из БД.
- `src/components/operations/objects-table.tsx`: добавить управление шаблонами сменности и ссылку/панель ставок.
- `src/components/operations/object-selected-view.tsx`: добавить блоки "Шаблон сменности", "Ставки", "Праздничные ставки", "Усиление".
- `src/components/operations/scheduler-grid.tsx`: добавить тип смены `Обычная/Усиление`, красную маркировку усиления, предупреждение при превышении шаблона.
- `src/components/accounting/timesheet-view.tsx`: добавить отдельную колонку усиления, клиентские суммы, зарплатные суммы, маржу, индикатор отсутствующей ставки.

Все UI-изменения делать через `src/lib/design-tokens.ts`; для усиления добавить красный/rose token, для праздников оставить cyan/fuchsia.

### RBAC

- `Administrator`: управляет ставками, override, праздниками, пользователями, объектами, сотрудниками и графиком.
- `Planner`: управляет объектами, сотрудниками, графиком, журналами и шаблонами сменности; не видит клиентские ставки, зарплатные ставки, маржу и override-суммы.
- `Accountant`: читает график, табель, праздники, ставки и экспортирует клиентский/зарплатный отчеты; не меняет ставки и график.

Если в `rbac.ts` не хватает granular permissions, добавить:

- `rates:manage`;
- `rates:read`;
- `holidays:manage`;
- `holidays:read`;
- `scheduleTemplates:manage`;
- `shiftRateOverride:manage`;
- `invoice:export`;
- `payroll:export`.

## Четкий план внесения изменений

### Этап 1. Стабилизировать основу данных

**Статус: выполнено (2026-05-02).**

1. ~~Написать тесты на новые типы сотрудников и конфликт назначений.~~ — `tests/scheduling/guard-profile.test.ts`, расширены `conflicts.test.ts` / `schedule-service.test.ts` / `timesheet.test.ts`.
2. ~~Обновить `src/lib/scheduling/types.ts`.~~ — доменные типы охранника/смены, `createSchedulerGuard` / `createSchedulerShift`.
3. ~~Обновить `src/lib/operations/status-labels.ts`.~~ — подписи должности, удостоверения, трудоустройства, типа смены, единицы ставки.
4. ~~Расширить `src/db/schema.sql`.~~ — поля `guards`, таблицы `object_shift_templates`, `holidays`, `object_rate_rules`, поля и индексы `shifts`.
5. ~~Обновить `setup-local-db.ts` и `seed-local-db.ts`.~~ — вставка охранников с `license_type`.
6. ~~Прогнать `npm run lint` и тесты по scheduling/auth.~~ — `tsc --noEmit`, `vitest run` (все тесты зелёные).

Дополнительно к пунктам плана: `src/lib/scheduling/guard-profile.ts` (инварианты удостоверения/должности), блокировка смен для `Inactive` в `conflicts.ts`, маппинг новых полей в `scheduler-repository.ts`, `demo-data.ts`, правка `api/scheduler/shifts/route.ts`.

### Этап 2. Сотрудники: телефон, должность, удостоверение, трудоустройство, стажировка

**Статус: выполнено (2026-05-02).**

1. ~~Расширить `GuardListRow`, `CreateGuardInput`, `GuardDetails`.~~ — добавлены телефон, должность, удостоверение, трудоустройство, стажировка, флаг `traineeExpired` для UI.
2. ~~Добавить поля в `createGuard`, `getGuardDetails`, `listGuards`.~~ — плюс `updateGuardProfile`, `listGuardShiftHistory` для карточки.
3. ~~Расширить zod-схемы в `src/app/guards/actions.ts`.~~ — создание с `superRefine` по `isValidGuardLicenseForPosition`, `updateGuardProfileAction`.
4. ~~Обновить форму и таблицу в `guard-filters.tsx`.~~ — создание с должностью/удостоверением/трудоустройством/стажировкой; колонки таблицы; токены для кнопки и предупреждения стажировки.
5. ~~Обновить карточку `guards/[guardId]/page.tsx`.~~ — реальные смены из БД, тип смены (в т.ч. усиление), `GuardProfileEditor` (`src/components/operations/guard-profile-editor.tsx`).
6. ~~Проверить серверный RBAC на всех actions.~~ — по-прежнему `guards:manage` + `requireSession` на всех действиях охранников.

Частично закрывает п. этапа 9: карточка больше не использует `demo-data` для смен.

### Этап 3. Праздники

**Статус: выполнено (2026-05-02).**

1. ~~Добавить repository-функции для `holidays`.~~ — `src/lib/operations/holidays-repository.ts` (`listHolidaysInRange`, `listAllHolidays`, `createHoliday`, `deleteHoliday`).
2. ~~Добавить `src/lib/rates/holiday-calendar.ts`.~~ — множество дат, `loadHolidayDateSetForLocalRange`, ключи в TZ смен (`localDateKeyInTimeZone`).
3. ~~Добавить UI управления праздниками для `Administrator`.~~ — `/admin/holidays`, пункт в дашборде, `holidays:manage` в actions.
4. ~~Подключить чтение праздников в график и табель.~~ — `scheduler/page.tsx` + подсветка заголовков в `scheduler-grid.tsx`; табель и `api/accounting/export` через `loadHolidayDateSetForLocalRange`; проверка `holidays:read` на этих маршрутах.
5. ~~Написать тесты на праздничную дату и обычную дату.~~ — `tests/scheduling/holiday-calendar.test.ts`, расширен `tests/auth/rbac.test.ts`.

RBAC: добавлены права `holidays:manage` / `holidays:read` в `rbac.ts`. В seed добавлен пример праздника `2026-05-09`.

### Этап 4. Шаблон сменности объекта

**Статус: выполнено (2026-05-02).**

1. ~~Добавить repository-функции для `object_shift_templates`.~~ — `src/lib/operations/shift-templates-repository.ts` (`listShiftTemplatesForObjectIds`, `replaceShiftTemplatesForObject`).
2. ~~Добавить `src/lib/scheduling/object-shift-templates.ts`.~~ — выбор активной строки по дате, `buildExpectedRegularByObjectAndDay`, подсчёт только `Regular`.
3. ~~Добавить UI настройки `shifts_per_day` по дням недели.~~ — форма в `objects-table.tsx` (колонка «Шаблон»), `saveShiftTemplatesAction`, право `scheduleTemplates:manage`.
4. ~~В графике показывать ожидаемое количество обычных смен на день.~~ — строка «норма N обычн.» в ячейке `scheduler-grid.tsx`.
5. ~~При превышении шаблона показывать предупреждение, но не блокировать запись.~~ — предупреждение цветом `designTokens.color.accent.warning`, запись смен не менялась.
6. ~~Усиление не учитывать в сравнении с шаблоном.~~ — фильтр `shiftKind !== 'Reinforcement'`.

RBAC: `scheduleTemplates:manage` у `Administrator` и `Planner`. Сид: шаблон 2/2/2/2/2/1/1 на объекты с `2026-01-01`.

### Этап 5. Ставки объекта

**Статус: выполнено (2026-05-02).**

1. ~~Добавить repository-функции `listObjectRateRules`, `createObjectRateRule`, `updateObjectRateRule`, `deleteObjectRateRule`.~~ — `src/lib/operations/object-rate-rules-repository.ts`.
2. ~~Парсинг и валидация полей ставок в `src/app/objects/actions.ts`~~ (без отдельного zod-объекта правила — разбор `FormData` и `assertPermission(..., "rates:manage")`).
3. ~~Управление ставками~~ — только `rates:manage` (у роли `Administrator`); `Planner` колонку «Ставки» не видит.
4. ~~UI~~ — `object-rate-rules-panel.tsx`, колонка «Ставки» в `objects-table.tsx`, загрузка `listObjectRateRulesForObjects` в `objects/page.tsx`.
5. ~~Seed~~ — восемь демо-правил на объект «БЦ Центральный» в `setup-local-db.ts` и `seed-local-db.ts` (Б/У, У, старший, стажёр, не трудоустроен, пятница, праздник, усиление).

### Этап 6. Подбор и расчет ставок

**Статус: выполнено (2026-05-02).**

1. ~~Тесты `rate-matching`~~ — `tests/rates/rate-matching.test.ts` (приоритет, праздник, усиление, лицензия/стажёр/трудоустройство, окно времени через полночь).
2. ~~`src/lib/rates/rate-matching.ts`~~ — `ruleMatchesSegment`, `findBestMatchingRule`, контекст сегмента в TZ смены (`DEFAULT_SHIFT_TIMEZONE` из `holiday-calendar`).
3. ~~Тесты `rate-calculator`~~ — `tests/rates/rate-calculator.test.ts` (час, смена, два окна, праздник, нет правила, ручной override клиента).
4. ~~`src/lib/rates/rate-calculator.ts`~~ — поминутный расчёт, Hour/Shift, override на сторону.
5. ~~`buildTimesheetRows`~~ — поля сумм, `regularHours`/`reinforcementHours`, `unpriced`; `getTimesheetSnapshot` подгружает `rateRulesByObjectId`.
6. ~~Без ставки~~ — флаг `unpriced` при `unpricedMinutes > 0`, суммы не раздуваются нулём; CSV и сводки табеля расширены.

### Этап 7. График и усиление

**Статус: выполнено (2026-05-02).**

1. ~~`createShiftSchema` / `createShiftAction`~~ — `shiftKind`, поля override (рубли → копейки), проверка `rates:manage` при любом override, единица обязательна при заполненных суммах.
2. ~~`createShiftAssignment`~~ — INSERT в `shifts` с `shift_kind`, `manual_*`, кандидат конфликта с реальным `shiftKind`.
3. ~~`scheduler-grid.tsx`~~ — выбор типа смены в форме и в модалке; усиление — градиент rose + `designTokens.color.accent.danger` на рамке и подписи.
4. ~~Несколько усилений на объект/день~~ — разные охранники; пересечение по-прежнему только по одному `guard_id` (конфликт-сервис).
5. ~~Override в UI~~ — блок сумм только при `hasPermission(..., "rates:manage")` (только администратор в текущей матрице RBAC).

### Этап 8. Табель и отчеты

**Статус: выполнено (2026-05-02).**

1. ~~`TimesheetRow`~~ — поля часов/сумм/`unpriced` уже из этапа 6; при необходимости дорастить только доменно.
2. ~~`timesheet-view.tsx`~~ — колонки «Обыч» / «Усил», суммы по правам, таблица «Все смены», предупреждение по `unpriced` (полоса `designTokens.color.accent.warning`).
3. ~~Экспорт~~ — `exportClientInvoiceCsv` / `exportPayrollCsv` в `timesheet.ts`; общая выборка `getTimesheetRowsForExport` в `lib/accounting/timesheet-export-server.ts`; маршруты `GET /api/accounting/export/client`, `GET /api/accounting/export/payroll`; старый `/api/accounting/export` → редирект на client.
4. ~~`invoice:export`~~ — `Administrator`, `Accountant`.
5. ~~`payroll:export`~~ — `Administrator`, `Accountant`; `timesheet:export` убран в пользу двух отдельных прав.
6. ~~`Planner`~~ — нет `timesheet:read` / экспортов / колонок с суммами на табеле.

### Этап 9. Убрать опасные демо-fallbacks из финансового контура

**Статус: выполнено (2026-05-02).**

1. ~~`GuardDetailsPage`~~ — данные из репозитория/БД (без `demo-data` на странице).
2. ~~`getSchedulerSnapshot` / `getTimesheetSnapshot`~~ — без подстановки `demo-*` при пустых данных или ошибке БД; ошибки пробрасываются наверх.
3. ~~`api/scheduler/shifts`~~ — `createShiftAssignment` с записью в БД; ~~`api/scheduler/logs`~~ — `createShiftLog` с записью в БД.
4. ~~Тест~~ — `buildTimesheetRows` с пустым `shifts` даёт пустой массив строк (`tests/scheduling/timesheet.test.ts`).

### Этап 10. Финальная проверка

1. Прогнать:

```bash
npm run lint
npm run test
npm run build
```

2. Проверить вручную:
   - Administrator создает ставку, праздник, override и усиление;
   - Planner создает обычную смену и усиление, но не видит ставки;
   - Accountant видит табель и два экспорта, но не меняет график;
   - Sick/OnVacation/Inactive не назначаются;
   - стажер назначается и получает стажерскую ставку;
   - пятница и праздник выбирают отдельные ставки;
   - смена на границе правил дробится почасово;
   - отчет клиента и зарплатный отчет отличаются и не смешивают суммы.

## Риски, которые нужно закрыть при реализации

- В проекте нет миграционного механизма, только `schema.sql`. Для продовой БД нужен аккуратный ALTER-путь без удаления данных.
- Сейчас часть планировщика и карточка сотрудника используют demo-data; финансовые функции нельзя строить поверх demo fallback.
- Часовой пояс нужно унифицировать: UI, Postgres и калькулятор ставок должны считать одну локальную дату объекта.
- Override ставки - финансово чувствительная операция; нужен серверный RBAC и желательно аудит позже.
- Стажировка с датой окончания может устаревать; на первой итерации подсвечиваем, на следующей можно добавить автоматическое снятие признака.
- Шаблон сменности не блокирует запись, поэтому отчеты должны отличать плановые обычные смены, сверхплановые обычные смены и усиление.

## Минимальная первая итерация

В первую итерацию включить:

- расширение сотрудников;
- телефон в создании и карточке;
- стажировку с датой окончания;
- шаблоны сменности по дням;
- календарь праздников;
- ставки в рублях за час/за смену;
- историю ставок;
- усиление как `shift_kind = 'Reinforcement'`;
- ручной override ставки;
- расчет сумм в табеле;
- два CSV-экспорта: клиентский и зарплатный;
- RBAC, чтобы Planner не видел финансовые данные.

Не включать в первую итерацию:

- автоматическое снятие стажировки по дате;
- полноценный аудит финансовых изменений;
- закрытие расчетного периода;
- XLSX-экспорт вместо CSV.
