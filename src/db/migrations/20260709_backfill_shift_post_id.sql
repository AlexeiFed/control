-- Смены, созданные до post_id, привязываем к первому посту объекта за месяц операционной даты.
UPDATE shifts s
SET post_id = first_post.id
FROM (
  SELECT DISTINCT ON (op.object_id, op.month)
    op.object_id,
    op.month,
    op.id
  FROM object_posts op
  ORDER BY op.object_id, op.month, op.created_at ASC
) first_post
WHERE s.post_id IS NULL
  AND first_post.object_id = s.object_id
  AND first_post.month = to_char((s.starts_at AT TIME ZONE 'Asia/Vladivostok')::date, 'YYYY-MM');
