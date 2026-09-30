-- Esencial schema v1 (OpenSpec change e1-data-model design D3, ported for D1 in CM1).
-- Idempotent bootstrap: every statement is CREATE TABLE IF NOT EXISTS.
-- No PRAGMAs: D1 manages WAL/journal itself. NOTE: additive changes now live in
-- api/migrations/ and apply with `pnpm db:migrate:local` (wrangler d1 migrations).

CREATE TABLE IF NOT EXISTS recipes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  servings    INTEGER
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  food      TEXT NOT NULL,
  quantity  REAL,
  unit      TEXT
);

CREATE TABLE IF NOT EXISTS recipe_steps (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  text      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS recipe_materials (
  id        INTEGER PRIMARY KEY,
  recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exercises (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  description   TEXT,
  setup_cues    TEXT,
  technique_url TEXT,
  -- 'strength' | 'running' | 'bike'; el cardio usa distance/duration, no series.
  kind          TEXT NOT NULL DEFAULT 'strength'
);

CREATE TABLE IF NOT EXISTS exercise_tags (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (exercise_id, tag)
);

-- Segundo nivel de la taxonomía muscular: la región del mapa anatómico que
-- trabaja el ejercicio, más fina que su grupo (`exercise_tags`), con su grado
-- de implicación (principal, secundario o estabilizador; 0014).
CREATE TABLE IF NOT EXISTS exercise_regions (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  region      TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'primary' CHECK (role IN ('primary', 'secondary', 'stabilizer')),
  PRIMARY KEY (exercise_id, region)
);

CREATE TABLE IF NOT EXISTS session_templates (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS template_exercises (
  id                  INTEGER PRIMARY KEY,
  template_id         INTEGER NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
  exercise_id         INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position            INTEGER NOT NULL,
  target_sets         INTEGER,
  target_reps_min     INTEGER,
  target_reps_max     INTEGER,
  target_distance_km  REAL,
  target_duration_min INTEGER,
  UNIQUE (template_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS week_plans (
  id       INTEGER PRIMARY KEY,
  iso_week TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS meal_slots (
  id            INTEGER PRIMARY KEY,
  week_plan_id  INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  day           INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  meal          TEXT NOT NULL CHECK (meal IN ('desayuno', 'almuerzo', 'cena')),
  recipe_id     INTEGER REFERENCES recipes(id) ON DELETE RESTRICT,
  UNIQUE (day, meal, week_plan_id)
);

CREATE TABLE IF NOT EXISTS plan_sessions (
  id     INTEGER PRIMARY KEY,
  date   TEXT NOT NULL UNIQUE,
  name   TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'logged'))
);

CREATE TABLE IF NOT EXISTS plan_session_exercises (
  id                  INTEGER PRIMARY KEY,
  plan_session_id     INTEGER NOT NULL REFERENCES plan_sessions(id) ON DELETE CASCADE,
  exercise_id         INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position            INTEGER NOT NULL,
  target_sets         INTEGER,
  target_reps_min     INTEGER,
  target_reps_max     INTEGER,
  target_distance_km  REAL,
  target_duration_min INTEGER,
  UNIQUE (plan_session_id, exercise_id)
);

CREATE TABLE IF NOT EXISTS workout_logs (
  id              INTEGER PRIMARY KEY,
  plan_session_id INTEGER NOT NULL UNIQUE REFERENCES plan_sessions(id) ON DELETE RESTRICT,
  date            TEXT NOT NULL,
  effort          INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
  note            TEXT
);

CREATE TABLE IF NOT EXISTS set_logs (
  id                       INTEGER PRIMARY KEY,
  workout_log_id           INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises(id) ON DELETE RESTRICT,
  set_index                INTEGER NOT NULL,
  weight_kg                REAL,
  reps                     INTEGER,
  done                     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS cardio_logs (
  id                       INTEGER PRIMARY KEY,
  workout_log_id           INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises(id) ON DELETE RESTRICT,
  distance_km              REAL,
  duration_min             INTEGER,
  done                     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workout_log_id, plan_session_exercise_id)
);

-- One editable note per day: date is the PK (implicitly UNIQUE).
CREATE TABLE IF NOT EXISTS day_notes (
  date TEXT PRIMARY KEY,
  text TEXT
);
