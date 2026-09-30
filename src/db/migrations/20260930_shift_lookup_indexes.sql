-- Пересечение смен с окном: object_id + starts_at (фильтр ends_at остаточный).
-- Старый shifts_object_kind_time_idx начинается с shift_kind и для этих запросов не подходит.
CREATE INDEX IF NOT EXISTS shifts_object_starts_at_idx
  ON shifts (object_id, starts_at);

CREATE INDEX IF NOT EXISTS shifts_guard_starts_at_idx
  ON shifts (guard_id, starts_at);

-- Журнал: последние записи без фильтра по shift_id.
CREATE INDEX IF NOT EXISTS shift_logs_created_at_idx
  ON shift_logs (created_at DESC);
