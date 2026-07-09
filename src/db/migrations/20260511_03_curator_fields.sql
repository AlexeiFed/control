-- Миграция для добавления возможности редактирования и новых полей в начисления кураторов
-- 1. Возможность редактировать уже внесенные записи (is_base_included, custom_hourly_rate)
-- 2. При типе работы "Выход на маршрут по объектам" - возможность решать прибавлять базу или нет
-- 3. При типе работы "Замена охранника в смене" - возможность изменять ставку за час

ALTER TABLE curator_work_entries 
ADD COLUMN IF NOT EXISTS is_base_included BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS custom_hourly_rate NUMERIC;

-- Добавляем колонку updated_at если её нет
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='curator_work_entries' AND column_name='updated_at') THEN
        ALTER TABLE curator_work_entries ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
    END IF;
END $$;
