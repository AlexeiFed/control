-- Добавление новых типов усиления: дневное (8-20), обычное (по необходимости) и ГБР
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_kind_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_kind_check CHECK (shift_kind IN ('Regular', 'Reinforcement', 'ReinforcementDay', 'RapidResponse'));

ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_shift_kind_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_shift_kind_check CHECK (shift_kind IS NULL OR shift_kind IN ('Regular', 'Reinforcement', 'ReinforcementDay', 'RapidResponse'));
