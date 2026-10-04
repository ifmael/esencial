// La 0021 fija el español como nombre canónico del catálogo y siembra los alias
// de búsqueda. El bootstrap de tests no la aplica (es siembra, como 0010): el
// esquema sí trae ya `exercise_aliases`, porque schema.sql es el estado final.
//
// El esquema PRE-0021 se levanta a mano a propósito: es una foto congelada del
// catálogo antes del renombrado, con los nombres ingleses que la migración
// tiene que traducir.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import m0021 from "../migrations/0021_exercise_aliases.sql?raw";
import { d1, resetSchema } from "./helpers";

/** Los nombres viejos (en inglés) tal como los dejó 0004. */
const VIEJOS = [
  "Face pull",
  "Push press",
  "Sentadilla goblet",
  "Pistol squat",
  "Nordic curl",
  "Frog pump",
  "Russian twist",
  "Dead bug",
  "Bird dog",
  "Hollow body hold",
  "Mountain climbers",
  "Farmer carry",
];

/** Los que no se renombran pero sí reciben alias. «Hip thrust» se queda con su
 *  nombre en inglés: es el que se usa, y su alias es la traducción. */
const SIN_RENOMBRAR = [
  "Sit-up",
  "Plancha",
  "Zancadas",
  "Dominadas",
  "Hip thrust",
];

beforeEach(async () => {
  await resetSchema();
  await env.DB.batch(
    [...VIEJOS, ...SIN_RENOMBRAR].map((name) =>
      env.DB.prepare("INSERT INTO exercises (name) VALUES (?)").bind(name),
    ),
  );
  // La migración corre sobre el dato ya existente, que es lo que pasa de verdad.
  await env.DB.batch(
    m0021
      .split(";")
      .filter((s) => s.trim())
      .map((s) => env.DB.prepare(s)),
  );
});

afterAll(resetSchema);

describe("0021 — nombres y alias", () => {
  test("los nombres ingleses se renombran a español canónico", async () => {
    const all = await d1.all<{ name: string }>("SELECT name FROM exercises");
    const names = all.map((r) => r.name);
    for (const viejo of VIEJOS) expect(names, viejo).not.toContain(viejo);
    for (const nuevo of [
      "Tirón a la cara",
      "Press con impulso",
      "Sentadilla con copa",
      "Sentadilla a una pierna",
      "Curl nórdico",
      "Puente de rana",
      "Giro ruso",
      "Bicho muerto",
      "Perro pájaro",
      "Bote hueco",
      "Escaladores",
      "Paseo del granjero",
    ])
      expect(names, nuevo).toContain(nuevo);
  });

  test("cada nombre que se conoce en inglés trae su alias", async () => {
    // El alias cuelga del ejercicio renombrado, no de un nombre que ya no existe.
    const otros = await d1.all<{ alias: string }>(
      `SELECT a.alias FROM exercise_aliases a
        JOIN exercises e ON e.id = a.exercise_id
       WHERE e.name = 'Paseo del granjero' ORDER BY a.alias`,
    );
    expect(otros.map((r) => r.alias)).toEqual([
      "farmer carry",
      "farmer's walk",
      "paseo de granjero",
    ]);
  });

  test("todo ejercicio renombrado tiene al menos un alias", async () => {
    const sin = await d1.all<{ name: string }>(
      `SELECT e.name FROM exercises e
        WHERE NOT EXISTS (SELECT 1 FROM exercise_aliases a WHERE a.exercise_id = e.id)`,
    );
    expect(sin).toEqual([]);
  });

  test("los alias van en minúsculas, sin filas huérfanas ni repetidas", async () => {
    const malos = await d1.all<{ alias: string }>(
      "SELECT alias FROM exercise_aliases WHERE alias <> lower(alias)",
    );
    expect(malos).toEqual([]);
    const huerfanos = await d1.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM exercise_aliases a
        WHERE NOT EXISTS (SELECT 1 FROM exercises e WHERE e.id = a.exercise_id)`,
    );
    expect(huerfanos[0].n).toBe(0);
  });

  test("«Hip thrust» conserva su nombre y su alias es la traducción", async () => {
    const row = await d1.get<{ id: number }>(
      "SELECT id FROM exercises WHERE name = 'Hip thrust'",
    );
    expect(row).toBeTruthy();
    const aliases = (
      await d1.all<{ alias: string }>(
        "SELECT alias FROM exercise_aliases WHERE exercise_id = ? ORDER BY alias",
        row?.id,
      )
    ).map((r) => r.alias);
    expect(aliases).toEqual(["empuje de cadera"]);
    expect(
      await d1.get("SELECT id FROM exercises WHERE name = 'Empuje de cadera'"),
    ).toBeNull();
  });

  test("los que no se renombran también reciben sinónimos de búsqueda", async () => {
    const aliases = async (name: string) =>
      (
        await d1.all<{ alias: string }>(
          `SELECT a.alias FROM exercise_aliases a
            JOIN exercises e ON e.id = a.exercise_id
           WHERE e.name = ? ORDER BY a.alias`,
          name,
        )
      ).map((r) => r.alias);
    expect(await aliases("Sit-up")).toEqual([
      "abdominales",
      "sit up",
      "sit-ups",
    ]);
    expect(await aliases("Zancadas")).toEqual(["desplantes", "lunges"]);
    expect(await aliases("Dominadas")).toEqual([
      "dominadas pronas",
      "pull ups",
      "pull-ups",
    ]);
  });
});
