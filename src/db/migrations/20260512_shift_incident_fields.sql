-- Инциденты на смене: категория, комментарий, частичная отработка, замена, глобальные напоминания о незакрытой замене
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_category text NULL
  CHECK (incident_category IS NULL OR incident_category IN ('FullNoShow', 'LeftWork', 'DrunkOnDuty', 'Other'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_comment text NOT NULL DEFAULT '';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_worked_until_at timestamptz NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_recorded_at timestamptz NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS replaced_by_shift_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shifts_replaced_by_shift_id_fkey'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_replaced_by_shift_id_fkey
      FOREIGN KEY (replaced_by_shift_id) REFERENCES shifts (id) ON DELETE SET NULL;
  END IF;
END $$;
