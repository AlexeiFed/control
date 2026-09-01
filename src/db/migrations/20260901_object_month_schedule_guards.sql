-- Штат графика за месяц без привязки к постам. Не трогает смены и object_monthly_post_guards.
CREATE TABLE IF NOT EXISTS object_month_schedule_guards (
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (object_id, month, guard_id)
);

CREATE INDEX IF NOT EXISTS object_month_schedule_guards_lookup_idx
  ON object_month_schedule_guards (object_id, month);
