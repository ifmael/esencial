-- E2 recetario: nullable photo_path on recipes + recipe_tags junction.
-- Apply exactly once via `wrangler d1 migrations apply esencial` (runner
-- bookkeeping in _cf_D1_MIGRATIONS is the idempotency mechanism on D1; plain
-- ALTER ADD COLUMN is not repeatable). schema.sql stays the v1 baseline.
ALTER TABLE recipes ADD COLUMN photo_path TEXT;

CREATE TABLE IF NOT EXISTS recipe_tags (
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  tag       TEXT NOT NULL,
  PRIMARY KEY (recipe_id, tag)
);
