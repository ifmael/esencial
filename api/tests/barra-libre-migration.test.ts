// La 0022 siembra los ejercicios de «Barra Libre» que faltaban (17 filas), con
// sus grupos, sus sub-regiones (con grado) y sus alias de búsqueda. No va al
// bootstrap de tests (es siembra, como 0010): aquí se aplica a mano sobre el
// esquema final.
//
// Se comprueba lo que el e2e no puede ver en el CI sin GPU y lo que más caro
// sale si se desincroniza: que cada región cuelga de un grupo que el ejercicio
// tiene como tag, que todo ejercicio trae al menos un músculo principal y que
// los alias van en minúsculas.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import m0022 from "../migrations/0022_ejercicios_barra_libre.sql?raw";
import { MUSCLE_REGION_GROUPS } from "../src/muscle-regions";
import { d1, resetSchema } from "./helpers";

/** Los 17 ejercicios que trae la migración (los que el libro sí tiene y el
 *  catálogo no). */
const NUEVOS = [
  "Cargada",
  "Press jabalina",
  "Peso muerto unilateral",
  "Curl a una mano con barra",
  "Curl invertido con barra",
  "Burpee",
  "Thruster",
  "Swing con kettlebell",
  "Arrancada con kettlebell",
  "Remo alto",
  "Cargada y press",
  "Remo renegado",
  "Remo invertido",
  "Dominada con toalla",
  "Sit-up con barra",
  "Flexiones con palmada",
  "Sentadilla en rack con kettlebell",
];

const apply = () =>
  env.DB.batch(
    m0022
      .split(";")
      .filter((s) => s.trim())
      .map((s) => env.DB.prepare(s)),
  );

beforeEach(async () => {
  await resetSchema();
  // El alias de «rodillas a pecho» cuelga de este ejercicio (ya en el catálogo).
  await env.DB.prepare(
    "INSERT INTO exercises (name) VALUES ('Elevación de piernas colgado')",
  ).run();
  await apply();
});

afterAll(resetSchema);

describe("0022 — ejercicios de Barra Libre", () => {
  test("crea los 17 ejercicios con grupo y al menos un músculo principal", async () => {
    for (const name of NUEVOS) {
      const tags = await d1.all<{ tag: string }>(
        `SELECT t.tag FROM exercise_tags t
          JOIN exercises e ON e.id = t.exercise_id WHERE e.name = ?`,
        name,
      );
      expect(tags.length, name).toBeGreaterThan(0);
      const regions = await d1.all<{ region: string; role: string }>(
        `SELECT r.region, r.role FROM exercise_regions r
          JOIN exercises e ON e.id = r.exercise_id WHERE e.name = ?`,
        name,
      );
      expect(regions.length, name).toBeGreaterThan(0);
      expect(
        regions.some((r) => r.role === "primary"),
        name,
      ).toBe(true);
    }
  });

  test("toda región cuelga de un tag del propio ejercicio (los dos niveles no se contradicen)", async () => {
    for (const name of NUEVOS) {
      const tags = (
        await d1.all<{ tag: string }>(
          `SELECT t.tag FROM exercise_tags t
            JOIN exercises e ON e.id = t.exercise_id WHERE e.name = ?`,
          name,
        )
      ).map((r) => r.tag);
      const regions = await d1.all<{ region: string }>(
        `SELECT r.region FROM exercise_regions r
          JOIN exercises e ON e.id = r.exercise_id WHERE e.name = ?`,
        name,
      );
      for (const { region } of regions) {
        const group = MUSCLE_REGION_GROUPS[region];
        expect(group, `${name} → ${region}`).toBeDefined();
        expect(tags, `${name} → ${region}`).toContain(group);
      }
    }
  });

  test("cada fila nueva trae su alias, en minúsculas", async () => {
    for (const name of NUEVOS) {
      const aliases = (
        await d1.all<{ alias: string }>(
          `SELECT a.alias FROM exercise_aliases a
            JOIN exercises e ON e.id = a.exercise_id WHERE e.name = ?`,
          name,
        )
      ).map((r) => r.alias);
      expect(aliases.length, name).toBeGreaterThan(0);
      for (const a of aliases) expect(a, name).toBe(a.toLowerCase());
    }
    // Anclas concretas del inventario.
    expect(
      await d1.get(
        "SELECT alias FROM exercise_aliases WHERE exercise_id = (SELECT id FROM exercises WHERE name = 'Cargada') AND alias = 'power clean'",
      ),
    ).toBeTruthy();
    expect(
      await d1.get(
        "SELECT alias FROM exercise_aliases WHERE exercise_id = (SELECT id FROM exercises WHERE name = 'Remo invertido') AND alias = 'dominada horizontal'",
      ),
    ).toBeTruthy();
  });

  test("el roll-out y las rodillas a pecho resuelven como alias, no como fila nueva", async () => {
    // Mismo movimiento que un ejercicio que ya existe: alias, nunca duplicado.
    const roll = await d1.get(
      "SELECT id FROM exercises WHERE name = 'Roll-out con barra'",
    );
    expect(roll).toBeNull();
    const rodillas = await d1.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM exercise_aliases a
        JOIN exercises e ON e.id = a.exercise_id
       WHERE e.name = 'Elevación de piernas colgado' AND a.alias = 'rodillas a pecho'`,
    );
    expect(rodillas?.n).toBe(1);
  });

  test("es idempotente: reejecutarla no duplica ni falla", async () => {
    const count = async () =>
      (await d1.get<{ n: number }>("SELECT COUNT(*) AS n FROM exercises"))?.n;
    const before = await count();
    await apply();
    expect(await count()).toBe(before);
  });
});
