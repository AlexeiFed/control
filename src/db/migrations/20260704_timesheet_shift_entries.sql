-- Материализованные строки табеля: пересчитываются при назначении/изменении смены.

CREATE TABLE IF NOT EXISTS timesheet_shift_entries (
  shift_id uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  guard_name text NOT NULL,
  object_name text NOT NULL,
  shift_kind text NOT NULL,
  total_hours numeric(8, 2) NOT NULL,
  night_hours numeric(8, 2) NOT NULL,
  holiday_hours numeric(8, 2) NOT NULL,
  regular_hours numeric(8, 2) NOT NULL,
  reinforcement_hours numeric(8, 2) NOT NULL,
  rapid_response_hours numeric(8, 2) NOT NULL,
  unworked_hours numeric(8, 2) NOT NULL,
  client_amount_cents int NOT NULL,
  guard_amount_cents int NOT NULL,
  margin_cents int NOT NULL,
  unpriced boolean NOT NULL DEFAULT false,
  is_no_show boolean NOT NULL DEFAULT false,
  incidents_count int NOT NULL DEFAULT 0,
  attendance_incident jsonb,
  incident_log_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computation_version int NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS timesheet_shift_entries_work_date_idx
  ON timesheet_shift_entries (work_date);

CREATE INDEX IF NOT EXISTS timesheet_shift_entries_guard_date_idx
  ON timesheet_shift_entries (guard_id, work_date);

CREATE INDEX IF NOT EXISTS timesheet_shift_entries_object_date_idx
  ON timesheet_shift_entries (object_id, work_date);

CREATE INDEX IF NOT EXISTS timesheet_shift_entries_range_idx
  ON timesheet_shift_entries (starts_at, ends_at);
