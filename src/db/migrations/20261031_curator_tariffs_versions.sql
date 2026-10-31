-- Версии ставок кураторов: смена ставок с выбранной даты без затрагивания прошлого периода.
CREATE TABLE IF NOT EXISTS curator_tariffs_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from date NOT NULL,
  effective_to date,
  route_base_rub int NOT NULL CHECK (route_base_rub >= 0),
  route_hourly_rub int NOT NULL CHECK (route_hourly_rub >= 0),
  night_inspection_rub int NOT NULL CHECK (night_inspection_rub >= 0),
  replacement_hourly_rub int NOT NULL CHECK (replacement_hourly_rub >= 0),
  schedule_regular_hourly_rub int NOT NULL DEFAULT 25 CHECK (schedule_regular_hourly_rub >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT curator_tariffs_versions_period_chk CHECK (
    effective_to IS NULL OR effective_to >= effective_from
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS curator_tariffs_versions_open_uidx
  ON curator_tariffs_versions ((1))
  WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS curator_tariffs_versions_from_idx
  ON curator_tariffs_versions (effective_from);

-- Сид из текущих глобальных настроек (одна открытая версия с ранней даты).
INSERT INTO curator_tariffs_versions (
  effective_from,
  effective_to,
  route_base_rub,
  route_hourly_rub,
  night_inspection_rub,
  replacement_hourly_rub,
  schedule_regular_hourly_rub
)
SELECT
  DATE '2020-01-01',
  NULL,
  s.route_base_rub,
  s.route_hourly_rub,
  s.night_inspection_rub,
  s.replacement_hourly_rub,
  s.schedule_regular_hourly_rub
FROM curator_tariffs_settings s
WHERE s.id = 1
  AND NOT EXISTS (SELECT 1 FROM curator_tariffs_versions LIMIT 1);

INSERT INTO curator_tariffs_versions (
  effective_from,
  effective_to,
  route_base_rub,
  route_hourly_rub,
  night_inspection_rub,
  replacement_hourly_rub,
  schedule_regular_hourly_rub
)
SELECT
  DATE '2020-01-01',
  NULL,
  500,
  265,
  3000,
  200,
  25
WHERE NOT EXISTS (SELECT 1 FROM curator_tariffs_versions LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM curator_tariffs_settings WHERE id = 1);
