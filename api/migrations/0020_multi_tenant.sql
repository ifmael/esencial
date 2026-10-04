-- 0020: multi-usuario (reestructuración). Todo lo existente pasa al usuario 1.
--
-- Por qué se recrean tablas enteras: SQLite no deja quitar un UNIQUE ni cambiar
-- una PK, y aquí cambian cuatro: plan_sessions, session_templates, day_notes y
-- week_plans. Y ojo con el DROP del padre: en D1 `PRAGMA foreign_keys = 1`, así
-- que soltar una tabla que tiene hijos con ON DELETE CASCADE se los lleva por
-- delante (medido: hijos 0 tras el DROP, y `defer_foreign_keys` no lo evita,
-- porque difiere la verificación, no las acciones). Por eso cada subárbol se
-- recrea **entero**: tablas nuevas apuntando al padre nuevo, copia de todo,
-- DROP de las viejas hijo-antes-que-padre y RENAME a los nombres finales.
--
-- Subárboles: plan_sessions (5 tablas), session_templates (2), week_plans (3) y
-- day_notes (hoja). `recipes` no se recrea: solo gana owner_id (NULL = catálogo).
--
-- Columnas aditivas (rest_secs/rest_after_secs de 0018): van en la lista porque
-- en la base real ya existen (0018 corre antes) y hay que copiarlas.

-- La familia y el usuario del dueño. En dev el usuario 1 ya existe (lo crea la
-- autoprovisión de /api/me) y se reusa: de ahí los WHERE NOT EXISTS. En
-- producción las dos tablas llegan vacías.
INSERT INTO families (id, name)
  SELECT 1, 'Familia' WHERE NOT EXISTS (SELECT 1 FROM families WHERE id = 1);

INSERT INTO users (id, email, role, family_id)
  SELECT 1, 'ismael.rm.1986@gmail.com', 'admin', 1
   WHERE NOT EXISTS (SELECT 1 FROM users WHERE id = 1);

-- El catálogo sembrado (0012/0017) se queda con owner_id NULL. Cualquier receta
-- creada a mano por el dueño también queda como catálogo: no hay forma de
-- distinguirlas a posteriori y el catálogo es lo menos peligroso (solo lo
-- escribe el admin).
ALTER TABLE recipes ADD COLUMN owner_id INTEGER REFERENCES users(id);

-- ── Planes de entrenamiento ──────────────────────────────────────────────────
CREATE TABLE plan_sessions_new (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  date    TEXT NOT NULL,
  name    TEXT,
  status  TEXT NOT NULL CHECK (status IN ('planned', 'logged')),
  UNIQUE (user_id, date)
);

CREATE TABLE plan_session_exercises_new (
  id                  INTEGER PRIMARY KEY,
  plan_session_id     INTEGER NOT NULL REFERENCES plan_sessions_new(id) ON DELETE CASCADE,
  exercise_id         INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position            INTEGER NOT NULL,
  target_sets         INTEGER,
  target_reps_min     INTEGER,
  target_reps_max     INTEGER,
  target_distance_km  REAL,
  target_duration_min INTEGER,
  rest_secs           INTEGER,
  rest_after_secs     INTEGER,
  UNIQUE (plan_session_id, exercise_id)
);

CREATE TABLE workout_logs_new (
  id              INTEGER PRIMARY KEY,
  plan_session_id INTEGER NOT NULL UNIQUE REFERENCES plan_sessions_new(id) ON DELETE RESTRICT,
  date            TEXT NOT NULL,
  effort          INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
  note            TEXT
);

CREATE TABLE set_logs_new (
  id                       INTEGER PRIMARY KEY,
  workout_log_id           INTEGER NOT NULL REFERENCES workout_logs_new(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises_new(id) ON DELETE RESTRICT,
  set_index                INTEGER NOT NULL,
  weight_kg                REAL,
  reps                     INTEGER,
  done                     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cardio_logs_new (
  id                       INTEGER PRIMARY KEY,
  workout_log_id           INTEGER NOT NULL REFERENCES workout_logs_new(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises_new(id) ON DELETE RESTRICT,
  distance_km              REAL,
  duration_min             INTEGER,
  done                     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workout_log_id, plan_session_exercise_id)
);

INSERT INTO plan_sessions_new (id, user_id, date, name, status)
  SELECT id, 1, date, name, status FROM plan_sessions;

INSERT INTO plan_session_exercises_new (id, plan_session_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs)
  SELECT id, plan_session_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs FROM plan_session_exercises;

INSERT INTO workout_logs_new (id, plan_session_id, date, effort, note)
  SELECT id, plan_session_id, date, effort, note FROM workout_logs;

INSERT INTO set_logs_new (id, workout_log_id, plan_session_exercise_id, set_index, weight_kg, reps, done)
  SELECT id, workout_log_id, plan_session_exercise_id, set_index, weight_kg, reps, done FROM set_logs;

INSERT INTO cardio_logs_new (id, workout_log_id, plan_session_exercise_id, distance_km, duration_min, done)
  SELECT id, workout_log_id, plan_session_exercise_id, distance_km, duration_min, done FROM cardio_logs;

DROP TABLE set_logs;
DROP TABLE cardio_logs;
DROP TABLE workout_logs;
DROP TABLE plan_session_exercises;
DROP TABLE plan_sessions;

ALTER TABLE plan_sessions_new RENAME TO plan_sessions;
ALTER TABLE plan_session_exercises_new RENAME TO plan_session_exercises;
ALTER TABLE workout_logs_new RENAME TO workout_logs;
ALTER TABLE set_logs_new RENAME TO set_logs;
ALTER TABLE cardio_logs_new RENAME TO cardio_logs;

-- ── Plantillas ───────────────────────────────────────────────────────────────
CREATE TABLE session_templates_new (
  id      INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name    TEXT NOT NULL,
  UNIQUE (user_id, name)
);

CREATE TABLE template_exercises_new (
  id                  INTEGER PRIMARY KEY,
  template_id         INTEGER NOT NULL REFERENCES session_templates_new(id) ON DELETE CASCADE,
  exercise_id         INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position            INTEGER NOT NULL,
  target_sets         INTEGER,
  target_reps_min     INTEGER,
  target_reps_max     INTEGER,
  target_distance_km  REAL,
  target_duration_min INTEGER,
  rest_secs           INTEGER,
  rest_after_secs     INTEGER,
  UNIQUE (template_id, exercise_id)
);

INSERT INTO session_templates_new (id, user_id, name)
  SELECT id, 1, name FROM session_templates;

INSERT INTO template_exercises_new (id, template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs)
  SELECT id, template_id, exercise_id, position, target_sets, target_reps_min, target_reps_max, target_distance_km, target_duration_min, rest_secs, rest_after_secs FROM template_exercises;

DROP TABLE template_exercises;
DROP TABLE session_templates;

ALTER TABLE session_templates_new RENAME TO session_templates;
ALTER TABLE template_exercises_new RENAME TO template_exercises;

-- ── Semana de comidas (es de la familia, no de la persona) ──────────────────
CREATE TABLE week_plans_new (
  id        INTEGER PRIMARY KEY,
  family_id INTEGER NOT NULL REFERENCES families(id),
  iso_week  TEXT NOT NULL,
  UNIQUE (family_id, iso_week)
);

CREATE TABLE meal_slots_new (
  id           INTEGER PRIMARY KEY,
  week_plan_id INTEGER NOT NULL REFERENCES week_plans_new(id) ON DELETE CASCADE,
  day          INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  meal         TEXT NOT NULL CHECK (meal IN ('desayuno', 'almuerzo', 'cena')),
  recipe_id    INTEGER REFERENCES recipes(id) ON DELETE RESTRICT,
  UNIQUE (day, meal, week_plan_id)
);

CREATE TABLE shopping_items_new (
  id           INTEGER PRIMARY KEY,
  week_plan_id INTEGER NOT NULL REFERENCES week_plans_new(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL,
  food         TEXT NOT NULL,
  quantity     REAL,
  unit         TEXT,
  section      TEXT,
  checked      INTEGER NOT NULL DEFAULT 0
);

INSERT INTO week_plans_new (id, family_id, iso_week)
  SELECT id, 1, iso_week FROM week_plans;

INSERT INTO meal_slots_new (id, week_plan_id, day, meal, recipe_id)
  SELECT id, week_plan_id, day, meal, recipe_id FROM meal_slots;

INSERT INTO shopping_items_new (id, week_plan_id, position, food, quantity, unit, section, checked)
  SELECT id, week_plan_id, position, food, quantity, unit, section, checked FROM shopping_items;

DROP TABLE shopping_items;
DROP TABLE meal_slots;
DROP TABLE week_plans;

ALTER TABLE week_plans_new RENAME TO week_plans;
ALTER TABLE meal_slots_new RENAME TO meal_slots;
ALTER TABLE shopping_items_new RENAME TO shopping_items;

-- ── Notas del día ────────────────────────────────────────────────────────────
CREATE TABLE day_notes_new (
  user_id INTEGER NOT NULL REFERENCES users(id),
  date    TEXT NOT NULL,
  text    TEXT,
  PRIMARY KEY (user_id, date)
);

INSERT INTO day_notes_new (user_id, date, text)
  SELECT 1, date, text FROM day_notes;

DROP TABLE day_notes;

ALTER TABLE day_notes_new RENAME TO day_notes;
