-- Отметка «Аванс учтён»: пока стоит, выдачу нельзя удалить.
ALTER TABLE guard_advance_payments
  ADD COLUMN IF NOT EXISTS accounted_at timestamptz NULL;
