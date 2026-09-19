import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest, seededExercise } from "./helpers";

type ItemPayload = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
};

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

  // Base fija, no aleatoria: la base de e2e nace de las migraciones en cada
  // corrida, así que no hay residuo de intentos anteriores. Cada test que
  // escribe una sesión se queda con su PROPIA semana ISO (offsets múltiplos de
  // 7), de modo que dos tests nunca compiten por la misma fecha — que es UNIQUE
  // — y ninguno escribe en "hoy".
  const BASE_OFFSET = 14;
  const dayFrom = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + BASE_OFFSET + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const weekOf = (offsetDays: number) => isoWeekOf(dayFrom(offsetDays));

  /** Un reintento del mismo test reencuentra su sesión ya guardada: la quita
   *  antes de volver a crearla. Solo toca sesiones `planned` de una fecha que
   *  este test tiene en exclusiva, nunca datos de otro test ni de otra corrida. */
  async function resetPlanned(request: APIRequestContext, date: string) {
    const sessions = await apiRequest<
      { id: number; date: string; status: string }[]
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
    const press = await seededExercise(page.request, "Press banca");
    const run = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/exercises",
      { name: "Cinta de correr", tags: ["cardio"], kind: "running" },
    );
    const name = "Empuje A";
    await createTemplate(page.request, name, [
      { exerciseId: press.id, targetSets: 4, targetRepsMin: 8 },
      { exerciseId: run.id, targetDistanceKm: 10, targetDurationMin: 45 },
    ]);

    await page.goto("/plantillas");
    const card = page.locator("section").filter({ hasText: name }).first();
    await card.getByRole("button", { name, exact: true }).click();
    await expect(card.getByText("4 series")).toBeVisible();
    await expect(card.getByText("10 km · 45 min")).toBeVisible();
  });

  test("día vacío → editor: expandir plantilla, dedupe y guardar", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const tplA = "Empuje B";
    await createTemplate(page.request, tplA, [
      { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
      { exerciseId: remo.id, targetSets: 3, targetRepsMin: 10 },
    ]);
    const tplB = "Solo banca";
    await createTemplate(page.request, tplB, [
      { exerciseId: press.id, targetSets: 5, targetRepsMin: 5 },
    ]);
    const week = weekOf(0);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    await page.goto(`/plan-fuerza?week=${week}`);

    // Primer día de la rejilla = lunes, que es la fecha elegida.
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await expect(
      page.getByText(new RegExp(`Nueva sesión · ${date}`)),
    ).toBeVisible();

    // Un único modal: el selector ya está a la vista, sin botón ni segundo modal.
    const dialog = page.getByRole("dialog", {
      name: new RegExp(`Nueva sesión · ${date}`),
    });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    // Expandir las dos plantillas: solo entra el ejercicio nuevo, sin duplicar.
    await dialog
      .getByRole("button", { name: new RegExp(escapeRe(tplB)) })
      .click();
    await dialog
      .getByRole("button", { name: new RegExp(escapeRe(tplA)) })
      .click();
    // El aviso se ve dentro del propio modal y la plantilla cubierta queda marcada.
    await expect(
      dialog.getByText(/1 ejercicio ya estaba en el día/),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: new RegExp(escapeRe(tplB)) }),
    ).toBeDisabled();
    await expect(
      dialog.getByRole("list", { name: "Ejercicios del día" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Quitar" })).toHaveCount(2);

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(
      page.getByRole("button", { name: `Editar sesión del ${date}` }),
    ).toBeVisible();
    await expect(page.getByText("Pendiente").first()).toBeVisible();
    // La celda del día desglosa los ejercicios de la plantilla expandida.
    const dayList = page.getByRole("list", { name: `Ejercicios del ${date}` });
    await expect(dayList.getByText("Press banca")).toBeVisible();
    await expect(dayList.getByText("Remo con barra")).toBeVisible();
  });

  test("añadir un ejercicio a una sesión que ya tiene ejercicios", async ({
    page,
  }) => {
    const pressName = "Press banca";
    const remoName = "Remo con barra";
    const press = await seededExercise(page.request, pressName);
    const remo = await seededExercise(page.request, remoName);
    const week = weekOf(49);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      "Sesión con ejercicios",
    );

    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    // Modal único: el lateral lista lo que ya tiene el día y el selector está a la vista.
    const dialog = page.getByRole("dialog", {
      name: new RegExp(`Editar sesión · ${date}`),
    });
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(
      dialog
        .getByRole("list", { name: "Ejercicios del día" })
        .getByText(pressName),
    ).toBeVisible();

    // Añadir sin botón intermedio ni segundo modal (la búsqueda despliega el grupo).
    await dialog.getByLabel("Buscar").fill(remoName);
    await dialog.getByRole("button", { name: remoName, exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: `Quitar ${remoName}` }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Pendiente").first()).toBeVisible();

    // Reabrir con el botón "+" de la celda poblada: el añadido persiste.
    await page
      .getByRole("button", { name: `Añadir ejercicios al ${date}` })
      .click();
    await expect(
      page.getByRole("button", { name: `Quitar ${pressName}` }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Quitar ${remoName}` }),
    ).toBeVisible();
  });

  test("editar la sesión cambia las series y persiste", async ({ page }) => {
    const pressName = "Press banca";
    const press = await seededExercise(page.request, pressName);
    const week = weekOf(7);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      "Sesión de series",
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
    const press = await seededExercise(page.request, "Press banca");
    const run = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/exercises",
      { name: "Bici estática", tags: ["cardio"], kind: "bike" },
    );
    const week = weekOf(14);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = "Sesión con cardio";
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
    const press = await seededExercise(page.request, "Press banca");
    const week = weekOf(21);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3 }],
      "Sesión reprogramada",
    );

    // El día ya ocupado se edita (PUT), nunca se crea otra sesión.
    await page.goto(`/plan-fuerza?week=${weekOf(21)}`);
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
    const press = await seededExercise(page.request, "Press banca");
    const week = weekOf(28);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3 }],
      "Sesión a desprogramar",
    );
    await page.goto(`/plan-fuerza?week=${weekOf(28)}`);

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
    const name = "Fondos en paralelas";
    await page.route("**/api/plan-sessions", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Ya hay una sesión ese día" }),
      });
    });

    await page.goto(`/plan-fuerza?week=${weekOf(35)}`);
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await page.getByLabel("Buscar").fill(name);
    await page
      .getByRole("button", { name: new RegExp(escapeRe(name)) })
      .click();
    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Ya hay una sesión ese día")).toBeVisible();
  });

  test("badge Hecho tras registrar una sesión", async ({ page }) => {
    const press = await seededExercise(page.request, "Press banca");
    const week = weekOf(42);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = "Sesión registrada";
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

    await page.goto(`/plan-fuerza?week=${weekOf(42)}`);
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

  test("reordenar los ejercicios del día por arrastre y persistir", async ({
    page,
  }) => {
    const pressName = "Press banca";
    const remoName = "Remo con barra";
    const press = await seededExercise(page.request, pressName);
    const remo = await seededExercise(page.request, remoName);
    const week = weekOf(56);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = await createSession(
      page.request,
      date,
      [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 3, targetRepsMin: 10 },
      ],
      "Sesión a reordenar",
    );

    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    const dialog = page.getByRole("dialog", {
      name: new RegExp(`Editar sesión · ${date}`),
    });
    const list = dialog.getByRole("list", { name: "Ejercicios del día" });
    // Cada fila lleva un asa de arrastre con el nombre del ejercicio.
    const handles = dialog.getByRole("button", { name: /^Mover / });
    await expect(handles).toHaveCount(2);
    const order = () =>
      handles.evaluateAll((els) =>
        els.map((el) =>
          (el.getAttribute("aria-label") ?? "").replace(/^Mover /, ""),
        ),
      );
    expect(await order()).toEqual([pressName, remoName]);

    // Arrastrar el remo por encima del press (ratón real, PointerSensor).
    const from = await dialog
      .getByRole("button", { name: `Mover ${remoName}` })
      .boundingBox();
    const to = await list.getByText(pressName).boundingBox();
    if (!from || !to) throw new Error("Sin caja para arrastrar");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    expect(await order()).toEqual([remoName, pressName]);

    // dnd-kit deja 50 ms un filtro de click en el documento tras soltar (para
    // que el click del arrastre no active lo que haya debajo): deja que expire
    // antes de pulsar Guardar.
    await page.waitForTimeout(100);
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Pendiente").first()).toBeVisible();

    // Persistió en la base: la API devuelve el nuevo orden…
    const detail = await apiRequest<{ exercises: { exerciseName: string }[] }>(
      page.request,
      "GET",
      `/api/plan-sessions/${session.id}`,
    );
    expect(detail.exercises.map((e) => e.exerciseName)).toEqual([
      remoName,
      pressName,
    ]);

    // …y al reabrir el editor se ve igual.
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    await expect(handles.first()).toHaveAttribute(
      "aria-label",
      `Mover ${remoName}`,
    );
  });

  test("reordenar también con el dedo (táctil)", async ({ page }) => {
    const pressName = "Press banca";
    const remoName = "Remo con barra";
    const press = await seededExercise(page.request, pressName);
    const remo = await seededExercise(page.request, remoName);
    const week = weekOf(63);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = await createSession(
      page.request,
      date,
      [
        { exerciseId: press.id, targetSets: 3 },
        { exerciseId: remo.id, targetSets: 3 },
      ],
      "Sesión táctil",
    );

    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    const dialog = page.getByRole("dialog", {
      name: new RegExp(`Editar sesión · ${date}`),
    });
    const list = dialog.getByRole("list", { name: "Ejercicios del día" });
    const handles = dialog.getByRole("button", { name: /^Mover / });
    await expect(handles).toHaveCount(2);

    const from = await dialog
      .getByRole("button", { name: `Mover ${remoName}` })
      .boundingBox();
    const to = await list.getByText(pressName).boundingBox();
    if (!from || !to) throw new Error("Sin caja para arrastrar");
    const x = from.x + from.width / 2;
    const y0 = from.y + from.height / 2;
    const y1 = to.y + to.height / 2;

    // Dedo de verdad (CDP): el TouchSensor exige mantener pulsado 250 ms.
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", y: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints: type === "touchEnd" ? [] : [{ x, y }],
      });
    await touch("touchStart", y0);
    await page.waitForTimeout(300);
    for (const t of [0.25, 0.5, 0.75, 1]) {
      await touch("touchMove", y0 + (y1 - y0) * t);
      await page.waitForTimeout(30);
    }
    await touch("touchEnd", y1);

    await expect(handles.first()).toHaveAttribute(
      "aria-label",
      `Mover ${remoName}`,
    );
    await page.waitForTimeout(100); // el filtro de click de dnd-kit expira
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Pendiente").first()).toBeVisible();

    const detail = await apiRequest<{ exercises: { exerciseName: string }[] }>(
      page.request,
      "GET",
      `/api/plan-sessions/${session.id}`,
    );
    expect(detail.exercises.map((e) => e.exerciseName)).toEqual([
      remoName,
      pressName,
    ]);
  });

  test("la celda del día edita en el sitio: info y reordenar por arrastre", async ({
    page,
  }) => {
    const pressName = "Press banca";
    const remoName = "Remo con barra";
    const press = await seededExercise(page.request, pressName);
    const remo = await seededExercise(page.request, remoName);
    const week = weekOf(70);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = await createSession(
      page.request,
      date,
      [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 4, targetRepsMin: 10 },
      ],
      "Sesión editable",
    );

    await page.goto(`/plan-fuerza?week=${week}`);
    const dayList = page.getByRole("list", { name: `Ejercicios del ${date}` });
    // La info básica se ve sin abrir nada.
    await expect(dayList.getByText("3 series")).toBeVisible();
    await expect(dayList.getByText("4 series")).toBeVisible();

    // Asas de arrastre dentro de la celda, sin modal.
    const handles = dayList.getByRole("button", { name: /^Mover / });
    await expect(handles).toHaveCount(2);
    const order = () =>
      handles.evaluateAll((els) =>
        els.map((el) =>
          (el.getAttribute("aria-label") ?? "").replace(/^Mover /, ""),
        ),
      );
    expect(await order()).toEqual([pressName, remoName]);

    const from = await dayList
      .getByRole("button", { name: `Mover ${remoName}` })
      .boundingBox();
    const to = await dayList.getByText(pressName).boundingBox();
    if (!from || !to) throw new Error("Sin caja para arrastrar");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    expect(await order()).toEqual([remoName, pressName]);

    // Se guarda al soltar, sin abrir el editor…
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => {
        const detail = await apiRequest<{
          exercises: { exerciseName: string }[];
        }>(page.request, "GET", `/api/plan-sessions/${session.id}`);
        return detail.exercises.map((e) => e.exerciseName);
      })
      .toEqual([remoName, pressName]);

    // …y sigue así tras recargar.
    await page.reload();
    await expect(handles.first()).toHaveAttribute(
      "aria-label",
      `Mover ${remoName}`,
    );

    // El clic en la celda (fuera de asas y botones) abre el editor.
    await dayList.getByText(pressName).first().click();
    await expect(
      page.getByRole("dialog", { name: new RegExp(`Editar sesión · ${date}`) }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("el selector del día agrupa por músculo y la búsqueda despliega", async ({
    page,
  }) => {
    await page.goto(`/plan-fuerza?week=${weekOf(77)}`);
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    const dialog = page.getByRole("dialog", { name: /Nueva sesión ·/ });
    // Grupos plegables con nombre y conteo: los ejercicios no se ven hasta abrir.
    // Ojo: «Press banca» cuelga de Hombro (su primer tag es hombro, no pecho).
    const hombro = dialog.getByRole("button", { name: /^Hombro \(\d+\)$/ });
    await expect(hombro).toBeVisible();
    await expect(hombro).toHaveAttribute("aria-expanded", "false");
    await expect(
      dialog.getByRole("button", { name: "Press banca", exact: true }),
    ).toHaveCount(0);

    await hombro.click();
    await expect(
      dialog.getByRole("button", { name: "Press banca", exact: true }),
    ).toBeVisible();

    // La búsqueda despliega los grupos con coincidencias.
    await dialog.getByLabel("Buscar").fill("Remo con barra");
    await expect(
      dialog.getByRole("button", { name: "Remo con barra", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
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
