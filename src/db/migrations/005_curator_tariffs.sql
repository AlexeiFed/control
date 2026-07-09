-- Глобальные ставки начислений кураторов (одна строка id = 1)
CREATE TABLE IF NOT EXISTS curator_tariffs_settings (
  id int PRIMARY KEY CHECK (id = 1),
  route_base_rub int NOT NULL CHECK (route_base_rub >= 0),
  route_hourly_rub int NOT NULL CHECK (route_hourly_rub >= 0),
  night_inspection_rub int NOT NULL CHECK (night_inspection_rub >= 0),
  replacement_hourly_rub int NOT NULL CHECK (replacement_hourly_rub >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO curator_tariffs_settings (id, route_base_rub, route_hourly_rub, night_inspection_rub, replacement_hourly_rub)
VALUES (1, 500, 265, 3000, 200)
ON CONFLICT (id) DO NOTHING;
