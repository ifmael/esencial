// Familias: alta/baja de miembros por el admin, con la regla de fusión de
// semanas. La familia es la unidad del menú compartido; mover a alguien de
// familia es, a la vez, mover su recetario visible (derivado de `owner_id`) y,
// cuando era su familia de uno, sus semanas.
import { beforeEach, describe, expect, test } from "vitest";
import { d1, del, devGet, devSend, freshDb, get, post, put } from "./helpers";

// Debe coincidir con ADMIN_EMAIL de tests/wrangler.test.toml.
const ADMIN = "admin@esencial.test";
const ANA = "ana@example.com";
const BEA = "bea@example.com";
const CARLA = "carla@example.com";

type Cuenta = { id: number; email: string; role: string; familyId: number };
type Json = Record<string, unknown>;

const cuerpo = async <T = Json>(res: Response): Promise<T> =>
  (await res.json()) as T;

/** Autoprovisión: la primera petición de un email estrena su cuenta. */
const soy = async (email: string): Promise<Cuenta> =>
  (await (await devGet("/api/me", email)).json()) as Cuenta;

let recetas = 0;

/** Crea una receta como `email` y devuelve su id. */
async function receta(email: string, nombre?: string): Promise<number> {
  const res = await devSend(
    "/api/recipes",
    "POST",
    { name: nombre ?? `Receta ${++recetas}`, tags: [] },
    email,
  );
  expect(res.status).toBe(201);
  return Number((await cuerpo<{ id: number }>(res)).id);
}

beforeEach(async () => {
  await freshDb();
});

describe("el listado de cuentas y el gate del admin", () => {
  test("GET /api/users lista por email, solo para el admin", async () => {
    await soy(ANA);
    await soy(CARLA);
    await soy(BEA);

    const res = await get("/api/users");
    expect(res.status).toBe(200);
    const lista = (await res.json()) as Cuenta[];
    const emails = lista.map((u) => u.email);
    expect(emails).toEqual([...emails].sort());
    expect(emails).toEqual(expect.arrayContaining([ADMIN, ANA, BEA, CARLA]));
    for (const u of lista)
      expect(Object.keys(u).sort()).toEqual([
        "email",
        "familyId",
        "id",
        "role",
      ]);
  });

  test("un member recibe 403 en los tres endpoints; el admin los usa", async () => {
    const admin = await soy(ADMIN);
    const ana = await soy(ANA);
    const bea = await soy(BEA);

    const lista = await devGet("/api/users", ANA);
    expect(lista.status).toBe(403);
    expect(await cuerpo(lista)).toEqual({ error: "Forbidden" });
    expect(
      (
        await devSend(
          `/api/families/${admin.familyId}/members`,
          "POST",
          { email: BEA },
          ANA,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await devSend(
          `/api/families/${admin.familyId}/members/${bea.id}`,
          "DELETE",
          null,
          ANA,
        )
      ).status,
    ).toBe(403);

    // El admin sí: añade a Ana a su familia y la saca.
    const alta = await post(`/api/families/${admin.familyId}/members`, {
      email: ANA,
    });
    expect(alta.status).toBe(200);
    expect(await cuerpo(alta)).toEqual({
      id: ana.id,
      email: ANA,
      role: "member",
      familyId: admin.familyId,
    });
    expect(
      (await del(`/api/families/${admin.familyId}/members/${ana.id}`)).status,
    ).toBe(204);
  });
});

describe("añadir un miembro", () => {
  test("cambia de familia y repunta su semana con las comidas", async () => {
    const admin = await soy(ADMIN);
    const ana = await soy(ANA);
    const recetaId = await receta(ANA);

    expect(
      (
        await devSend(
          "/api/meal-plan/2026-W10",
          "PUT",
          { slots: [{ day: 2, meal: "cena", recipeId: recetaId }] },
          ANA,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await devSend(
          "/api/shopping-list/2026-W10/items",
          "PUT",
          { items: [{ food: "arroz", quantity: 1, unit: "kg" }] },
          ANA,
        )
      ).status,
    ).toBe(200);

    const alta = await post(`/api/families/${admin.familyId}/members`, {
      email: ANA,
    });
    expect(alta.status).toBe(200);
    expect(await cuerpo(alta)).toEqual({
      id: ana.id,
      email: ANA,
      role: "member",
      familyId: admin.familyId,
    });

    // La semana se repunta con la familia destino; su familia de uno queda vacía.
    const semana = await d1.get<{ id: number; family_id: number }>(
      "SELECT id, family_id FROM week_plans WHERE iso_week = ?",
      "2026-W10",
    );
    expect(Number(semana?.family_id)).toBe(admin.familyId);
    expect(
      await d1.get(
        "SELECT COUNT(*) AS n FROM week_plans WHERE family_id = ?",
        ana.familyId,
      ),
    ).toEqual({ n: 0 });
    expect(
      await d1.all(
        "SELECT day, meal, recipe_id FROM meal_slots WHERE week_plan_id = ?",
        semana?.id,
      ),
    ).toEqual([{ day: 2, meal: "cena", recipe_id: recetaId }]);
    const comidas = await d1.all<{ food: string }>(
      "SELECT food FROM shopping_items WHERE week_plan_id = ?",
      semana?.id,
    );
    expect(comidas.map((i) => i.food)).toEqual(["arroz"]);

    // La familia destino (ya la de Ana) ve la semana repuntada.
    const vista = await cuerpo<{ slots: { recipeId: number }[] }>(
      await get("/api/meal-plan/2026-W10"),
    );
    expect(vista.slots.map((s) => s.recipeId)).toEqual([recetaId]);
  });

  test("la semana que ya existe se funde: la familia manda en los huecos ocupados", async () => {
    const admin = await soy(ADMIN);
    const ana = await soy(ANA);
    const ra1 = await receta(ANA, "De Ana que choca");
    const ra2 = await receta(ANA, "De Ana libre");
    const rf = await receta(ADMIN, "De la familia");

    // La semana entrante: un hueco que choca (day 0 almuerzo) y uno libre (day 3 cena).
    expect(
      (
        await devSend(
          "/api/meal-plan/2026-W11",
          "PUT",
          {
            slots: [
              { day: 0, meal: "almuerzo", recipeId: ra1 },
              { day: 3, meal: "cena", recipeId: ra2 },
            ],
          },
          ANA,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await devSend(
          "/api/shopping-list/2026-W11/items",
          "PUT",
          {
            items: [{ food: "leche", quantity: 1, unit: "l" }, { food: "pan" }],
          },
          ANA,
        )
      ).status,
    ).toBe(200);

    // La semana de la familia: ocupa day 0 almuerzo y tiene su propia compra.
    expect(
      (
        await put("/api/meal-plan/2026-W11", {
          slots: [{ day: 0, meal: "almuerzo", recipeId: rf }],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await put("/api/shopping-list/2026-W11/items", {
          items: [{ food: "sal", quantity: 1, unit: "kg" }],
        })
      ).status,
    ).toBe(200);

    expect(
      (await post(`/api/families/${admin.familyId}/members`, { email: ANA }))
        .status,
    ).toBe(200);

    // Queda una sola semana (la de la familia); la entrante desaparece.
    const semanas = await d1.all<{ id: number; family_id: number }>(
      "SELECT id, family_id FROM week_plans WHERE iso_week = ?",
      "2026-W11",
    );
    expect(semanas.length).toBe(1);
    expect(Number(semanas[0].family_id)).toBe(admin.familyId);
    expect(
      await d1.get(
        "SELECT COUNT(*) AS n FROM week_plans WHERE family_id = ?",
        ana.familyId,
      ),
    ).toEqual({ n: 0 });

    // El plan de la familia manda en el hueco ocupado; el libre lo rellena Ana.
    expect(
      await d1.all(
        "SELECT day, meal, recipe_id FROM meal_slots WHERE week_plan_id = ? ORDER BY day, meal",
        semanas[0].id,
      ),
    ).toEqual([
      { day: 0, meal: "almuerzo", recipe_id: rf },
      { day: 3, meal: "cena", recipe_id: ra2 },
    ]);
    // La compra entrante llega detrás de la de la familia, en su orden.
    expect(
      await d1.all(
        "SELECT position, food FROM shopping_items WHERE week_plan_id = ? ORDER BY position",
        semanas[0].id,
      ),
    ).toEqual([
      { position: 0, food: "sal" },
      { position: 1, food: "leche" },
      { position: 2, food: "pan" },
    ]);
  });

  test("si la familia de origen se queda con gente, no se lleva nada", async () => {
    const admin = await soy(ADMIN);
    const ana = await soy(ANA);
    await soy(BEA);

    // Ana y Bea comparten familia (la de Ana); Ana tiene una semana.
    expect(
      (await post(`/api/families/${ana.familyId}/members`, { email: BEA }))
        .status,
    ).toBe(200);
    await devSend(
      "/api/meal-plan/2026-W12",
      "PUT",
      { slots: [{ day: 1, meal: "almuerzo" }] },
      ANA,
    );
    const semanaAna = await d1.get<{ family_id: number }>(
      "SELECT family_id FROM week_plans WHERE iso_week = ?",
      "2026-W12",
    );

    // Ana se va a la familia del admin: su semana se queda con Bea.
    expect(
      (await post(`/api/families/${admin.familyId}/members`, { email: ANA }))
        .status,
    ).toBe(200);
    const semanaTrasMover = await d1.get<{ family_id: number }>(
      "SELECT family_id FROM week_plans WHERE iso_week = ?",
      "2026-W12",
    );
    expect(Number(semanaTrasMover?.family_id)).toBe(
      Number(semanaAna?.family_id),
    );
    // Bea sigue viéndola desde la familia de origen.
    const vistaBea = await cuerpo<{ slots: unknown[] }>(
      await devGet("/api/meal-plan/2026-W12", BEA),
    );
    expect(vistaBea.slots.length).toBe(1);
  });
});

describe("quitar un miembro", () => {
  test("familia nueva y vacía; la original conserva sus semanas; sus recetas dejan de verse", async () => {
    const admin = await soy(ADMIN);
    const ana = await soy(ANA);
    await soy(BEA);

    // Ana y Bea entran en la familia del admin (una operación de alta cada una).
    expect(
      (await post(`/api/families/${admin.familyId}/members`, { email: ANA }))
        .status,
    ).toBe(200);
    expect(
      (await post(`/api/families/${admin.familyId}/members`, { email: BEA }))
        .status,
    ).toBe(200);

    // La familia tiene una semana; Ana otra y una receta que ve el resto.
    await put("/api/meal-plan/2026-W20", {
      slots: [{ day: 1, meal: "almuerzo" }],
    });
    await devSend(
      "/api/meal-plan/2026-W21",
      "PUT",
      { slots: [{ day: 4, meal: "cena" }] },
      ANA,
    );
    const recetaId = await receta(ANA);
    expect((await devGet(`/api/recipes/${recetaId}`, BEA)).status).toBe(200);

    expect(
      (await del(`/api/families/${admin.familyId}/members/${ana.id}`)).status,
    ).toBe(204);

    // Familia nueva y vacía.
    const anaDespues = await soy(ANA);
    expect(anaDespues.familyId).not.toBe(admin.familyId);
    expect(
      await d1.get(
        "SELECT COUNT(*) AS n FROM users WHERE family_id = ?",
        anaDespues.familyId,
      ),
    ).toEqual({ n: 1 });

    // Las semanas se quedan donde estaban: la familia conserva las dos.
    for (const semana of ["2026-W20", "2026-W21"]) {
      const vista = await cuerpo<{ slots: unknown[] }>(
        await get(`/api/meal-plan/${semana}`),
      );
      expect(vista.slots.length).toBe(1);
    }

    // Su receta deja de verse por los demás; para ella sigue.
    expect((await devGet(`/api/recipes/${recetaId}`, BEA)).status).toBe(404);
    expect((await devGet(`/api/recipes/${recetaId}`, ADMIN)).status).toBe(404);
    expect((await devGet(`/api/recipes/${recetaId}`, ANA)).status).toBe(200);
  });
});

describe("errores del alta y de la baja", () => {
  test("email inválido, usuario inexistente, ya miembro, familia inexistente, sacarse a sí mismo", async () => {
    const admin = await soy(ADMIN);
    await soy(ANA);
    const bea = await soy(BEA);

    const malo = await post(`/api/families/${admin.familyId}/members`, {
      email: "no-es-un-email",
    });
    expect(malo.status).toBe(400);
    expect(await cuerpo(malo)).toEqual({
      error: expect.any(String),
      field: "email",
    });

    expect(
      (
        await post(`/api/families/${admin.familyId}/members`, {
          email: "nadie@example.com",
        })
      ).status,
    ).toBe(404);
    expect(
      (await post("/api/families/99999/members", { email: ANA })).status,
    ).toBe(404);

    expect(
      (await post(`/api/families/${admin.familyId}/members`, { email: ANA }))
        .status,
    ).toBe(200);
    const otra = await post(`/api/families/${admin.familyId}/members`, {
      email: ANA,
    });
    expect(otra.status).toBe(409);
    expect(await cuerpo(otra)).toEqual({ error: expect.any(String) });

    // Sacarse a sí mismo de su propia familia: 400.
    expect(
      (await del(`/api/families/${admin.familyId}/members/${admin.id}`)).status,
    ).toBe(400);
    // Sacar a quien no está en esa familia: 404.
    expect(
      (await del(`/api/families/${admin.familyId}/members/${bea.id}`)).status,
    ).toBe(404);
  });
});
