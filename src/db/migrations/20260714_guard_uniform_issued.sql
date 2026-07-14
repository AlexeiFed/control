-- Выдача формы охраннику (факт отдельно от размера/роста).
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_issued boolean NOT NULL DEFAULT false;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_issued_on date;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_condition text;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_note text;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_condition_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_condition_check
  CHECK (uniform_condition IS NULL OR uniform_condition IN ('new', 'used'));

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
  )
);
