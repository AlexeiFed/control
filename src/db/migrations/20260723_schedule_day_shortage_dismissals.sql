CREATE TABLE IF NOT EXISTS schedule_day_shortage_dismissals (
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  date_iso date NOT NULL,
  fingerprint text NOT NULL,
  dismissed_by text NOT NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, date_iso)
);

CREATE INDEX IF NOT EXISTS schedule_day_shortage_dismissals_date_idx
  ON schedule_day_shortage_dismissals (date_iso);
