ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shifts_senior_guard_per_day int NOT NULL DEFAULT 0 CHECK (shifts_senior_guard_per_day >= 0);

ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS senior_guard_shift_hours int NOT NULL DEFAULT 24 CHECK (senior_guard_shift_hours BETWEEN 1 AND 24);

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_kind_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_kind_check
  CHECK (shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse', 'ShiftLead', 'SeniorGuard'));

ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_shift_kind_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_shift_kind_check
  CHECK (shift_kind IS NULL OR shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse', 'ShiftLead', 'SeniorGuard'));
