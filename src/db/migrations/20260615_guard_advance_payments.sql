-- Авансы охранникам по полупериодам (1–15 и 16–конец месяца)

CREATE TABLE IF NOT EXISTS guard_advance_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  period_month date NOT NULL,
  period_half text NOT NULL CHECK (period_half IN ('first', 'second')),
  amount_rub int NOT NULL CHECK (amount_rub > 0),
  issued_by_user_id text NOT NULL,
  issued_by_name text NOT NULL DEFAULT '',
  issued_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL DEFAULT '',
  CHECK (date_trunc('month', period_month::timestamp) = period_month)
);

CREATE INDEX IF NOT EXISTS guard_advance_payments_period_idx
  ON guard_advance_payments (period_month, period_half);

CREATE INDEX IF NOT EXISTS guard_advance_payments_guard_idx
  ON guard_advance_payments (guard_id, period_month);
