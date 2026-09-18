-- Fuerza v2: la sesión es el día (no la plantilla). plan_sessions pierde
-- template_id y gana name; los ejercicios del día viven en plan_session_exercises
-- (copia expandida de plantillas / ejercicios sueltos, sin duplicados).
-- Cardio: exercises.kind ('strength'|'running'|'bike') + distancia/tiempo en
-- template_exercises y plan_session_exercises, con cardio_logs para la ejecución.
--
-- Reestructuración destructiva: el modelo anterior (una plantilla por día, sets
-- contra template_exercises) se descarta; plan_sessions/workout_logs/set_logs se
-- recrean vacías de forma deliberada.
ALTER TABLE session_templates DROP COLUMN rotation_index;
ALTER TABLE exercises ADD COLUMN kind TEXT NOT NULL DEFAULT 'strength';
ALTER TABLE template_exercises ADD COLUMN target_distance_km REAL;
ALTER TABLE template_exercises ADD COLUMN target_duration_min INTEGER;

DROP TABLE IF EXISTS set_logs;
DROP TABLE IF EXISTS cardio_logs;
DROP TABLE IF EXISTS workout_logs;
DROP TABLE IF EXISTS plan_session_exercises;
DROP TABLE IF EXISTS plan_sessions;

CREATE TABLE plan_sessions (
  id     INTEGER PRIMARY KEY,
  date   TEXT NOT NULL UNIQUE,
  name   TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'logged'))
);

CREATE TABLE plan_session_exercises (
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

CREATE TABLE workout_logs (
  id              INTEGER PRIMARY KEY,
  plan_session_id INTEGER NOT NULL UNIQUE REFERENCES plan_sessions(id) ON DELETE RESTRICT,
  date            TEXT NOT NULL,
  effort          INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5),
  note            TEXT
);

CREATE TABLE set_logs (
  id                       INTEGER PRIMARY KEY,
  workout_log_id           INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises(id) ON DELETE RESTRICT,
  set_index                INTEGER NOT NULL,
  weight_kg                REAL,
  reps                     INTEGER,
  done                     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cardio_logs (
  id                       INTEGER PRIMARY KEY,
  workout_log_id           INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises(id) ON DELETE RESTRICT,
  distance_km              REAL,
  duration_min             INTEGER,
  done                     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workout_log_id, plan_session_exercise_id)
);

-- Un ejercicio no puede repetirse dentro de una plantilla (misma regla que en el
-- día). Dedupe previo por si el dato antiguo traía repetidos, para que el índice
-- se cree siempre.
DELETE FROM template_exercises
 WHERE id NOT IN (
   SELECT MIN(id) FROM template_exercises GROUP BY template_id, exercise_id
 );
CREATE UNIQUE INDEX IF NOT EXISTS ux_template_exercises_pair
  ON template_exercises (template_id, exercise_id);
