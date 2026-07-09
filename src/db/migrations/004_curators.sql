-- Кураторы: справочник и начисления по дням (зарплата складывается из строк)
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
