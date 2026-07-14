# Guard uniform issued tracking — design

Дата: 2026-07-14  
Статус: approved (brainstorm)

## Цель

Отделить факт **выдачи формы** от полей **размера/роста**. Сейчас «Форма: Да» в реестре и карточке означает заполненные `uniform_size` / `uniform_height`. Нужен явный флаг выдачи с датой, состоянием и примечанием.

## Решения (зафиксировано)

| Вопрос | Решение |
|--------|---------|
| Связь с размером/ростом | Размер и рост остаются отдельно; выдача — отдельный блок |
| Где UI | Карточка, создание в реестре, колонка/фильтр/экспорт «Форма» |
| Обязательные поля при выдаче | Дата + состояние; примечание опционально |
| Снятие галочки | Confirm, затем очистка даты/состояния/примечания при сохранении |
| Хранение | Колонки в `guards` (без истории выдач) |
| Существующие данные | Все `uniform_issued = false` (размер/рост ≠ выдача) |

## Модель данных

Миграция + обновление `src/db/schema.sql`:

| Колонка | Тип | Ограничения |
|---------|-----|-------------|
| `uniform_issued` | `boolean NOT NULL DEFAULT false` | |
| `uniform_issued_on` | `date NULL` | |
| `uniform_condition` | `text NULL` | `new` \| `used` |
| `uniform_note` | `text NULL` | |

CHECK-логика (constraint или эквивалент в приложении + желательно в БД):

- `uniform_issued = false` → `uniform_issued_on`, `uniform_condition`, `uniform_note` все `NULL`
- `uniform_issued = true` → `uniform_issued_on` и `uniform_condition` NOT NULL; `uniform_note` опционально

Лейблы UI:

- `new` → «новое»
- `used` → «б/у»

## Серверная логика

- RBAC без изменений: create/update guards — `Administrator` / `Planner` (как сейчас).
- Zod в `src/app/guards/actions.ts`:
  - checkbox off → принудительно `issued=false`, три поля `null`
  - checkbox on → require `issued_on` + `condition`; `note` trim, пустая строка → `null`
- Repository (`guards-repository`): SELECT/INSERT/UPDATE новых полей; optional-column resolve по аналогии с `uniform_size` / `uniform_height`.

## UI

### Создание и редактирование профиля

- Чекбокс «Форма выдана».
- При включении — блок: дата выдачи (required), select состояния новое/б/у (required), textarea примечания (optional).
- Размер/рост без изменений (отдельные поля).
- Снятие галочки при уже заполненных данных выдачи: `confirm('Снять отметку и очистить данные выдачи?')`. Отмена — галочка остаётся. Если данных ещё не было — confirm не нужен.

### Карточка охранника (просмотр)

- «Форма выдана: Нет» или «Да» + дата, состояние, примечание (если есть).
- Размер/рост — отдельной строкой (как сейчас по смыслу, но не как индикатор выдачи).

### Реестр

- Колонка «Форма» = `uniform_issued` (Да/Нет или иконка; tooltip: дата + состояние).
- Фильтр `hasUniform` → по `uniform_issued`, не по size/height.
- Экспорт: отражать факт выдачи (и при необходимости дату/состояние).

Стили: `src/lib/design-tokens.ts`, существующие field/checkbox паттерны ERP.

## Вспомогательные хелперы

В `src/lib/format/uniform.ts` (или рядом):

- labels condition
- `hasUniformIssued(guard)` / tooltip для реестра
- `hasGuardUniform(size, height)` остаётся для «есть размер/рост», но **не** используется для колонки/фильтра «Форма»

## Тесты

- Валидация: issued без даты/condition → ошибка; issued=false → поля null.
- Фильтр реестра yes/no по `uniform_issued`.
- Экспортная ячейка выдачи.
- (По возможности) UI-логика clear-on-uncheck не обязательна e2e; серверный clear покрыть unit-тестами схемы/маппинга.

## Вне скоупа

- История выдач / несколько комплектов.
- Складской учёт формы.
- Автозаполнение `uniform_issued` из существующих size/height.
