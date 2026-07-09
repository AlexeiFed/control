ALTER TABLE curator_tariffs_settings
  ADD COLUMN IF NOT EXISTS schedule_regular_hourly_rub int;

UPDATE curator_tariffs_settings
SET schedule_regular_hourly_rub = 25
WHERE schedule_regular_hourly_rub IS NULL;

ALTER TABLE curator_tariffs_settings
  ALTER COLUMN schedule_regular_hourly_rub SET DEFAULT 25;

ALTER TABLE curator_tariffs_settings
  ALTER COLUMN schedule_regular_hourly_rub SET NOT NULL;

ALTER TABLE curator_tariffs_settings DROP CONSTRAINT IF EXISTS curator_tariffs_settings_schedule_regular_hourly_rub_check;
ALTER TABLE curator_tariffs_settings ADD CONSTRAINT curator_tariffs_settings_schedule_regular_hourly_rub_check CHECK (
  schedule_regular_hourly_rub >= 0
);
