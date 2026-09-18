import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

type ItemPayload = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
};

/** Ejercicio del catálogo (fuerza o cardio) creado por API con nombre único. */
function createExercise(
  request: APIRequestContext,
  name: string,
  kind: "strength" | "running" | "bike" = "strength",
) {
  return apiRequest<{ id: number }>(request, "POST", "/api/exercises", {
    name,
    tags: [kind === "strength" ? "pecho" : "cardio"],
    kind,
  });
}

/** Plantilla (agrupación semántica) con los items indicados. */
function createTemplate(
  request: APIRequestContext,
  name: string,
  items: ItemPayload[],
) {
  return apiRequest<{ id: number }>(request, "POST", "/api/templates", {
    name,
    exercises: items,
  });
}

/** Sesión del día: nombre + items expandidos. */
function createSession(
  request: APIRequestContext,
  date: string,
  items: ItemPayload[],
  name?: string,
) {
  return apiRequest<{ id: number }>(request, "POST", "/api/plan-sessions", {
    date,
    name,
    items,
  });
}

/** ISO week "YYYY-Www" de una fecha UTC (misma convención que la app). */
function isoWeekOf(date: string): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // jueves
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const week =
    1 + Math.round((t.getTime() - jan4.getTime()) / (7 * 86_400_000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

test.describe("STRENGTH — sesión del día con plantillas y cardio", () => {
  test.use({ storageState: ".auth/state.json" });

  // Fechas únicas por ejecución (el offset codifica la run) para no chocar con
  // sesiones de intentos anteriores.
  const RUN_OFFSET = 30 + (Date.now() % 300);
  const iso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + RUN_OFFSET + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const weekOf = (offsetDays: number) => isoWeekOf(iso(offsetDays));

  /** Borra sesiones planned de una fecha (logged → 409, se deja). */
  async function clearDate(request: APIRequestContext, date: string) {
    const sessions = await apiRequest<
      { id: number; status: string; date: string }[]
    >(request, "GET", "/api/plan-sessions");
    for (const s of sessions.filter(
      (s) => s.date === date && s.status === "planned",
    )) {
      await request.delete(`/api/plan-sessions/${s.id}`);
    }
  }

  test("plantilla con fuerza + cardio se muestra en la tarjeta", async ({
    page,
  }) => {
    const press = await createExercise(page.request, uniqueName("Banca E2E"));
    const run = await createExercise(
      page.request,
      uniqueName("Running E2E"),
      "running",
    );
    const name = uniqueName("Plantilla E2E");
    await createTemplate(page.request, name, [
      { exerciseId: press.id, targetSets: 4, targetRepsMin: 8 },
      { exerciseId: run.id, targetDistanceKm: 10, targetDurationMin: 45 },
    ]);

    await page.goto("/plan-fuerza");
    const card = page.locator("section").filter({ hasText: name }).first();
    await card.getByRole("button", { name, exact: true }).click();
    await expect(card.getByText("4 series")).toBeVisible();
    await expect(card.getByText("10 km · 45 min")).toBeVisible();
  });

  test("día vacío → editor: expandir plantilla, dedupe y guardar", async ({
    page,
  }) => {
    const press = await createExercise(page.request, uniqueName("Banca E2E"));
    const remo = await createExercise(page.request, uniqueName("Remo E2E"));
    const tplA = uniqueName("Empuje E2E");
    await createTemplate(page.request, tplA, [
      { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
      { exerciseId: remo.id, targetSets: 3, targetRepsMin: 10 },
    ]);
    const tplB = uniqueName("Solo banca E2E");
    await createTemplate(page.request, tplB, [
      { exerciseId: press.id, targetSets: 5, targetRepsMin: 5 },
    ]);
    const week = weekOf(0);
    const date = mondayOf(week);
    await clearDate(page.request, date);
    await page.goto(`/plan-fuerza?week=${week}`);
    test.skip(
      (await page
        .getByRole("button", { name: `Editar sesión del ${date}` })
        .count()) > 0,
      "queda una sesión registrada de otra ejecución en el lunes de esta semana",
    );

    // Primer día de la rejilla = lunes, que es la fecha elegida.
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await expect(
      page.getByText(new RegExp(`Nueva sesión · ${date}`)),
    ).toBeVisible();

    // Expandir las dos plantillas: solo entra el ejercicio nuevo, sin duplicar.
    await page.getByRole("button", { name: "+ Añadir", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Añadir al día" });
    await dialog
      .getByRole("button", { name: new RegExp(escapeRe(tplA)) })
      .click();
    await dialog
      .getByRole("button", { name: new RegExp(escapeRe(tplB)) })
      .click();
    await expect(
      page.getByText(/1 ejercicio ya estaba en el día/),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByRole("button", { name: "Quitar" })).toHaveCount(2);

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(
      page.getByRole("button", { name: `Editar sesión del ${date}` }),
    ).toBeVisible();
    await expect(page.getByText("Pendiente").first()).toBeVisible();
  });

  test("editar la sesión cambia las series y persiste", async ({ page }) => {
    const pressName = uniqueName("Banca E2E");
    const press = await createExercise(page.request, pressName);
    const week = weekOf(1);
    const date = mondayOf(week);
    await clearDate(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      uniqueName("Sesión E2E"),
    );
    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    await page
      .getByLabel(new RegExp(`${escapeRe(pressName)} series`, "i"))
      .fill("6");
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Pendiente").first()).toBeVisible();

    // Reabrir: el valor persistido es 6.
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    await expect(
      page.getByLabel(new RegExp(`${escapeRe(pressName)} series`, "i")),
    ).toHaveValue("6");
  });

  test("registrar el día con series + cardio (marcas y solo hecho)", async ({
    page,
  }) => {
    const press = await createExercise(page.request, uniqueName("Banca E2E"));
    const run = await createExercise(
      page.request,
      uniqueName("Running E2E"),
      "running",
    );
    const date = iso(2);
    await clearDate(page.request, date);
    const session = uniqueName("Sesión E2E");
    await createSession(
      page.request,
      date,
      [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: run.id, targetDistanceKm: 5, targetDurationMin: 30 },
      ],
      session,
    );

    await page.goto(`/sesion/${date}`);
    await expect(page.getByText(session).first()).toBeVisible();

    // Fuerza: marcar la primera serie.
    await page
      .getByRole("button", { name: /Series de / })
      .first()
      .click();
    await page
      .getByRole("checkbox", { name: / serie 1$/ })
      .first()
      .check();

    // Cardio: marcar Hecho sin marcas.
    await page
      .getByRole("checkbox", { name: /hecho$/i })
      .first()
      .check();

    await page.getByText("Moderado", { exact: true }).click();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Cerrar sesión" })
      .click();
    await expect(page.getByText("Registrado")).toBeVisible();
    await expect(page.getByText("Hecho sin marcas")).toBeVisible();

    // La tarjeta del día muestra el resumen ya registrado.
    await page.goto("/");
    await page.getByLabel("Ir a una fecha").fill(date);
    await expect(page.getByText(/Sesión completada/)).toBeVisible();
  });

  test("reprogramar un día ocupado no duplica la sesión", async ({ page }) => {
    const press = await createExercise(page.request, uniqueName("Banca E2E"));
    const date = iso(3);
    await clearDate(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3 }],
      uniqueName("Sesión E2E"),
    );

    // El día ya ocupado se edita (PUT), nunca se crea otra sesión.
    await page.goto(`/plan-fuerza?week=${weekOf(3)}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    await expect(
      page.getByText(new RegExp(`Editar sesión · ${date}`)),
    ).toBeVisible();
    const sessions = await apiRequest<{ date: string }[]>(
      page.request,
      "GET",
      "/api/plan-sessions",
    );
    expect(sessions.filter((s) => s.date === date)).toHaveLength(1);
  });

  test("desprogramar con la ✕ (confirmación inline)", async ({ page }) => {
    const press = await createExercise(page.request, uniqueName("Banca E2E"));
    const date = iso(4);
    await clearDate(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3 }],
      uniqueName("Sesión E2E"),
    );
    await page.goto(`/plan-fuerza?week=${weekOf(4)}`);

    const desprogramar = page.getByRole("button", {
      name: `Desprogramar sesión del ${date}`,
    });
    await expect(desprogramar).toBeVisible();
    await desprogramar.click();
    const confirmar = page.getByRole("button", {
      name: "Confirmar desprogramar",
    });
    await expect(confirmar).toBeVisible();
    await confirmar.click();

    await expect(desprogramar).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Editar sesión del ${date}` }),
    ).toHaveCount(0);
  });

  test("error del servidor visible al guardar (409)", async ({ page }) => {
    const name = uniqueName("Banca E2E");
    await createExercise(page.request, name);
    const date = iso(5);
    await clearDate(page.request, date);
    await page.route("**/api/plan-sessions", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Ya hay una sesión ese día" }),
      });
    });

    await page.goto(`/plan-fuerza?week=${weekOf(5)}`);
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await page.getByRole("button", { name: "+ Añadir", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Añadir al día" });
    await dialog
      .getByRole("button", { name: new RegExp(escapeRe(name)) })
      .click();
    await dialog.getByRole("button", { name: "Cerrar" }).click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Ya hay una sesión ese día")).toBeVisible();
  });

  test("badge Hecho tras registrar una sesión", async ({ page }) => {
    const press = await createExercise(page.request, uniqueName("Banca E2E"));
    const date = iso(6);
    await clearDate(page.request, date);
    const session = uniqueName("Sesión E2E");
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3 }],
      session,
    );

    await page.goto(`/sesion/${date}`);
    await page
      .getByRole("button", { name: /Series de / })
      .first()
      .click();
    await page
      .getByRole("checkbox", { name: / serie 1$/ })
      .first()
      .check();
    await page.getByText("Moderado", { exact: true }).click();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Cerrar sesión" })
      .click();
    await expect(page.getByText("Registrado")).toBeVisible();

    await page.goto(`/plan-fuerza?week=${weekOf(6)}`);
    await expect(
      page.getByText("Hecho", { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByText(session).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Desprogramar sesión del ${date}` }),
    ).toHaveCount(0);
  });

  test("navegación de semanas", async ({ page }) => {
    const cur = weekOf(7);
    await page.goto(`/plan-fuerza?week=${cur}`);
    await expect(
      page.getByRole("heading", { name: cur, exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Semana siguiente" }).click();
    const monday = mondayOf(cur);
    const next = isoWeekOf(
      new Date(Date.parse(`${monday}T12:00:00Z`) + 7 * 86_400_000)
        .toISOString()
        .slice(0, 10),
    );
    await expect(
      page.getByRole("heading", { name: next, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("week")).toBe(next);

    await page.getByRole("button", { name: "Semana anterior" }).click();
    await expect(
      page.getByRole("heading", { name: cur, exact: true }),
    ).toBeVisible();
  });

  /** Lunes de la semana ISO (espejo de week-grid.tsx). */
  function mondayOf(week: string): string {
    const [year, w] = week.split("-W").map(Number);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(
      jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
    );
    monday.setUTCDate(monday.getUTCDate() + (w - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }

  function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
});
