-- Правила ставок: один день недели → массив дней
ALTER TABLE object_rate_rules ADD COLUMN IF NOT EXISTS days_of_week int[];

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'object_rate_rules'
      AND column_name = 'day_of_week'
  ) THEN
    UPDATE object_rate_rules
    SET days_of_week = ARRAY[day_of_week]
    WHERE day_of_week IS NOT NULL
      AND (days_of_week IS NULL OR array_length(days_of_week, 1) IS NULL);
  END IF;
END $$;

ALTER TABLE object_rate_rules DROP COLUMN IF EXISTS day_of_week;

ALTER TABLE object_rate_rules DROP CONSTRAINT IF EXISTS object_rate_rules_days_of_week_check;
ALTER TABLE object_rate_rules ADD CONSTRAINT object_rate_rules_days_of_week_check CHECK (
  days_of_week IS NULL
  OR days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::int[]
);

DROP INDEX IF EXISTS object_rate_rules_lookup_idx;
CREATE INDEX IF NOT EXISTS object_rate_rules_lookup_idx
  ON object_rate_rules (object_id, effective_from, effective_to, is_holiday, shift_kind);
