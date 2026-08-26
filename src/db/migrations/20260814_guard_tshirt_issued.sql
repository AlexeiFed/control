-- Выдача футболки: размер и дата, отдельно от комплекта формы.
ALTER TABLE guards ADD COLUMN IF NOT EXISTS tshirt_issued boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS tshirt_size smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS tshirt_issued_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS tshirt_returned_on date;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_tshirt_size_check;
ALTER TABLE guards ADD CONSTRAINT guards_tshirt_size_check
  CHECK (
    tshirt_size IS NULL
    OR (tshirt_size >= 1 AND tshirt_size <= 7)
    OR (tshirt_size >= 44 AND tshirt_size <= 70)
  );

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_tshirt_issued_fields_check;
ALTER TABLE guards ADD CONSTRAINT guards_tshirt_issued_fields_check CHECK (
  (
    tshirt_issued = false
    AND tshirt_size IS NULL
    AND tshirt_issued_on IS NULL
  )
  OR (
    tshirt_issued = true
    AND tshirt_size IS NOT NULL
    AND tshirt_issued_on IS NOT NULL
    AND tshirt_returned_on IS NULL
  )
);
