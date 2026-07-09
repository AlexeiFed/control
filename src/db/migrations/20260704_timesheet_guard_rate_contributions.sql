ALTER TABLE timesheet_shift_entries
  ADD COLUMN IF NOT EXISTS guard_rate_contributions jsonb NOT NULL DEFAULT '[]'::jsonb;
