-- Тот же полный снимок, что schema.sql. Нужен для БД, где в schema_migrations уже записана старая урезанная 001/002 — они пропускаются, а эта миграция догоняет схему.
-- Меняя схему — правь schema.sql и 001_local_schema_gaps.sql + этот файл (контент должен совпадать).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS security_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, address)
);

CREATE TABLE IF NOT EXISTS guards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL,
  last_name text NOT NULL,
  status text NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Sick', 'OnVacation', 'Inactive')),
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

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_check;
ALTER TABLE guards ADD CONSTRAINT guards_position_check CHECK (position IN ('ShiftLead', 'Guard'));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_employment_type_check;
ALTER TABLE guards ADD CONSTRAINT guards_employment_type_check CHECK (employment_type IN ('Employed', 'Unemployed'));

UPDATE guards SET license_type = 'None' WHERE license_type IS NULL AND position = 'Guard';

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_position_license_check;
ALTER TABLE guards ADD CONSTRAINT guards_position_license_check CHECK (
  (position = 'ShiftLead' AND license_type IS NULL)
  OR (position = 'Guard' AND license_type IN ('None', 'Licensed'))
);

-- Шаблон сменности объекта по дням недели
CREATE TABLE IF NOT EXISTS object_shift_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  shifts_per_day int NOT NULL CHECK (shifts_per_day > 0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, day_of_week, effective_from)
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
  day_of_week int CHECK (day_of_week IS NULL OR day_of_week BETWEEN 1 AND 7),
  is_holiday boolean,
  shift_kind text CHECK (shift_kind IS NULL OR shift_kind IN ('Regular', 'Reinforcement')),
  starts_at time,
  ends_at time,
  position text CHECK (position IS NULL OR position IN ('ShiftLead', 'Guard')),
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
ALTER TABLE shifts ADD CONSTRAINT shifts_shift_kind_check CHECK (shift_kind IN ('Regular', 'Reinforcement'));

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_client_rate_cents int CHECK (manual_client_rate_cents IS NULL OR manual_client_rate_cents >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_guard_rate_cents int CHECK (manual_guard_rate_cents IS NULL OR manual_guard_rate_cents >= 0);
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_rate_unit text CHECK (manual_rate_unit IS NULL OR manual_rate_unit IN ('Hour', 'Shift'));
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS manual_rate_reason text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS object_rate_rules_lookup_idx
  ON object_rate_rules (object_id, effective_from, effective_to, day_of_week, is_holiday, shift_kind);

CREATE INDEX IF NOT EXISTS object_shift_templates_lookup_idx
  ON object_shift_templates (object_id, effective_from, effective_to, day_of_week);

CREATE INDEX IF NOT EXISTS shifts_object_kind_time_idx
  ON shifts (object_id, shift_kind, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS shifts_time_overlap_idx ON shifts (starts_at, ends_at);

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
