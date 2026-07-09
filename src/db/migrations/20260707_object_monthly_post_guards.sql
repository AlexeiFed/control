CREATE TABLE IF NOT EXISTS object_monthly_post_guards (
  object_id uuid NOT NULL REFERENCES security_objects(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES object_posts(id) ON DELETE CASCADE,
  guard_id uuid NOT NULL REFERENCES guards(id) ON DELETE CASCADE,
  month text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, guard_id, month)
);

CREATE INDEX IF NOT EXISTS object_monthly_post_guards_lookup_idx
  ON object_monthly_post_guards (object_id, month);
