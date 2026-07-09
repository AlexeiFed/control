-- Буквенные размеры формы: коды 1–7; числовые — 44–70.
ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_size_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_size_check
  CHECK (
    uniform_size IS NULL
    OR (uniform_size >= 1 AND uniform_size <= 7)
    OR (uniform_size >= 44 AND uniform_size <= 70)
  );
