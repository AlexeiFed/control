CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS security_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  operational_day_start_time time NOT NULL DEFAULT '08:00:00',
  timesheet_director_name text NOT NULL DEFAULT '',
  timesheet_director_role text NOT NULL DEFAULT '',
  timesheet_site_manager_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, address)
);

CREATE TABLE IF NOT EXISTS object_monthly_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  month text NOT NULL, -- Format: YYYY-MM
  operational_day_start_time time NOT NULL DEFAULT '08:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, month)
);

CREATE TABLE IF NOT EXISTS object_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  month text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, month, name)
);

CREATE INDEX IF NOT EXISTS object_posts_object_month_idx ON object_posts (object_id, month);

CREATE TABLE IF NOT EXISTS object_monthly_post_guards (
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES object_posts(id) ON DELETE CASCADE,
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, guard_id, month)
);

CREATE INDEX IF NOT EXISTS object_monthly_post_guards_lookup_idx
  ON object_monthly_post_guards (object_id, month);

CREATE TABLE IF NOT EXISTS guards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Sick', 'OnVacation', 'Inactive', 'Dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (first_name, last_name)
);

CREATE TABLE IF NOT EXISTS guard_object_assignments (
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guard_id, object_id)
);

CREATE TABLE IF NOT EXISTS shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);

ALTER TABLE IF EXISTS shifts
  ADD COLUMN IF NOT EXISTS total_minutes int NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS shifts
  ADD COLUMN IF NOT EXISTS month_minutes jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS shift_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  author_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL CHECK (char_length(note) > 0),
  incident_level text NOT NULL CHECK (incident_level IN ('None', 'Info', 'Warning', 'Critical'))
);

CREATE INDEX IF NOT EXISTS guards_name_idx ON guards (last_name, first_name);
CREATE INDEX IF NOT EXISTS guards_status_idx ON guards (status);
CREATE INDEX IF NOT EXISTS security_objects_name_idx ON security_objects (name);
CREATE INDEX IF NOT EXISTS shifts_guard_time_idx ON shifts (guard_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS shift_logs_shift_created_idx ON shift_logs (shift_id, created_at DESC);

-- Расширение охранников (ставки, должности, стажировка)
ALTER TABLE guards ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS position text NOT NULL DEFAULT 'Guard';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS license_type text;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS employment_type text NOT NULL DEFAULT 'Unemployed';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS is_trainee boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS trainee_until date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS has_car boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_size smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_height smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_issued boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_issued_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_condition text;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_note text;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_condition_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_condition_check
  CHECK (uniform_condition IS NULL OR uniform_condition IN ('new', 'used'));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_issued_fields_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_issued_fields_check CHECK (
  (
    uniform_issued = false
    AND uniform_issued_on IS NULL
    AND uniform_condition IS NULL
    AND uniform_note IS NULL
  )
  OR (
    uniform_issued = true
    AND uniform_issued_on IS NOT NULL
    AND uniform_condition IS NOT NULL
  )
);

ALTER TABLE guards ADD COLUMN IF NOT EXISTS medical_commission_passed_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS periodic_check_passed_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS personal_card_assigned_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS employed_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS license_grade smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS license_valid_until date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS dismissed_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS middle_name text NOT NULL DEFAULT '';

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_check;
ALTER TABLE guards ADD CONSTRAINT guards_position_check CHECK (position IN ('ShiftLead', 'Guard', 'Curator'));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_employment_type_check;
ALTER TABLE guards ADD CONSTRAINT guards_employment_type_check CHECK (employment_type IN ('Employed', 'Unemployed'));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_license_check;

UPDATE guards SET license_type = 'None' WHERE license_type IS NULL;

ALTER TABLE guards ADD CONSTRAINT guards_position_license_check CHECK (
  license_type IN ('None', 'Licensed')
);

-- Шаблон сменности объекта по дням недели
CREATE TABLE IF NOT EXISTS object_shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  shifts_per_day int NOT NULL CHECK (shifts_per_day >= 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, day_of_week, effective_from)
);

ALTER TABLE IF EXISTS object_shift_templates
  ADD COLUMN IF NOT EXISTS shifts_reinforcement_per_day int NOT NULL DEFAULT 0 CHECK (shifts_reinforcement_per_day >= 0);

ALTER TABLE IF EXISTS object_shift_templates
  ADD COLUMN IF NOT EXISTS shift_hours int NOT NULL DEFAULT 24 CHECK (shift_hours BETWEEN 1 AND 24);

ALTER TABLE IF EXISTS object_shift_templates
  ADD COLUMN IF NOT EXISTS shifts_rapid_response_per_day int NOT NULL DEFAULT 0 CHECK (shifts_rapid_response_per_day >= 0);

ALTER TABLE IF EXISTS object_shift_templates
  ADD COLUMN IF NOT EXISTS rapid_response_shift_hours int NOT NULL DEFAULT 24 CHECK (rapid_response_shift_hours BETWEEN 1 AND 24);
ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shifts_shift_lead_per_day int NOT NULL DEFAULT 0 CHECK (shifts_shift_lead_per_day >= 0);
ALTER TABLE object_shift_templates
  ADD COLUMN IF NOT EXISTS shift_lead_shift_hours int NOT NULL DEFAULT 24 CHECK (shift_lead_shift_hours BETWEEN 1 AND 24);

ALTER TABLE IF EXISTS object_shift_templates
  ADD COLUMN IF NOT EXISTS reinforcement_shift_hours int NOT NULL DEFAULT 24 CHECK (reinforcement_shift_hours BETWEEN 1 AND 24);

CREATE TABLE IF NOT EXISTS object_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, holiday_date)
);

-- Календарь праздников
CREATE TABLE IF NOT EXISTS holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Правила ставок объекта
CREATE TABLE IF NOT EXISTS object_rate_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  name text NOT NULL,
  priority int NOT NULL DEFAULT 100,
  days_of_week int[] CHECK (days_of_week IS NULL OR days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]::int[]),
  is_holiday boolean,
  shift_kind text CHECK (shift_kind IS NULL OR shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse', 'ShiftLead')),
  starts_at time,
  ends_at time,
  position text CHECK (position IS NULL OR position IN ('ShiftLead', 'Guard', 'Curator')),
  license_type text CHECK (license_type IS NULL OR license_type IN ('None', 'Licensed')),
  employment_type text CHECK (employment_type IS NULL OR employment_type IN ('Employed', 'Unemployed')),
  is_trainee boolean,
  client_rate_cents int NOT NULL CHECK (client_rate_cents >= 0),
  guard_rate_cents int NOT NULL CHECK (guard_rate_cents >= 0),
  rate_unit text NOT NULL CHECK (rate_unit IN ('Hour', 'Shift')),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Смены: вид и ручной override ставки
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_kind text NOT NULL DEFAULT 'Regular';
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_shift_kind_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_kind_check CHECK (shift_kind IN ('Regular', 'Reinforcement', 'RapidResponse', 'ShiftLead'));

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_client_rate_cents int CHECK (manual_client_rate_cents IS NULL OR manual_client_rate_cents >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_guard_rate_cents int CHECK (manual_guard_rate_cents IS NULL OR manual_guard_rate_cents >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_rate_unit text CHECK (manual_rate_unit IS NULL OR manual_rate_unit IN ('Hour', 'Shift'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_rate_reason text NOT NULL DEFAULT '';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS selected_rate_rule_id uuid NULL REFERENCES object_rate_rules(id) ON DELETE SET NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_no_show boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS object_rate_rules_lookup_idx
  ON object_rate_rules (object_id, effective_from, effective_to, is_holiday, shift_kind);

CREATE INDEX IF NOT EXISTS object_shift_templates_lookup_idx
  ON object_shift_templates (object_id, effective_from, effective_to, day_of_week);

CREATE INDEX IF NOT EXISTS shifts_object_kind_time_idx
  ON shifts (object_id, shift_kind, starts_at, ends_at);

-- Табель / отчёты: пересечение смен с календарным диапазоном (ends_at > $1 AND starts_at < $2)
CREATE INDEX IF NOT EXISTS shifts_time_overlap_idx ON shifts (starts_at, ends_at);

-- Инциденты на смене (категория, комментарий, частичная отработка, замена)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_category text NULL
  CHECK (incident_category IS NULL OR incident_category IN ('FullNoShow', 'LeftWork', 'DrunkOnDuty', 'Other'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_comment text NOT NULL DEFAULT '';
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_worked_until_at timestamptz NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_recorded_at timestamptz NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS replaced_by_shift_id uuid NULL;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS incident_alert_dismissed_at timestamptz NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'shifts_replaced_by_shift_id_fkey'
  ) THEN
    ALTER TABLE shifts
      ADD CONSTRAINT shifts_replaced_by_shift_id_fkey
      FOREIGN KEY (replaced_by_shift_id) REFERENCES shifts (id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS shifts_incident_pending_replacement_idx
  ON shifts (object_id, incident_recorded_at DESC)
  WHERE incident_recorded_at IS NOT NULL AND replaced_by_shift_id IS NULL AND incident_alert_dismissed_at IS NULL;

-- Кураторы: справочник и начисления по дням
CREATE TABLE IF NOT EXISTS curators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (first_name, last_name)
);

CREATE TABLE IF NOT EXISTS curator_work_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id uuid NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  work_type text NOT NULL CHECK (work_type IN ('RouteObjects', 'NightInspection', 'ReplacementShift')),
  hours numeric(12, 2),
  amount_rub int NOT NULL CHECK (amount_rub >= 0),
  created_by_user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curator_work_entries_hours_route CHECK (
    (work_type = 'RouteObjects' AND hours IS NOT NULL AND hours > 0)
    OR (work_type = 'NightInspection' AND hours IS NULL)
    OR (work_type = 'ReplacementShift' AND hours IS NOT NULL AND hours > 0)
  )
);

CREATE INDEX IF NOT EXISTS curators_name_idx ON curators (last_name, first_name);
CREATE INDEX IF NOT EXISTS curator_work_entries_curator_date_idx ON curator_work_entries (curator_id, work_date);
CREATE INDEX IF NOT EXISTS curator_work_entries_date_idx ON curator_work_entries (work_date);

CREATE TABLE IF NOT EXISTS curator_tariffs_settings (
  id int PRIMARY KEY CHECK (id = 1),
  route_base_rub int NOT NULL CHECK (route_base_rub >= 0),
  route_hourly_rub int NOT NULL CHECK (route_hourly_rub >= 0),
  night_inspection_rub int NOT NULL CHECK (night_inspection_rub >= 0),
  replacement_hourly_rub int NOT NULL CHECK (replacement_hourly_rub >= 0),
  schedule_regular_hourly_rub int NOT NULL DEFAULT 25 CHECK (schedule_regular_hourly_rub >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO curator_tariffs_settings (
  id,
  route_base_rub,
  route_hourly_rub,
  night_inspection_rub,
  replacement_hourly_rub,
  schedule_regular_hourly_rub
)
VALUES (1, 500, 265, 3000, 200, 25)
ON CONFLICT (id) DO NOTHING;

-- Материализованный табель смен (пересчёт при изменении смены)
CREATE TABLE IF NOT EXISTS timesheet_shift_entries (
  shift_id uuid PRIMARY KEY REFERENCES shifts(id) ON DELETE CASCADE,
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  post_id uuid NULL,
  work_date date NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  guard_name text NOT NULL,
  object_name text NOT NULL,
  post_name text NULL,
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
  guard_rate_contributions jsonb NOT NULL DEFAULT '[]'::jsonb,
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
