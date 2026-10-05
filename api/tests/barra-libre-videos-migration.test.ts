// La 0024 añade el vídeo de técnica (YouTube, en español) de los 17 ejercicios
// de «Barra Libre» que sembró 0023, que eran los únicos del catálogo sin
// `technique_url`. No va al bootstrap de tests (es siembra, como 0010 y 0023):
// aquí se aplican 0023 y 0024 a mano sobre el esquema final.
//
// Lo que se comprueba es lo que ningún otro test puede ver: que las 17 filas
// resuelven por nombre (un nombre mal escrito dejaría al ejercicio sin vídeo),
// que la URL es un `watch?v=` de YouTube con el id de 11 caracteres que espera
// `ytEmbedId` (web) y que no se ha pegado el mismo clip dos veces.
import { env } from "cloudflare:test";
import { afterAll, beforeEach, describe, expect, test } from "vitest";
import m0023 from "../migrations/0023_ejercicios_barra_libre.sql?raw";
import m0024 from "../migrations/0024_videos_barra_libre.sql?raw";
import { d1, resetSchema } from "./helpers";

/** Los 17 ejercicios de la 0023 (los que van sin vídeo hasta esta migración). */
const BARRA_LIBRE = [
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

/** La forma exacta que reconoce `ytEmbedId` en la ficha del ejercicio. */
const YOUTUBE = /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/;

const apply = (raw: string) =>
  env.DB.batch(
    raw
      .split(";")
      .filter((s) => s.trim())
      .map((s) => env.DB.prepare(s)),
  );

beforeEach(async () => {
  await resetSchema();
  // El alias de «rodillas a pecho» de la 0023 cuelga de este ejercicio.
  await env.DB.prepare(
    "INSERT INTO exercises (name) VALUES ('Elevación de piernas colgado')",
  ).run();
  await apply(m0023);
  await apply(m0024);
});

afterAll(resetSchema);

describe("0024 — vídeos de Barra Libre", () => {
  test("cada uno de los 17 ejercicios queda con su vídeo de YouTube", async () => {
    for (const name of BARRA_LIBRE) {
      const row = await d1.get<{ url: string | null }>(
        "SELECT technique_url AS url FROM exercises WHERE name = ?",
        name,
      );
      expect(row, name).toBeTruthy();
      expect(row?.url, name).toMatch(YOUTUBE);
    }
  });

  test("solo esos 17 llevan vídeo, y ninguno repetido", async () => {
    const urls = await d1.all<{ url: string }>(
      "SELECT technique_url AS url FROM exercises WHERE technique_url IS NOT NULL AND technique_url != ''",
    );
    expect(urls.length).toBe(BARRA_LIBRE.length);
    expect(new Set(urls.map((r) => r.url)).size).toBe(BARRA_LIBRE.length);
  });

  test("es idempotente: reejecutarla no falla ni cambia nada", async () => {
    const before = await d1.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM exercises WHERE technique_url IS NOT NULL",
    );
    await apply(m0024);
    const after = await d1.get<{ n: number }>(
      "SELECT COUNT(*) AS n FROM exercises WHERE technique_url IS NOT NULL",
    );
    expect(after?.n).toBe(before?.n);
  });
});
