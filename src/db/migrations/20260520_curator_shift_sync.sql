-- Синхронизация смен кураторов (position = Curator) с журналом начислений

ALTER TABLE curators
  ADD COLUMN IF NOT EXISTS guard_id uuid UNIQUE REFERENCES guards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS curators_guard_id_idx ON curators (guard_id) WHERE guard_id IS NOT NULL;

ALTER TABLE curator_work_entries
  ADD COLUMN IF NOT EXISTS shift_id uuid UNIQUE REFERENCES shifts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS object_id uuid REFERENCES security_objects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS payment_formula text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS rule_name text,
  ADD COLUMN IF NOT EXISTS object_hourly_rate_rub numeric(12, 2),
  ADD COLUMN IF NOT EXISTS is_admin_locked boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS curator_work_entries_shift_id_idx ON curator_work_entries (shift_id)
  WHERE shift_id IS NOT NULL;

ALTER TABLE curator_work_entries DROP CONSTRAINT IF EXISTS curator_work_entries_work_type_check;

ALTER TABLE curator_work_entries ADD CONSTRAINT curator_work_entries_work_type_check CHECK (
  work_type IN (
    'RouteObjects',
    'NightInspection',
    'ReplacementShift',
    'MonthlySalary',
    'ScheduleRegular',
    'ScheduleReinforcement',
    'ScheduleRapidResponse'
  )
);

ALTER TABLE curator_work_entries DROP CONSTRAINT IF EXISTS curator_work_entries_hours_route;

ALTER TABLE curator_work_entries DROP CONSTRAINT IF EXISTS curator_work_entries_hours_check;

ALTER TABLE curator_work_entries ADD CONSTRAINT curator_work_entries_hours_check CHECK (
  (work_type = 'RouteObjects' AND hours IS NOT NULL AND hours > 0)
  OR (work_type = 'NightInspection' AND hours IS NULL)
  OR (work_type = 'ReplacementShift' AND hours IS NOT NULL AND hours > 0)
  OR (work_type = 'MonthlySalary' AND hours IS NULL)
  OR (work_type IN ('ScheduleRegular', 'ScheduleReinforcement', 'ScheduleRapidResponse') AND hours IS NOT NULL AND hours > 0)
);
