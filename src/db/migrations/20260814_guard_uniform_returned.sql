-- Сдача формы: факт отдельно от выдачи. В реестре снова «нет».
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_returned_on date;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_issued_fields_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_issued_fields_check CHECK (
  (
    uniform_issued = false
    AND uniform_issued_on IS NULL
    AND uniform_condition IS NULL
    AND uniform_note IS NULL
  )
  OR (
    uniform_issued = true
    AND uniform_issued_on IS NOT NULL
    AND uniform_condition IS NOT NULL
    AND uniform_returned_on IS NULL
  )
);
