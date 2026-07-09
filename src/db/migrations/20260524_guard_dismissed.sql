ALTER TABLE guards ADD COLUMN IF NOT EXISTS dismissed_on date;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_status_check;
ALTER TABLE guards ADD CONSTRAINT guards_status_check
  CHECK (status IN ('Active', 'Sick', 'OnVacation', 'Inactive', 'Dismissed'));
