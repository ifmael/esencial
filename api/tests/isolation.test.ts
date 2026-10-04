// Aislamiento entre usuarios: la única red de esta parte. D1 no tiene RLS, así
// que si una consulta se olvida del `WHERE user_id = ?` no hay nada más que lo
// pare; por eso aquí se prueba, ruta a ruta, que B no VE ni TOCA lo de A (404,
// nunca 200) y que A no ve lo de B. La semana de comidas es la excepción: es de
// la familia, así que dos personas de la misma familia sí se ven.
import { beforeEach, describe, expect, test } from "vitest";
import {
  d1,
  devGet,
  devPostForm,
  devSend,
  freshDb,
  get,
  post,
  put,
} from "./helpers";

const ANA = "ana@example.com";
const BEA = "bea@example.com";
const CARLA = "carla@example.com";

type Json = Record<string, unknown>;
const body = async (res: Response): Promise<Json> => (await res.json()) as Json;

let ejercicio = 0;

beforeEach(async () => {
  await freshDb();
  // El catálogo lo escribe el admin (la cookie de test es el admin de ADMIN_EMAIL).
  const creado = await post("/api/exercises", {
    name: `Ejercicio de ${Math.random()}`,
    tags: ["pecho"],
  });
  expect(creado.status).toBe(201);
  ejercicio = Number((await body(creado)).id);
});

/** Mete a Carla en la familia de Ana (es lo que hace el admin al añadir miembro). */
async function meterEnLaFamiliaDeAna(): Promise<void> {
  const ana = await body(await devGet("/api/me", ANA));
  await devGet("/api/me", CARLA);
  await d1.run(
    "UPDATE users SET family_id = ? WHERE email = ?",
    ana.familyId,
    CARLA,
  );
}

describe("recetas", () => {
  test("B no ve ni toca la receta de A", async () => {
    const suya = await body(
      await devSend("/api/recipes", "POST", { name: "De Ana", tags: [] }, ANA),
    );
    const id = Number(suya.id);

    const lista = (await body(
      await devGet("/api/recipes", BEA),
    )) as unknown as unknown[];
    expect(lista.map((r) => Number((r as Json).id))).not.toContain(id);
    const buscar = (await body(
      await devGet("/api/recipes?summary=1", BEA),
    )) as unknown as unknown[];
    expect(buscar.map((r) => Number((r as Json).id))).not.toContain(id);

    expect((await devGet(`/api/recipes/${id}`, BEA)).status).toBe(404);
    expect(
      (await devSend(`/api/recipes/${id}`, "PUT", { name: "x", tags: [] }, BEA))
        .status,
    ).toBe(404);
    expect(
      (await devSend(`/api/recipes/${id}`, "DELETE", null, BEA)).status,
    ).toBe(404);
    // Y sigue estando para su dueña.
    expect((await devGet(`/api/recipes/${id}`, ANA)).status).toBe(200);
  });

  test("las recetas de la familia se ven entre ellos", async () => {
    await meterEnLaFamiliaDeAna();
    const suya = await body(
      await devSend("/api/recipes", "POST", { name: "De Ana", tags: [] }, ANA),
    );
    expect(
      (await devGet(`/api/recipes/${Number(suya.id)}`, CARLA)).status,
    ).toBe(200);
  });

  test("el catálogo lo lee todo el mundo pero solo lo escribe el admin", async () => {
    await d1.run("INSERT INTO recipes (id, name) VALUES (101, 'Del catálogo')");
    expect((await devGet("/api/recipes/101", BEA)).status).toBe(200);
    expect(
      (await devSend("/api/recipes/101", "PUT", { name: "x", tags: [] }, BEA))
        .status,
    ).toBe(403);
    expect(
      (await devSend("/api/recipes/101", "DELETE", null, BEA)).status,
    ).toBe(403);
    // Y el admin de la instalación sí puede: la cookie de test es ADMIN_EMAIL.
    expect(
      (await put("/api/recipes/101", { name: "Del catálogo", tags: [] }))
        .status,
    ).toBe(200);
  });
});

describe("plantillas", () => {
  test("B no ve ni toca la de A, y puede repetir el nombre", async () => {
    const suya = await body(
      await devSend("/api/templates", "POST", { name: "Torso" }, ANA),
    );
    const id = Number(suya.id);

    const lista = (await body(
      await devGet("/api/templates", BEA),
    )) as unknown as unknown[];
    expect(lista.map((t) => Number((t as Json).id))).not.toContain(id);
    expect((await devGet(`/api/templates/${id}`, BEA)).status).toBe(404);
    expect(
      (await devSend(`/api/templates/${id}`, "PUT", { name: "x" }, BEA)).status,
    ).toBe(404);
    expect(
      (await devSend(`/api/templates/${id}`, "DELETE", null, BEA)).status,
    ).toBe(404);
    // El nombre es UNIQUE por usuario, no global.
    expect(
      (await devSend("/api/templates", "POST", { name: "Torso" }, BEA)).status,
    ).toBe(201);
  });
});

describe("fuerza: plan e histórico", () => {
  test("B no ve ni toca la sesión de A, y puede planificar el mismo día", async () => {
    const dia = "2026-03-04";
    const creada = await devSend(
      "/api/plan-sessions",
      "POST",
      { date: dia, items: [{ exerciseId: ejercicio }] },
      ANA,
    );
    expect(creada.status).toBe(201);
    const id = Number((await body(creada)).id);

    const lista = (await body(
      await devGet("/api/plan-sessions", BEA),
    )) as unknown as unknown[];
    expect(lista.map((s) => Number((s as Json).id))).not.toContain(id);
    expect((await devGet(`/api/plan-sessions/${id}`, BEA)).status).toBe(404);
    expect(
      (await devSend(`/api/plan-sessions/${id}`, "DELETE", null, BEA)).status,
    ).toBe(404);

    // El mismo día, para la otra: cabe (el UNIQUE es por usuario).
    expect(
      (
        await devSend(
          "/api/plan-sessions",
          "POST",
          { date: dia, items: [{ exerciseId: ejercicio }] },
          BEA,
        )
      ).status,
    ).toBe(201);
  });

  test("B no ve el registro de A del mismo día", async () => {
    const dia = "2026-03-05";
    await devSend(
      "/api/plan-sessions",
      "POST",
      { date: dia, items: [{ exerciseId: ejercicio }] },
      ANA,
    );
    const registro = await devSend(
      `/api/workout-logs/${dia}`,
      "POST",
      { effort: 4, sets: [] },
      ANA,
    );
    expect(registro.status).toBe(201);

    expect((await devGet(`/api/workout-logs/${dia}`, BEA)).status).toBe(404);
    const dias = (await body(
      await devGet("/api/workout-logs", BEA),
    )) as unknown as {
      days: unknown[];
    };
    expect(dias.days.length).toBe(0);
    expect(
      (await devGet(`/api/exercises/${ejercicio}/history`, BEA)).status,
    ).toBe(200);
    expect(
      (
        (await body(await devGet(`/api/exercises/${ejercicio}/history`, BEA)))
          .sessions as unknown[]
      ).length,
    ).toBe(0);
  });
});

describe("notas del día", () => {
  test("la nota de cada uno es suya", async () => {
    const dia = "2026-03-06";
    await devSend(`/api/notes/${dia}`, "PUT", { text: "de Ana" }, ANA);
    expect(await body(await devGet(`/api/notes/${dia}`, BEA))).toEqual({
      date: dia,
      text: "",
    });
    await devSend(`/api/notes/${dia}`, "PUT", { text: "de Bea" }, BEA);
    expect(await body(await devGet(`/api/notes/${dia}`, ANA))).toEqual({
      date: dia,
      text: "de Ana",
    });
  });
});

describe("semana de comidas (es de la familia)", () => {
  test("dos familias no comparten semana; los hermanos sí", async () => {
    const semana = "2026-W12";
    const receta = await body(
      await devSend("/api/recipes", "POST", { name: "De Ana", tags: [] }, ANA),
    );
    await devSend(
      `/api/meal-plan/${semana}`,
      "PUT",
      {
        slots: [{ day: 0, meal: "almuerzo", recipeId: Number(receta.id) }],
      },
      ANA,
    );

    const deBea = (await body(
      await devGet(`/api/meal-plan/${semana}`, BEA),
    )) as unknown as {
      slots: unknown[];
    };
    expect(deBea.slots.length).toBe(0);

    await meterEnLaFamiliaDeAna();
    const deCarla = (await body(
      await devGet(`/api/meal-plan/${semana}`, CARLA),
    )) as unknown as { slots: unknown[] };
    expect(deCarla.slots.length).toBe(1);
  });
});

describe("fotos", () => {
  test("la foto de A no la ve B, pero sí quien comparte familia", async () => {
    const form = new FormData();
    form.append(
      "file",
      new File([new Uint8Array([1, 2, 3])], "f.png", { type: "image/png" }),
    );
    const subida = await body(await devPostForm("/api/uploads", form, ANA));
    const key = String(subida.photo_path);

    expect((await devGet(`/api/uploads/${key}`, BEA)).status).toBe(404);
    expect((await devGet(`/api/uploads/${key}`, ANA)).status).toBe(200);

    // Una receta legible que la use la abre para el resto de la familia.
    await meterEnLaFamiliaDeAna();
    await d1.run(
      "INSERT INTO recipes (id, name, photo_path, owner_id) VALUES (102, 'Con foto', ?, (SELECT id FROM users WHERE email = ?))",
      key,
      ANA,
    );
    expect((await devGet(`/api/uploads/${key}`, CARLA)).status).toBe(200);
    // …y el catálogo también (lo subió el admin y lo usa una receta del catálogo).
    await d1.run(
      "INSERT INTO recipes (id, name, photo_path) VALUES (103, 'Del catálogo con foto', ?)",
      key,
    );
    expect((await devGet(`/api/uploads/${key}`, BEA)).status).toBe(200);
  });
});

describe("el catálogo no se escribe sin ser admin", () => {
  test("un member no crea ejercicios ni alimentos", async () => {
    expect(
      (
        await devSend(
          "/api/exercises",
          "POST",
          { name: "X", tags: ["pecho"] },
          BEA,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await devSend(
          "/api/foods",
          "POST",
          { name: "Prueba", kcal: 10, protein: 1, fat: 1, carbs: 1 },
          BEA,
        )
      ).status,
    ).toBe(403);
    // Pero los lee.
    expect((await devGet("/api/exercises", BEA)).status).toBe(200);
    expect((await devGet("/api/foods", BEA)).status).toBe(200);
    // Y el admin de la instalación sí escribe (la cookie de test es el admin).
    expect((await get("/api/exercises")).status).toBe(200);
  });
});
