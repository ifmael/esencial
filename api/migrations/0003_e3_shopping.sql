-- E3 (design D1/D2): manual shopping items per week + optional ingredient
-- section. Numbered 0003 because E2 owns 0002 (runner applies by filename).
-- Plain ALTER: the wrangler runner records this file in _cf_D1_MIGRATIONS and
-- executes it exactly once (D1 rejects ADD COLUMN IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS shopping_items (
  id           INTEGER PRIMARY KEY,
  week_plan_id INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  food         TEXT NOT NULL,
  quantity     REAL,
  unit         TEXT,
  section      TEXT,
  checked      INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE recipe_ingredients ADD COLUMN section TEXT;
