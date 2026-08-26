-- Отметка «Учтено» в журнале смен.
ALTER TABLE shift_logs
  ADD COLUMN IF NOT EXISTS accounted_at timestamptz NULL;
