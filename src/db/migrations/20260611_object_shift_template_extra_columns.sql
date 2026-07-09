-- Колонки шаблона смен, которые есть в schema.sql, но отсутствовали на сервере после 20260511_04
ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shift_hours int NOT NULL DEFAULT 24 CHECK (shift_hours BETWEEN 1 AND 24);

ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shifts_rapid_response_per_day int NOT NULL DEFAULT 0
  CHECK (shifts_rapid_response_per_day >= 0);

ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS rapid_response_shift_hours int NOT NULL DEFAULT 24
  CHECK (rapid_response_shift_hours BETWEEN 1 AND 24);
