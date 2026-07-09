ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shifts_shift_lead_per_day int NOT NULL DEFAULT 0 CHECK (shifts_shift_lead_per_day >= 0);

ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shift_lead_shift_hours int NOT NULL DEFAULT 24 CHECK (shift_lead_shift_hours BETWEEN 1 AND 24);

ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_kind_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_kind_check
  CHECK (shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse', 'ShiftLead'));
