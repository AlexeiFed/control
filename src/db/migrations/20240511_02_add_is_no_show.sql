-- Добавление флага "Не выход на работу" для смен
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_no_show boolean NOT NULL DEFAULT false;
