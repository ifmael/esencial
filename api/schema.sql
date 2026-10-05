-- Esencial schema v1 (OpenSpec change e1-data-model design D3, ported for D1 in CM1).
-- Idempotent bootstrap: every statement is CREATE TABLE IF NOT EXISTS.
-- No PRAGMAs: D1 manages WAL/journal itself. NOTE: additive changes now live in
-- api/migrations/ and apply with `pnpm db:migrate:local` (wrangler d1 migrations).

-- Multi-usuario (0019). La identidad la prueba Cloudflare Access en el borde:
-- sin password_hash. `recipes.owner_id` NULL = catálogo; la visibilidad de
-- familia es derivada (owner_id ∈ mi familia), así que no hay columna de familia.
CREATE TABLE IF NOT EXISTS families (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  -- Nombre de perfil (0021): lo teclea la persona, NULL mientras no lo ponga.
  name       TEXT,
  family_id  INTEGER NOT NULL REFERENCES families(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Una fila por objeto subido a R2: de quién es la key (la foto se sube antes de
-- que exista la receta que la va a usar, así que la propiedad no se deriva).
CREATE TABLE IF NOT EXISTS uploads (
  key           TEXT PRIMARY KEY,
  owner_user_id INTEGER NOT NULL REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recipes (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  servings    INTEGER,
  -- NULL = catálogo (solo lo escribe el admin). Con dueño, lo ve y lo edita su familia.
  owner_id    INTEGER REFERENCES users(id)
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
  kind          TEXT NOT NULL DEFAULT 'strength',
  -- Unidad de la serie (solo kind='strength'): 'weight_reps' (kg × reps),
  -- 'reps' (peso corporal), 'time' (segundos) o 'weight_time' (kg + segundos).
  metric        TEXT NOT NULL DEFAULT 'weight_reps'
);

CREATE TABLE IF NOT EXISTS exercise_tags (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  tag         TEXT NOT NULL,
  PRIMARY KEY (exercise_id, tag)
);

-- Nombres por los que se busca un ejercicio además del suyo (0021): su nombre
-- inglés y los sinónimos usuales, en minúsculas. La búsqueda casa nombre + alias
-- + tags; la UI solo lo enseña en la ficha («También conocido como»).
CREATE TABLE IF NOT EXISTS exercise_aliases (
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  PRIMARY KEY (exercise_id, alias)
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
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name    TEXT NOT NULL,
  UNIQUE (user_id, name)
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

-- La semana es de la familia, no de la persona: menú y compra se comparten.
CREATE TABLE IF NOT EXISTS week_plans (
  id        INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  iso_week  TEXT NOT NULL,
  UNIQUE (family_id, iso_week)
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
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date    TEXT NOT NULL,
  name    TEXT,
  status  TEXT NOT NULL CHECK (status IN ('planned', 'logged')),
  UNIQUE (user_id, date)
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
  -- Segundos de la serie (isométricos y aguantes): nulo en el resto.
  duration_secs            INTEGER,
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

-- Una nota editable por día y persona: la PK es (user_id, date).
CREATE TABLE IF NOT EXISTS day_notes (
  user_id INTEGER NOT NULL REFERENCES users(id),
  date    TEXT NOT NULL,
  text    TEXT,
  PRIMARY KEY (user_id, date)
);
