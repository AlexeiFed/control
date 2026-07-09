ALTER TABLE guards ADD COLUMN IF NOT EXISTS periodic_check_passed_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS personal_card_assigned_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS employed_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS license_grade smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS license_valid_until date;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_size_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_size_check
  CHECK (uniform_size IS NULL OR (uniform_size >= 44 AND uniform_size <= 70));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_license_grade_check;
ALTER TABLE guards ADD CONSTRAINT guards_license_grade_check
  CHECK (license_grade IS NULL OR license_grade IN (4, 5, 6));
