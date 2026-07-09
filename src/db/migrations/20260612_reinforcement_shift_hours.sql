ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS reinforcement_shift_hours int NOT NULL DEFAULT 24
  CHECK (reinforcement_shift_hours BETWEEN 1 AND 24);
