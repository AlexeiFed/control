-- Периоды профиля охранника: должность, трудоустройство, стажировка, удостоверение

CREATE TABLE IF NOT EXISTS guard_profile_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  period_kind text NOT NULL CHECK (period_kind IN ('position', 'employment', 'trainee', 'license')),
  effective_from date NOT NULL,
  effective_to date,
  position text CHECK (position IS NULL OR position IN ('ShiftLead', 'Guard', 'Curator')),
  employment_type text CHECK (employment_type IS NULL OR employment_type IN ('Employed', 'Unemployed')),
  is_trainee boolean,
  trainee_until date,
  license_type text CHECK (license_type IS NULL OR license_type IN ('None', 'Licensed')),
  note text NOT NULL DEFAULT '',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (
    (period_kind = 'position' AND position IS NOT NULL
      AND employment_type IS NULL AND is_trainee IS NULL AND trainee_until IS NULL AND license_type IS NULL)
    OR (period_kind = 'employment' AND employment_type IS NOT NULL
      AND position IS NULL AND is_trainee IS NULL AND trainee_until IS NULL AND license_type IS NULL)
    OR (period_kind = 'trainee' AND is_trainee IS NOT NULL
      AND position IS NULL AND employment_type IS NULL AND license_type IS NULL)
    OR (period_kind = 'license' AND license_type IS NOT NULL
      AND position IS NULL AND employment_type IS NULL AND is_trainee IS NULL AND trainee_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS guard_profile_periods_guard_kind_from_idx
  ON guard_profile_periods (guard_id, period_kind, effective_from DESC);

-- Сид из текущих полей guards (только если таблица пуста)
INSERT INTO guard_profile_periods (guard_id, period_kind, effective_from, position)
SELECT g.id, 'position', COALESCE(g.employed_on, DATE '2020-01-01'), COALESCE(g.position, 'Guard')
FROM guards g
WHERE NOT EXISTS (SELECT 1 FROM guard_profile_periods p WHERE p.guard_id = g.id AND p.period_kind = 'position');

INSERT INTO guard_profile_periods (guard_id, period_kind, effective_from, employment_type)
SELECT g.id, 'employment', COALESCE(g.employed_on, DATE '2020-01-01'), COALESCE(g.employment_type, 'Unemployed')
FROM guards g
WHERE NOT EXISTS (SELECT 1 FROM guard_profile_periods p WHERE p.guard_id = g.id AND p.period_kind = 'employment');

INSERT INTO guard_profile_periods (guard_id, period_kind, effective_from, is_trainee, trainee_until)
SELECT g.id, 'trainee', COALESCE(g.employed_on, DATE '2020-01-01'), COALESCE(g.is_trainee, false), g.trainee_until
FROM guards g
WHERE NOT EXISTS (SELECT 1 FROM guard_profile_periods p WHERE p.guard_id = g.id AND p.period_kind = 'trainee');

INSERT INTO guard_profile_periods (guard_id, period_kind, effective_from, license_type)
SELECT g.id, 'license', COALESCE(g.employed_on, DATE '2020-01-01'), COALESCE(g.license_type, 'None')
FROM guards g
WHERE NOT EXISTS (SELECT 1 FROM guard_profile_periods p WHERE p.guard_id = g.id AND p.period_kind = 'license');
