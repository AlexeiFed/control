-- Аванс привязан к одному объекту: иначе ведомость дублирует сумму на всех объектах охранника.

ALTER TABLE guard_advance_payments
  ADD COLUMN IF NOT EXISTS object_id uuid REFERENCES security_objects(id) ON DELETE RESTRICT;

-- Существующие выдачи: объект с максимальным начислением за тот же полупериод.
WITH ranked AS (
  SELECT
    a.id AS advance_id,
    t.object_id,
    ROW_NUMBER() OVER (
      PARTITION BY a.id
      ORDER BY SUM(t.guard_amount_cents) DESC, t.object_id
    ) AS rn
  FROM guard_advance_payments a
  JOIN timesheet_shift_entries t
    ON t.guard_id = a.guard_id
   AND date_trunc('month', t.work_date)::date = a.period_month
   AND (
     (a.period_half = 'first' AND EXTRACT(DAY FROM t.work_date) BETWEEN 1 AND 15)
     OR (a.period_half = 'second' AND EXTRACT(DAY FROM t.work_date) >= 16)
   )
  WHERE a.object_id IS NULL
  GROUP BY a.id, t.object_id
)
UPDATE guard_advance_payments a
SET object_id = ranked.object_id
FROM ranked
WHERE a.id = ranked.advance_id
  AND ranked.rn = 1
  AND a.object_id IS NULL;

-- Нет смен в полупериоде — первое назначение охранника.
UPDATE guard_advance_payments a
SET object_id = sub.object_id
FROM (
  SELECT DISTINCT ON (guard_id) guard_id, object_id
  FROM guard_object_assignments
  ORDER BY guard_id, object_id
) sub
WHERE a.object_id IS NULL
  AND a.guard_id = sub.guard_id;

-- Остаток — любой объект, чтобы колонка могла стать NOT NULL.
UPDATE guard_advance_payments
SET object_id = (SELECT id FROM security_objects ORDER BY name LIMIT 1)
WHERE object_id IS NULL
  AND EXISTS (SELECT 1 FROM security_objects);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM guard_advance_payments WHERE object_id IS NULL
  ) THEN
    ALTER TABLE guard_advance_payments
      ALTER COLUMN object_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS guard_advance_payments_object_idx
  ON guard_advance_payments (object_id, period_month);
