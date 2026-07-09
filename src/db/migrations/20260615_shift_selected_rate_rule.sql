-- Явный выбор правила ставки для смен с нестандартным интервалом (МП и др.).

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS selected_rate_rule_id uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shifts_selected_rate_rule_id_fkey'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_selected_rate_rule_id_fkey
      FOREIGN KEY (selected_rate_rule_id) REFERENCES object_rate_rules(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shifts_selected_rate_rule_id_idx ON shifts (selected_rate_rule_id);
