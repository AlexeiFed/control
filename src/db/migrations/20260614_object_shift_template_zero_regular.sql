-- Разрешить объекты только с МП/усилением без обычных смен (shifts_per_day = 0).

ALTER TABLE object_shift_templates DROP CONSTRAINT IF EXISTS object_shift_templates_shifts_per_day_check;

ALTER TABLE object_shift_templates
  ADD CONSTRAINT object_shift_templates_shifts_per_day_check CHECK (shifts_per_day >= 0);
