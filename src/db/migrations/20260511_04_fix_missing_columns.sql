-- Восстановление отсутствующих колонок, которые требуются для работы страниц Объекты и Графики
-- Эти колонки были в schema.sql, но отсутствуют на сервере

-- 1. Добавление колонки description в security_objects
ALTER TABLE security_objects 
ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';

-- 2. Добавление колонки shifts_reinforcement_per_day в object_shift_templates
ALTER TABLE object_shift_templates 
ADD COLUMN IF NOT EXISTS shifts_reinforcement_per_day int NOT NULL DEFAULT 0 CHECK (shifts_reinforcement_per_day >= 0);
