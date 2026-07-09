ALTER TABLE guards ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_size smallint;
ALTER TABLE guards ADD COLUMN IF NOT EXISTS uniform_height smallint;

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_size_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_size_check
  CHECK (uniform_size IS NULL OR (uniform_size >= 44 AND uniform_size <= 60));

ALTER TABLE guards DROP CONSTRAINT IF EXISTS guards_uniform_height_check;
ALTER TABLE guards ADD CONSTRAINT guards_uniform_height_check
  CHECK (uniform_height IS NULL OR (uniform_height >= 150 AND uniform_height <= 220));
