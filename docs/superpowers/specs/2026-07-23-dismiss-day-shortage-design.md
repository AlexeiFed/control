# Dismiss schedule day hours-shortage icon — design

Дата: 2026-07-23  
Статус: approved (brainstorm)

## Цель

На днях текущей недели при недоборе часов показывается `!`. Иногда недобор ложный (например, смена старшего перекрывается обычной сменой по часам «всё ок», но метрики считают short). Admin/Planner должны уметь **снять** `!` на день. Если состав смен, инцидент или план дня изменились — знак **возвращается** с кнопкой снятия снова.

Scope показа: карточка объекта (месячная сетка), общий график (`/scheduler`), глобальный колокольчик недоборов.

Вне скоупа: исправление самой формулы недобора при перекрытиях СтМ/обычная.

## Решения (зафиксировано)

| Вопрос | Решение |
|--------|---------|
| Где скрывать | Везде: сетки + глобальный колокольчик |
| Хранение | БД, общее для всех пользователей |
| Когда вернуть `!` | Любое изменение состава смен дня, новый/изменённый незакрытый инцидент, изменение плана/шаблона дня |
| Ключ | `object_id` + `date_iso` (посты агрегируются в день) |
| Механизм | Fingerprint дня; совпал с сохранённым → скрыть |
| Кто снимает | `Administrator` / `Planner` (`schedule:write`); Accountant только читает скрытое состояние |

## Модель данных

Миграция `src/db/migrations/20260723_schedule_day_shortage_dismissals.sql` + `src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS schedule_day_shortage_dismissals (
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  date_iso date NOT NULL,
  fingerprint text NOT NULL,
  dismissed_by text NOT NULL, -- session.user.id (как author_user_id / issued_by_user_id)
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, date_iso)
);
```

## Fingerprint

Чистая функция в `src/lib/scheduling/schedule-shortage-dismiss.ts` (или рядом со `schedule-shortage.ts`):

Вход: смены объекта на операционный день + нормы плана дня (агрегат постов) + признак незакрытого инцидента на object+day.

Каноническая строка (затем стабильный хеш, например SHA-256 hex или простой FNV/djb2 если уже есть в проекте — предпочтительно crypto.createHash('sha256')):

1. Смены, отсортированные по `id`:  
   `id|startsAtIso|endsAtIso|shiftKind|postId|incidentRecordedAt?|replacedByShiftId?`
2. План:  
   `regCount|regHours|reinfCount|reinfHours|mpCount|mpHours|shiftLeadCount|shiftLeadHours`
3. Инцидент: `pendingIncident=0|1`

Правило UI/API: `dayPlanHasHoursShortage(metrics) === true` **и** (нет dismiss **или** fingerprint ≠ сохранённый) → показывать `!`. Иначе скрывать.

Если недобор исчез сам — `!` нет; строка dismiss может остаться без эффекта.

## Сервер

### Repository

- `listShortageDismissalsForObjects(objectIds, dateFrom, dateTo)` → map `(objectId, dateIso) → fingerprint`
- `upsertShortageDismissal({ objectId, dateIso, fingerprint, dismissedBy })`

### API

- `POST /api/scheduler/dismiss-day-shortage`  
  - session + `assertPermission(..., "schedule:write")`  
  - body: `{ objectId, dateIso }`  
  - сервер загружает смены/план/инциденты дня, считает fingerprint, upsert  
  - 403 Accountant / без сессии; 400 при битом body

- `GET /api/scheduler/shortages`  
  - после `computeScheduleShortages` отфильтровать дни с валидным dismiss; объекты без дней убрать из ответа

### Страницы объекта / scheduler

Серверный load: передать клиенту валидные dismissed даты (после сверки fingerprint) + `canDismissShortage` из RBAC. Не доверять клиенту как источнику авторизации.

## UI

- Расширить `ScheduleHoursShortageIcon` или обёртку: при `canDismiss` — кнопка снятия рядом с `!` (Lucide `X` / `EyeOff`, цвета из `designTokens`, compact).
- Места: header/footer дня в `object-month-schedule-grid`, день в `scheduler-grid`, пункты дней в `global-schedule-shortage-bell` (если день виден — dismiss невалиден, кнопка доступна Admin/Planner).
- Click → optimistic hide → POST → при ошибке откат + toast.
- Accountant: `!` виден если не dismissed; кнопки нет. Чужой dismiss скрывает знак у всех.

Стили только через `src/lib/design-tokens.ts` и существующие app-* классы.

## Тесты

- Fingerprint: одинаковый ввод → одинаковый хеш; изменение смены / плана / флага инцидента → другой хеш.
- `filterShortagesByDismissals(shortages, dismissals, currentFingerprints)`: валидный dismiss убирает день/объект; устаревший — оставляет.
- API RBAC (если есть паттерн route-тестов) или unit вокруг assert: write только Admin/Planner.

## Вне скоупа

- Пересчёт union-часов при перекрытии ShiftLead + Regular.
- Per-post dismiss.
- Автоочистка старых строк dismiss (не требуется для корректности).
