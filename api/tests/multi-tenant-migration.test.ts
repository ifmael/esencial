// La 0020 reestructura tablas que tienen datos dentro (plan_sessions y su
// subárbol, plantillas, semanas, notas). En D1 el DROP de un padre con hijos
// ON DELETE CASCADE se lleva los hijos, así que aquí se fija lo único que
// importa: que ningún DROP se lleve por delante el histórico.
//
// El esquema PRE-0020 se levanta a mano a propósito: es una foto congelada.
// schema.sql ya no lo representa (pasa a ser el estado final), así que el
// fixture no puede leerse de ahí.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import m0020 from "../migrations/0020_multi_tenant.sql?raw";
import { d1, resetSchema } from "./helpers";

const PRE_0020 = `
CREATE TABLE exercises (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE recipes (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  description TEXT, servings INTEGER, photo_path TEXT
);
CREATE TABLE families (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE users (
  id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  family_id INTEGER NOT NULL REFERENCES families(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE plan_sessions (
  id INTEGER PRIMARY KEY, date TEXT NOT NULL UNIQUE, name TEXT,
  status TEXT NOT NULL CHECK (status IN ('planned', 'logged'))
);
CREATE TABLE plan_session_exercises (
  id INTEGER PRIMARY KEY,
  plan_session_id INTEGER NOT NULL REFERENCES plan_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL, target_sets INTEGER, target_reps_min INTEGER,
  target_reps_max INTEGER, target_distance_km REAL, target_duration_min INTEGER,
  rest_secs INTEGER, rest_after_secs INTEGER,
  UNIQUE (plan_session_id, exercise_id)
);
CREATE TABLE workout_logs (
  id INTEGER PRIMARY KEY,
  plan_session_id INTEGER NOT NULL UNIQUE REFERENCES plan_sessions(id) ON DELETE RESTRICT,
  date TEXT NOT NULL, effort INTEGER NOT NULL CHECK (effort BETWEEN 1 AND 5), note TEXT
);
CREATE TABLE set_logs (
  id INTEGER PRIMARY KEY,
  workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises(id) ON DELETE RESTRICT,
  set_index INTEGER NOT NULL, weight_kg REAL, reps INTEGER,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE cardio_logs (
  id INTEGER PRIMARY KEY,
  workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
  plan_session_exercise_id INTEGER NOT NULL REFERENCES plan_session_exercises(id) ON DELETE RESTRICT,
  distance_km REAL, duration_min INTEGER, done INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workout_log_id, plan_session_exercise_id)
);
CREATE TABLE session_templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);
CREATE TABLE template_exercises (
  id INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES session_templates(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL, target_sets INTEGER, target_reps_min INTEGER,
  target_reps_max INTEGER, target_distance_km REAL, target_duration_min INTEGER,
  rest_secs INTEGER, rest_after_secs INTEGER,
  UNIQUE (template_id, exercise_id)
);
CREATE TABLE week_plans (id INTEGER PRIMARY KEY, iso_week TEXT NOT NULL UNIQUE);
CREATE TABLE meal_slots (
  id INTEGER PRIMARY KEY,
  week_plan_id INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  day INTEGER NOT NULL CHECK (day BETWEEN 0 AND 6),
  meal TEXT NOT NULL CHECK (meal IN ('desayuno', 'almuerzo', 'cena')),
  recipe_id INTEGER REFERENCES recipes(id) ON DELETE RESTRICT,
  UNIQUE (day, meal, week_plan_id)
);
CREATE TABLE shopping_items (
  id INTEGER PRIMARY KEY,
  week_plan_id INTEGER NOT NULL REFERENCES week_plans(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, food TEXT NOT NULL, quantity REAL, unit TEXT,
  section TEXT, checked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE day_notes (date TEXT PRIMARY KEY, text TEXT);
`;

// Hijo antes que padre: es el orden que exige la FK al soltar.
const DROPS = [
  "DROP TABLE IF EXISTS set_logs",
  "DROP TABLE IF EXISTS cardio_logs",
  "DROP TABLE IF EXISTS workout_logs",
  "DROP TABLE IF EXISTS plan_session_exercises",
  "DROP TABLE IF EXISTS plan_sessions",
  "DROP TABLE IF EXISTS template_exercises",
  "DROP TABLE IF EXISTS session_templates",
  "DROP TABLE IF EXISTS shopping_items",
  "DROP TABLE IF EXISTS meal_slots",
  "DROP TABLE IF EXISTS week_plans",
  "DROP TABLE IF EXISTS day_notes",
  "DROP TABLE IF EXISTS recipes",
  "DROP TABLE IF EXISTS exercises",
  "DROP TABLE IF EXISTS users",
  "DROP TABLE IF EXISTS families",
];

/** El histórico de un usuario de verdad, repartido por todas las tablas que la
 *  0020 recrea: si un DROP se lleva algo, aquí se ve. */
async function seedLegacy(): Promise<void> {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO exercises (id, name) VALUES (1, 'Sentadilla')"),
    env.DB.prepare(
      "INSERT INTO recipes (id, name, servings) VALUES (1, 'Lentejas', 2)",
    ),
    env.DB.prepare(
      "INSERT INTO plan_sessions (id, date, name, status) VALUES (1, '2026-09-02', 'Pierna', 'logged')",
    ),
    env.DB.prepare(
      "INSERT INTO plan_session_exercises (id, plan_session_id, exercise_id, position, target_sets, rest_secs, rest_after_secs) VALUES (1, 1, 1, 0, 4, 120, 180)",
    ),
    env.DB.prepare(
      "INSERT INTO workout_logs (id, plan_session_id, date, effort, note) VALUES (1, 1, '2026-09-02', 4, 'buena')",
    ),
    env.DB.prepare(
      "INSERT INTO set_logs (id, workout_log_id, plan_session_exercise_id, set_index, weight_kg, reps, done) VALUES (1, 1, 1, 0, 60, 8, 1)",
    ),
    env.DB.prepare(
      "INSERT INTO cardio_logs (id, workout_log_id, plan_session_exercise_id, distance_km, duration_min, done) VALUES (1, 1, 1, 5, 30, 1)",
    ),
    env.DB.prepare(
      "INSERT INTO session_templates (id, name) VALUES (1, 'Torso')",
    ),
    env.DB.prepare(
      "INSERT INTO template_exercises (id, template_id, exercise_id, position, target_sets, rest_secs) VALUES (1, 1, 1, 0, 3, 90)",
    ),
    env.DB.prepare(
      "INSERT INTO week_plans (id, iso_week) VALUES (1, '2026-W36')",
    ),
    env.DB.prepare(
      "INSERT INTO meal_slots (id, week_plan_id, day, meal, recipe_id) VALUES (1, 1, 0, 'almuerzo', 1)",
    ),
    env.DB.prepare(
      "INSERT INTO shopping_items (id, week_plan_id, position, food, quantity, checked) VALUES (1, 1, 0, 'lentejas', 500, 1)",
    ),
    env.DB.prepare(
      "INSERT INTO day_notes (date, text) VALUES ('2026-09-02', 'pesado')",
    ),
  ]);
}

beforeEach(async () => {
  const legacy = PRE_0020.split(";").filter((s) => s.trim());
  const migration = m0020.split(";").filter((s) => s.trim());
  await env.DB.batch([...DROPS, ...legacy].map((s) => env.DB.prepare(s)));
  await seedLegacy();
  // La migración corre sobre el dato ya existente, que es lo que pasa de verdad.
  await env.DB.batch(migration.map((s) => env.DB.prepare(s)));
});

afterAll(resetSchema);

describe("0020 conserva el dato existente", () => {
  test("no se pierde ninguna fila por ningún DROP", async () => {
    const tocadas = [
      "plan_sessions",
      "plan_session_exercises",
      "workout_logs",
      "set_logs",
      "cardio_logs",
      "session_templates",
      "template_exercises",
      "week_plans",
      "meal_slots",
      "shopping_items",
      "day_notes",
    ];
    for (const t of tocadas) {
      expect(await d1.get(`SELECT COUNT(*) AS n FROM ${t}`), t).toEqual({
        n: 1,
      });
    }
  });

  test("los hijos siguen colgando de su padre y la FK está sana", async () => {
    const log = await d1.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM set_logs sl
         JOIN workout_logs wl ON wl.id = sl.workout_log_id
         JOIN plan_sessions ps ON ps.id = wl.plan_session_id
         JOIN plan_session_exercises pse ON pse.id = sl.plan_session_exercise_id
        WHERE ps.date = '2026-09-02' AND wl.effort = 4 AND pse.target_sets = 4`,
    );
    expect(log?.n).toBe(1);
    const card = await d1.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM cardio_logs cl
         JOIN workout_logs wl ON wl.id = cl.workout_log_id
         JOIN meal_slots ms ON ms.week_plan_id = 1
         JOIN shopping_items si ON si.week_plan_id = 1
        WHERE cl.distance_km = 5`,
    );
    expect(card?.n).toBe(1);
    // El RENAME tiene que haber reescrito las referencias a los nombres finales.
    expect(await d1.all("PRAGMA foreign_key_check")).toEqual([]);
  });

  test("la copia se lleva las columnas aditivas de 0018 y el dato fino", async () => {
    expect(
      await d1.get(
        "SELECT rest_secs, rest_after_secs FROM plan_session_exercises WHERE id = 1",
      ),
    ).toEqual({ rest_secs: 120, rest_after_secs: 180 });
    expect(
      await d1.get("SELECT rest_secs FROM template_exercises WHERE id = 1"),
    ).toEqual({ rest_secs: 90 });
    expect(await d1.get("SELECT note FROM workout_logs WHERE id = 1")).toEqual({
      note: "buena",
    });
    expect(await d1.get("SELECT text FROM day_notes")).toEqual({
      text: "pesado",
    });
    expect(
      await d1.get("SELECT quantity, checked FROM shopping_items WHERE id = 1"),
    ).toEqual({ quantity: 500, checked: 1 });
  });

  test("todo lo existente queda del usuario 1 y de su familia", async () => {
    expect(await d1.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
    expect(await d1.get("SELECT COUNT(*) AS n FROM families")).toEqual({
      n: 1,
    });
    expect(await d1.get("SELECT email, role FROM users WHERE id = 1")).toEqual({
      email: "ismael.rm.1986@gmail.com",
      role: "admin",
    });
    const scoped = await d1.all<{ n: number }>(
      `SELECT (SELECT COUNT(*) FROM plan_sessions WHERE user_id = 1) AS a,
              (SELECT COUNT(*) FROM session_templates WHERE user_id = 1) AS b,
              (SELECT COUNT(*) FROM week_plans WHERE family_id = 1) AS c,
              (SELECT COUNT(*) FROM day_notes WHERE user_id = 1) AS d`,
    );
    expect(scoped).toEqual([{ a: 1, b: 1, c: 1, d: 1 }]);
    // El catálogo sigue siendo catálogo: las recetas existentes quedan con NULL.
    expect(await d1.get("SELECT owner_id FROM recipes WHERE id = 1")).toEqual({
      owner_id: null,
    });
  });

  test("reusa el usuario 1 si ya existe (dev), sin pisarlo", async () => {
    // En dev la autoprovisión de /api/me deja el usuario 1 y su familia ya
    // creados: la migración debe reusarlos, no reventar contra el UNIQUE del
    // email ni renombrar la familia.
    const legacy = PRE_0020.split(";").filter((s) => s.trim());
    const migration = m0020.split(";").filter((s) => s.trim());
    await env.DB.batch([...DROPS, ...legacy].map((s) => env.DB.prepare(s)));
    await env.DB.batch([
      env.DB.prepare("INSERT INTO families (id, name) VALUES (1, 'La mía')"),
      env.DB.prepare(
        "INSERT INTO users (id, email, role, family_id) VALUES (1, 'ismael.rm.1986@gmail.com', 'admin', 1)",
      ),
      env.DB.prepare(
        "INSERT INTO day_notes (date, text) VALUES ('2026-09-02', 'pesado')",
      ),
    ]);
    await env.DB.batch(migration.map((s) => env.DB.prepare(s)));

    expect(await d1.all("SELECT id, email, family_id FROM users")).toEqual([
      { id: 1, email: "ismael.rm.1986@gmail.com", family_id: 1 },
    ]);
    expect(await d1.all("SELECT name FROM families")).toEqual([
      { name: "La mía" },
    ]);
    expect(await d1.all("SELECT user_id, text FROM day_notes")).toEqual([
      { user_id: 1, text: "pesado" },
    ]);
  });

  test("las restricciones nuevas separan por usuario y por familia", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO families (id, name) VALUES (2, 'Otra')"),
      env.DB.prepare(
        "INSERT INTO users (id, email, role, family_id) VALUES (2, 'ana@example.com', 'member', 2)",
      ),
    ]);
    // Misma fecha, otro usuario: ahora sí cabe (antes UNIQUE(date) lo impedía).
    await env.DB.prepare(
      "INSERT INTO plan_sessions (id, user_id, date, name, status) VALUES (2, 2, '2026-09-02', 'Pierna', 'planned')",
    ).run();
    // Mismo nombre de plantilla, otro usuario: también.
    await env.DB.prepare(
      "INSERT INTO session_templates (id, user_id, name) VALUES (2, 2, 'Torso')",
    ).run();
    // Pero repetir dentro del mismo usuario no.
    await expect(
      env.DB.prepare(
        "INSERT INTO plan_sessions (id, user_id, date, name, status) VALUES (3, 1, '2026-09-02', 'x', 'planned')",
      ).run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(
        "INSERT INTO session_templates (id, user_id, name) VALUES (3, 1, 'Torso')",
      ).run(),
    ).rejects.toThrow();
    // Y la semana es de la familia: la misma semana ISO en otra familia es otra fila.
    await env.DB.prepare(
      "INSERT INTO week_plans (id, family_id, iso_week) VALUES (2, 2, '2026-W36')",
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO week_plans (id, family_id, iso_week) VALUES (3, 1, '2026-W36')",
      ).run(),
    ).rejects.toThrow();
  });

  test("las notas del día pasan a ser por usuario", async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO families (id, name) VALUES (2, 'Otra')"),
      env.DB.prepare(
        "INSERT INTO users (id, email, role, family_id) VALUES (2, 'ana@example.com', 'member', 2)",
      ),
    ]);
    await env.DB.prepare(
      "INSERT INTO day_notes (user_id, date, text) VALUES (2, '2026-09-02', 'su nota')",
    ).run();
    expect(
      await d1.all("SELECT user_id, text FROM day_notes ORDER BY user_id"),
    ).toEqual([
      { user_id: 1, text: "pesado" },
      { user_id: 2, text: "su nota" },
    ]);
  });
});
