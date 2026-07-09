-- Слияние устаревшего типа дневного усиления в общее «Усиление»; убираем ReinforcementDay из домена.
UPDATE shifts SET shift_kind = 'Reinforcement' WHERE shift_kind = 'ReinforcementDay';
UPDATE object_rate_rules SET shift_kind = 'Reinforcement' WHERE shift_kind = 'ReinforcementDay';

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_kind_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_kind_check CHECK (shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse'));

ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_shift_kind_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_shift_kind_check CHECK (shift_kind IS NULL OR shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse'));
