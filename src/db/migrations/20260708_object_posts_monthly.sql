-- Посты привязаны к месяцу: изменения в июле не затрагивают июнь и табели.
ALTER TABLE object_posts ADD COLUMN IF NOT EXISTS month text;

UPDATE object_posts SET month = to_char(created_at AT TIME ZONE 'Asia/Vladivostok', 'YYYY-MM')
WHERE month IS NULL;

UPDATE object_posts SET month = to_char(CURRENT_DATE, 'YYYY-MM')
WHERE month IS NULL;

ALTER TABLE object_posts ALTER COLUMN month SET NOT NULL;

ALTER TABLE object_posts DROP CONSTRAINT IF EXISTS object_posts_object_id_name_key;
ALTER TABLE object_posts ADD CONSTRAINT object_posts_object_id_month_name_key UNIQUE (object_id, month, name);

CREATE INDEX IF NOT EXISTS object_posts_object_month_idx ON object_posts (object_id, month);
