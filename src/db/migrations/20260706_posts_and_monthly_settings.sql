-- src/db/migrations/20260706_posts_and_monthly_settings.sql
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
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (object_id, name)
);

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL;
ALTER TABLE object_shift_templates ADD COLUMN IF NOT EXISTS post_id uuid NULL REFERENCES object_posts(id) ON DELETE SET NULL;

ALTER TABLE timesheet_shift_entries ADD COLUMN IF NOT EXISTS post_id uuid NULL;
ALTER TABLE timesheet_shift_entries ADD COLUMN IF NOT EXISTS post_name text NULL;
