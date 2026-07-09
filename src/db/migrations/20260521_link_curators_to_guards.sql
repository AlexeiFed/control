-- Связь журнала кураторов с охранниками (должность Curator). Начисления curator_id не трогаем.

ALTER TABLE curators
  ADD COLUMN IF NOT EXISTS guard_id uuid UNIQUE REFERENCES guards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS curators_guard_id_idx ON curators (guard_id) WHERE guard_id IS NOT NULL;

UPDATE curators c
SET guard_id = g.id
FROM guards g
WHERE g.position = 'Curator'
  AND c.guard_id IS NULL
  AND lower(trim(c.first_name)) = lower(trim(g.first_name))
  AND lower(trim(c.last_name)) = lower(trim(g.last_name));

INSERT INTO curators (first_name, last_name, guard_id)
SELECT g.first_name, g.last_name, g.id
FROM guards g
WHERE g.position = 'Curator'
  AND NOT EXISTS (SELECT 1 FROM curators c WHERE c.guard_id = g.id);
