-- Выдача поло: размер и дата, отдельно от комплекта формы и футболки.
ALTER TABLE guards ADD COLUMN IF NOT EXISTS polo_issued boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS polo_size smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS polo_issued_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS polo_returned_on date;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_polo_size_check;
ALTER TABLE guards ADD CONSTRAINT guards_polo_size_check
  CHECK (
    polo_size IS NULL
    OR (polo_size >= 1 AND polo_size <= 7)
    OR (polo_size >= 44 AND polo_size <= 70)
  );

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_polo_issued_fields_check;
ALTER TABLE guards ADD CONSTRAINT guards_polo_issued_fields_check CHECK (
  (
    polo_issued = false
    AND polo_size IS NULL
    AND polo_issued_on IS NULL
  )
  OR (
    polo_issued = true
    AND polo_size IS NOT NULL
    AND polo_issued_on IS NOT NULL
    AND polo_returned_on IS NULL
  )
);
