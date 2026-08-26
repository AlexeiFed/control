# Удаление охранника из графика за месяц — design

Дата: 2026-08-11  
Статус: approved (brainstorm)

## Цель

Убрать охранника из **месячной сетки объекта** так, чтобы:

- удалились все его смены на этом объекте за **текущий просматриваемый месяц**;
- пересчитались табель, часы, недоборы и глобальные алерты;
- прошлые/другие месяцы и глобальный пул охранников объекта **не менялись**.

Заодно убирается путаница «снял галочку — часы как будто перешли другому» (строка «Вне штата» съезжала вниз, соседние ряды визуально сдвигались).

Вне скоупа: удаление охранника из реестра; смена глобального `guard_object_assignments`; массовое удаление по нескольким объектам.

## Решения (зафиксировано)

| Вопрос | Решение |
|--------|---------|
| Что удалять | Все смены `guardId` + `objectId` в диапазоне выбранного месяца (Хабаровск), все посты объекта |
| Штат месяца | Убрать из `object_monthly_post_guards` для всех постов объекта на этот `YYYY-MM` |
| Глобальный штат объекта | **Не трогать** `guard_object_assignments` |
| Другие месяцы | Не трогать смены и monthly staff |
| UX | Иконка удаления в колонке «Охранник» + `window.confirm` с числом смен |
| Кто может | `Administrator` / `Planner` (`schedule:write` + manage objects staff) |
| Обновление UI | **Без ручного F5**: после успеха `router.refresh()` + dispatch refresh-событий колокольчиков |

## UI

Файл: `object-month-schedule-grid.tsx` (sticky-колонка имени).

- Кнопка `Trash2` рядом с ФИО, только если `canWrite`.
- `stopPropagation` / не открывать preview по клику на корзину.
- Confirm текст (пример):

  > Убрать «{ФИО}» из графика за {monthLabel}?  
  > Будет удалено {N} смен на этом объекте. Табель и недоборы пересчитаются. Другие месяцы не изменятся.

- Пока идёт action: disable кнопки / короткий pending на строке; toast success/error.
- После успеха: строка исчезает из сетки (данных смен и monthly staff больше нет).

## Обновление без ручного refresh

После успешного server action клиент:

1. `toast` success.
2. `window.dispatchEvent(new CustomEvent(SCHEDULE_SHORTAGE_REFRESH_EVENT))`.
3. `dispatchIncidentReplacementsRefresh()` (если баннер замен завязан на смены).
4. `router.refresh()` — RSC перечитает смены, `guardsByPost`, shortage dismiss keys.

Пользователь **не** обновляет страницу вручную. `router.refresh()` — программный soft-refresh Next.js, скролл сохраняем через существующий `scrollY` паттерн при необходимости.

## Сервер

### Action

`removeGuardFromObjectMonthScheduleAction(formData)` (рядом с object/scheduler actions):

Вход: `objectId`, `guardId`, `month` (`YYYY-MM`), опционально `redirect` / `noRedirect`.

Проверки:

- session + роль `Administrator` | `Planner`;
- zod uuid + month regex.

Транзакция / последовательные шаги в repository:

1. Найти смены охранника на объекте в `[monthStart, nextMonthStart)` по операционному/Хабаровскому календарю (тот же способ границ месяца, что у `listScheduledGuardsByObjectForLocalMonth` / object page).
2. Для каждой смены (или bulk): удалить с учётом `replaced_by_shift_id` — переиспользовать логику `deleteShiftById` либо вынести общий helper `deleteShiftsByIds` / `deleteGuardObjectShiftsInMonth`, чтобы замены не оставляли битые ссылки.
3. `DELETE FROM object_monthly_post_guards WHERE object_id = $1 AND guard_id = $2 AND month = $3`.
4. Commit.

Табель: `timesheet_shift_entries.shift_id → shifts(id) ON DELETE CASCADE` — строки табеля уходят вместе со сменами.

Revalidate (как `deleteShiftAction`):

- paths: `/objects/{id}`, `/scheduler`, `/accounting/timesheet`, `/dashboard`, `/`, …
- tags: `timesheet`, `scheduler`, `global-alerts` (через существующий `revalidateAfterShiftMutation` / аналог).

### Repository

Новые функции, например в `scheduler-repository.ts` + thin wrapper monthly staff:

- `countGuardObjectShiftsInLocalMonth(objectId, guardId, year, month0): number` — для confirm (можно считать на клиенте из `monthShifts`, сервер всё равно удаляет по своим границам).
- `removeGuardFromObjectMonthSchedule(objectId, guardId, month): { deletedShifts: number }`.

## Данные / границы месяца

Границы удаления смен = тот же local/Khabarovsk month window, что использует страница объекта (`viewYear` / `viewMonth0` → `month=YYYY-MM`). Не UTC-календарь сервера вслепую.

## Ошибки

- Нет прав / невалидный ввод → error toast / throw как у соседних actions.
- Частичный фейл недопустим: либо всё в одной транзакции, либо удаление смен + staff в одном client transaction.
- Если смен 0 — всё равно убрать из monthly staff и убрать строку (если она была только из staff).

## Тесты

- Unit/repo (если есть harness) или чистая функция границ месяца: смены июля не удаляются при `month=2026-08`.
- Удаление смены с `replaced_by` / replacement не оставляет висящих FK (reuse delete helper).
- Action RBAC: Accountant не может вызвать.

## Не делать

- Не менять поведение галочек «Охранники объекта» (глобально) в этом PR — только явная иконка в сетке.
- Не переназначать смены другому охраннику.
- Не требовать ручной F5.
