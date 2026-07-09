-- Выплаты кураторам по месяцам и произвольный оклад в начислении маршрута

ALTER TABLE curator_work_entries
  ADD COLUMN IF NOT EXISTS custom_base_rub int CHECK (custom_base_rub IS NULL OR custom_base_rub >= 0);

CREATE TABLE IF NOT EXISTS curator_monthly_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  curator_id uuid NOT NULL REFERENCES curators(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  is_paid boolean NOT NULL DEFAULT false,
  paid_amount_rub int NOT NULL DEFAULT 0 CHECK (paid_amount_rub >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (curator_id, period_month),
  CHECK (date_trunc('month', period_month::timestamp) = period_month)
);

CREATE INDEX IF NOT EXISTS curator_monthly_payments_period_idx
  ON curator_monthly_payments (period_month);
