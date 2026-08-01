-- Уникальность версии шаблона с учётом поста (NULL = шаблон объекта без постов).
ALTER TABLE object_shift_templates
  DROP CONSTRAINT IF EXISTS object_shift_templates_object_id_day_of_week_effective_from_key;

DROP INDEX IF EXISTS object_shift_templates_object_id_day_of_week_effective_from_key;

CREATE UNIQUE INDEX IF NOT EXISTS object_shift_templates_object_post_dow_from_uidx
  ON object_shift_templates (
    object_id,
    COALESCE(post_id, '00000000-0000-0000-0000-000000000000'::uuid),
    day_of_week,
    effective_from
  );
