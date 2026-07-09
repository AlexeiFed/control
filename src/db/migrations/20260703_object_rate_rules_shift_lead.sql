-- Тип смены «Старший смены» в правилах ставок (как в shifts).
ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_shift_kind_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_shift_kind_check
  CHECK (shift_kind IS NULL OR shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse', 'ShiftLead'));
