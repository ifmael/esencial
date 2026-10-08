import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { apiRequest, apiUrl, finishSession, seededExercise } from "./helpers";

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

/** Espera a que acaben las animaciones de la página (entrada del diálogo y
 * transición de vista día → modal): mientras duran, la capa de la transición
 * se queda con el puntero y las cajas aún se mueven. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (a) =>
          a.playState !== "running" ||
          a.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
}

/** El contrato de «cabe entero» del modo sesión: ni el `section`, ni el cuerpo
 *  que puede desplazar, ni la página desbordan su caja. `scrollHeight` reales. */
async function modeScroll(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    const body = [...section.children].find((el) => {
      const { overflowY } = getComputedStyle(el as HTMLElement);
      return overflowY === "auto" || overflowY === "scroll";
    }) as HTMLElement | undefined;
    return {
      sectionScroll: section.scrollHeight,
      sectionClient: section.clientHeight,
      bodyScroll: body?.scrollHeight ?? 0,
      bodyClient: body?.clientHeight ?? 0,
      documentScroll: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Avanza el modo sesión hasta el ejercicio pedido (uno a uno, saltando la
 *  pausa que estuviera corriendo): el mismo camino que sigue la persona. */
async function goToItem(mode: Locator, name: string) {
  for (let i = 0; i < 8; i += 1) {
    if ((await mode.getByRole("heading", { name }).count()) > 0) return;
    const skip = mode.getByRole("button", { name: "Saltar" });
    if ((await skip.count()) > 0) {
      await skip.click();
      continue;
    }
    await mode.getByRole("button", { name: "Ejercicio siguiente" }).click();
  }
  throw new Error(`No llegué a ${name} dentro del modo sesión`);
}

test.describe("STRENGTH — sesión del día con plantillas y cardio", () => {
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
      // apiUrl: la API es OTRO origen; una ruta relativa acabaría en el frontal
      // (que no tiene /api/*) y el borrado se perdería en silencio.
      await request.delete(apiUrl(`/api/plan-sessions/${s.id}`));
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

    await page.getByRole("button", { name: "Guardar", exact: true }).click();
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
    await dialog.getByLabel("Buscar plantilla o ejercicio").fill(remoName);
    await dialog.getByRole("button", { name: remoName, exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: `Quitar ${remoName}` }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
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
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
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
    // El resumen no registra; se hace todo dentro del modo sesión.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });

    // Fuerza: la primera serie se marca al completar kilos y reps.
    // La base es compartida: «Sin peso» sale de lo último registrado.
    await mode
      .getByRole("switch", { name: "Sin peso · Press banca" })
      .uncheck();
    await mode
      .getByLabel("Peso (kg) · Press banca serie 1", { exact: true })
      .fill("60");
    await mode
      .getByLabel("Reps · Press banca serie 1", { exact: true })
      .fill("8");
    await expect(
      mode.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();

    // Cardio: marcar Hecho sin marcas.
    await goToItem(mode, "Bici estática");
    await mode.getByRole("checkbox", { name: "Bici estática hecho" }).check();

    await finishSession(mode);
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

    // Cancelar sale del paso de confirmación sin desprogramar la sesión.
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmar).toHaveCount(0);
    await expect(desprogramar).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Editar sesión del ${date}` }),
    ).toBeVisible();

    await desprogramar.click();
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
    await page.getByLabel("Buscar plantilla o ejercicio").fill(name);
    await page
      .getByRole("button", { name: new RegExp(escapeRe(name)) })
      .click();
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
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
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await mode
      .getByRole("switch", { name: "Sin peso · Press banca" })
      .uncheck();
    await mode
      .getByLabel("Peso (kg) · Press banca serie 1", { exact: true })
      .fill("60");
    await mode
      .getByLabel("Reps · Press banca serie 1", { exact: true })
      .fill("8");
    await expect(
      mode.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();
    await finishSession(mode);
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
    await settle(page);
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
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
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

    await settle(page);
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
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
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

  test("desprogramar un ejercicio desde la celda (confirmación en línea)", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const dominadas = await seededExercise(page.request, "Dominadas");
    const week = weekOf(84);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = await createSession(
      page.request,
      date,
      [
        { exerciseId: press.id, targetSets: 3 },
        { exerciseId: remo.id, targetSets: 4 },
        { exerciseId: dominadas.id, targetSets: 3 },
      ],
      "Sesión a recortar",
    );

    await page.goto(`/plan-fuerza?week=${week}`);
    const dayList = page.getByRole("list", { name: `Ejercicios del ${date}` });
    await expect(dayList.getByText("Remo con barra")).toBeVisible();

    // La ✕ de la fila pide confirmación sin abrir el editor del día.
    await dayList
      .getByRole("button", { name: "Desprogramar Remo con barra" })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirmar quitar Remo con barra" }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Cancelar no desprograma nada.
    await page
      .getByRole("button", { name: "Cancelar quitar Remo con barra" })
      .click();
    await expect(
      page.getByRole("button", { name: "Confirmar quitar Remo con barra" }),
    ).toHaveCount(0);
    await expect(dayList.getByText("Remo con barra")).toBeVisible();

    // Confirmar quita SOLO ese ejercicio del día.
    await dayList
      .getByRole("button", { name: "Desprogramar Remo con barra" })
      .click();
    await page
      .getByRole("button", { name: "Confirmar quitar Remo con barra" })
      .click();
    await expect(dayList.getByText("Remo con barra")).toHaveCount(0);
    await expect(dayList.getByText("Press banca")).toBeVisible();
    await expect
      .poll(async () => {
        const detail = await apiRequest<{
          exercises: { exerciseName: string }[];
        }>(page.request, "GET", `/api/plan-sessions/${session.id}`);
        return detail.exercises.map((e) => e.exerciseName);
      })
      .toEqual(["Press banca", "Dominadas"]);

    // …y sigue fuera tras recargar.
    await page.reload();
    await expect(dayList.getByText("Press banca")).toBeVisible();
    await expect(dayList.getByText("Remo con barra")).toHaveCount(0);

    // El último ejercicio del día también se quita: sin items no hay sesión,
    // así que el día vuelve a su «+ añadir».
    await dayList
      .getByRole("button", { name: "Desprogramar Dominadas" })
      .click();
    await page
      .getByRole("button", { name: "Confirmar quitar Dominadas" })
      .click();
    await expect(dayList.getByText("Press banca")).toBeVisible();
    await dayList
      .getByRole("button", { name: "Desprogramar Press banca" })
      .click();
    await page
      .getByRole("button", { name: "Confirmar quitar Press banca" })
      .click();

    await expect(dayList).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: `Desprogramar sesión del ${date}` }),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const sessions = await apiRequest<{ date: string }[]>(
          page.request,
          "GET",
          "/api/plan-sessions",
        );
        return sessions.filter((s) => s.date === date).length;
      })
      .toBe(0);
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
    await dialog
      .getByLabel("Buscar plantilla o ejercicio")
      .fill("Remo con barra");
    await expect(
      dialog.getByRole("button", { name: "Remo con barra", exact: true }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("abrir el editor del día no pinta la rejilla encima del modal", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    const week = weekOf(91);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      "Sesión que se abre",
    );

    await page.goto(`/plan-fuerza?week=${week}`);
    // La transición se alarga para poder mirarla A MITAD (en la app dura 435 ms).
    await page.addStyleTag({
      content: ":root{--duration-spatial-default:3000ms}",
    });
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();

    const mid = await page.waitForFunction(() => {
      const pseudoOf = (a: Animation) =>
        (a.effect as KeyframeEffect | null)?.pseudoElement ?? "";
      const running = () => document.getAnimations();
      const box = running().find(
        (a) => pseudoOf(a) === "::view-transition-group(day-sheet)",
      );
      if (!box || (box.effect?.getComputedTiming().progress ?? 0) < 0.5)
        return null;
      const html = document.documentElement;
      const source = getComputedStyle(html, "::view-transition-old(day-sheet)");
      return {
        // Si la rejilla fuera una capa de esta transición, el navegador la
        // pintaría por encima del velo y del modal: el calendario se colaría
        // encima mientras la modal crece.
        gridLayers: running()
          .filter((a) => pseudoOf(a).includes("week-grid"))
          .map((a) => pseudoOf(a)),
        // La columna de origen se despide pronto y nunca se dibuja fuera del
        // contenedor que crece.
        sourceOpacity: Number(source.opacity),
        sourceHeight: Number.parseFloat(source.height),
        boxHeight: Number.parseFloat(
          getComputedStyle(html, "::view-transition-group(day-sheet)").height,
        ),
      };
    });

    const frame = (await mid.jsonValue()) as {
      gridLayers: string[];
      sourceOpacity: number;
      sourceHeight: number;
      boxHeight: number;
    };
    expect(frame.gridLayers).toEqual([]);
    expect(frame.sourceOpacity).toBe(0);
    expect(frame.sourceHeight).toBeLessThanOrEqual(frame.boxHeight + 1);
  });

  test("cargar la sesión al editar no encoge la rejilla", async ({ page }) => {
    const press = await seededExercise(page.request, "Press banca");
    const week = weekOf(98);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const { id } = await createSession(page.request, date, [
      { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
    ]);

    // El detalle tarda: mientras llega, la página muestra que está cargando.
    let release = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    await page.route(`**/api/plan-sessions/${id}`, async (route) => {
      await held;
      await route.continue();
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/plan-fuerza?week=${week}`);
    const grid = page.locator("section").filter({ hasText: week });
    const open = page.getByRole("button", {
      name: `Editar sesión del ${date}`,
    });
    // Medir con la semana ya cargada: su propio loader también cambia el alto.
    await expect(open).toBeVisible();
    const before = await grid.boundingBox();
    await open.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Cargando sesión…" }),
    ).toBeAttached();
    // La rejilla es la que se ve en la foto «antes» de la transición día →
    // modal: si encoge aquí, vuelve a crecer mientras la modal se expande.
    expect(await grid.boundingBox()).toEqual(before);
    release();
    await expect(
      page.getByRole("dialog", { name: new RegExp(`Editar sesión · ${date}`) }),
    ).toBeVisible();
  });

  test("sesión anterior del mismo nombre, serie auto-marcada, sin peso y corregir el registro", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const name = "Empuje e2e repetida";
    // Las dos sesiones acaban `logged` y la API no borra un registro: cada
    // reintento usa su propio par de semanas en vez de chocar (409) con el anterior.
    const offset = 105 + testInfo.retry * 14;
    const before = mondayOf(weekOf(offset));
    const date = mondayOf(weekOf(offset + 7));
    const prev = await apiRequest<{ exercises: { id: number }[] }>(
      page.request,
      "POST",
      "/api/plan-sessions",
      {
        date: before,
        name,
        items: [{ exerciseId: press.id, targetSets: 2 }],
      },
    );
    const seId = prev.exercises[0].id;
    const set = (setIndex: number, reps: number) => ({
      planSessionExerciseId: seId,
      setIndex,
      weightKg: 60,
      reps,
      done: true,
    });
    await apiRequest(page.request, "POST", `/api/workout-logs/${before}`, {
      effort: 3,
      sets: [set(0, 10), set(1, 8)],
    });
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8 }],
      name,
    );

    await page.goto(`/sesion/${date}`);
    await expect(page.getByText(/: 60×10 · 60×8$/)).toBeVisible();

    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    const box1 = mode.getByRole("checkbox", { name: "Press banca serie 1" });
    const reps1 = mode.getByLabel("Reps · Press banca serie 1", {
      exact: true,
    });
    const weight1 = mode.getByLabel("Peso (kg) · Press banca serie 1", {
      exact: true,
    });
    await expect(box1).not.toBeChecked(); // la precarga no marca
    await reps1.fill("9");
    await expect(box1).toBeChecked(); // kilos (precargados) + reps editadas
    await weight1.fill("");
    await expect(box1).not.toBeChecked(); // vaciar desmarca

    // Con reps y sin kilos, pasar a «sin peso» completa la serie.
    await mode.getByRole("switch", { name: "Sin peso · Press banca" }).check();
    await expect(weight1).toHaveCount(0);
    await expect(box1).toBeChecked();
    await reps1.fill("12");
    await expect(box1).toBeChecked();

    await finishSession(mode);
    await expect(page.getByText("Registrado")).toBeVisible();
    await expect(page.getByText("12 reps")).toBeVisible();

    // Corregir el registro: el modo sale de lo registrado y guarda con PUT.
    await page.getByRole("button", { name: "Editar" }).click();
    const edit = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(
      edit.getByRole("switch", { name: "Sin peso · Press banca" }),
    ).toBeChecked();
    await edit
      .getByLabel("Reps · Press banca serie 1", { exact: true })
      .fill("15");
    await finishSession(edit);
    await expect(page.getByText("Registrado")).toBeVisible();
    await expect(page.getByText("15 reps")).toBeVisible();
    await page.reload();
    await expect(page.getByText("15 reps")).toBeVisible();
  });

  test("añadir y quitar series en el registro sincroniza el plan", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    // La sesión acaba `logged`: cada reintento estrena su propia semana.
    const offset = 147 + testInfo.retry * 14;
    const week = weekOf(offset);
    const date = mondayOf(week);
    await resetPlanned(page.request, date);
    const session = await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      "Empuje series",
    );

    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    // La base es compartida: «Sin peso» sale de lo último registrado.
    await mode
      .getByRole("switch", { name: "Sin peso · Press banca" })
      .uncheck();

    // El modo pinta la serie en curso: se llega a la última con la flecha.
    const nextSeries = mode.getByRole("button", { name: "Serie siguiente" });
    await nextSeries.click();
    await nextSeries.click();
    const reps3 = mode.getByLabel("Reps · Press banca serie 3", {
      exact: true,
    });
    // Una marca en la última serie para ver de verdad qué copia el ➕ (sin
    // marcarla: solo se escribe una de las dos marcas que pide la serie).
    await reps3.fill("12");
    const lastMarks = await reps3.inputValue();

    // ➕/➖ viven en el menú flotante del ejercicio, que abre el botón de series.
    const openMenu = mode.getByRole("button", {
      name: "Series de Press banca",
    });
    const addButton = mode.getByRole("menuitem", {
      name: "Añadir serie a Press banca",
    });
    const removeButton = mode.getByRole("menuitem", {
      name: "Quitar serie a Press banca",
    });

    // Móvil: los dos items del menú caben (objetivo táctil de 48 px, sin
    // desborde) y la página no se sale de ancho.
    await page.setViewportSize({ width: 390, height: 844 });
    await openMenu.click();
    await expect(removeButton).toBeVisible();
    // La entrada del menú es una animación: hasta que no acaba, su caja aún
    // está escalada y mide menos de lo que mide en reposo.
    await settle(page);
    const box = await addButton.boundingBox();
    if (!box) throw new Error("el ➕ no tiene caja");
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    // El ➕ nace con las marcas de la última serie (y cierra el menú).
    await addButton.click();
    await nextSeries.click();
    await expect(
      mode.getByLabel("Reps · Press banca serie 4", { exact: true }),
    ).toHaveValue(lastMarks);
    await page.setViewportSize({ width: 1280, height: 720 });

    await finishSession(mode);
    await expect(page.getByText("Registrado")).toBeVisible();

    // El plan del día sigue al borrador: 4 series en los dos sitios.
    type Planned = { exercises: { exerciseId: number; targetSets: number }[] };
    const planned = await apiRequest<Planned>(
      page.request,
      "GET",
      `/api/plan-sessions/${session.id}`,
    );
    expect(planned.exercises[0].targetSets).toBe(4);
    const logged = await apiRequest<{ sets: unknown[] }>(
      page.request,
      "GET",
      `/api/workout-logs/${date}`,
    );
    expect(logged.sets).toHaveLength(4);

    // Corregir: quitar la última serie también reescribe el plan.
    await page.getByRole("button", { name: "Editar" }).click();
    const edit = page.getByRole("dialog", { name: "Modo sesión" });
    await edit.getByRole("button", { name: "Series de Press banca" }).click();
    await edit
      .getByRole("menuitem", { name: "Quitar serie a Press banca" })
      .click();
    await finishSession(edit);
    await expect(page.getByText("Registrado")).toBeVisible();

    const after = await apiRequest<Planned>(
      page.request,
      "GET",
      `/api/plan-sessions/${session.id}`,
    );
    expect(after.exercises[0].targetSets).toBe(3);
  });

  test("copiar por serie las marcas de la sesión igual", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const name = "Empuje copia e2e";
    // Las dos sesiones acaban `logged` (la API no borra registros): cada
    // reintento estrena su propio par de semanas.
    const offset = 210 + testInfo.retry * 14;
    const before = mondayOf(weekOf(offset));
    const date = mondayOf(weekOf(offset + 7));
    const prev = await apiRequest<{ exercises: { id: number }[] }>(
      page.request,
      "POST",
      "/api/plan-sessions",
      { date: before, name, items: [{ exerciseId: press.id, targetSets: 2 }] },
    );
    const seId = prev.exercises[0].id;
    const set = (setIndex: number, weightKg: number, reps: number) => ({
      planSessionExerciseId: seId,
      setIndex,
      weightKg,
      reps,
      done: true,
    });
    await apiRequest(page.request, "POST", `/api/workout-logs/${before}`, {
      effort: 3,
      sets: [set(0, 60, 10), set(1, 55, 6)],
    });
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      name,
    );

    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    const box1 = mode.getByRole("checkbox", { name: "Press banca serie 1" });
    const reps1 = mode.getByLabel("Reps · Press banca serie 1", {
      exact: true,
    });
    const weight1 = mode.getByLabel("Peso (kg) · Press banca serie 1", {
      exact: true,
    });

    // El valor es el de la serie homóloga, y solo donde la había: la 3 no. El
    // modo pinta la serie en curso, así que se recorre con las flechas.
    const nextSeries = mode.getByRole("button", { name: "Serie siguiente" });
    const prevSeries = mode.getByRole("button", { name: "Serie anterior" });
    const chip1 = mode.getByRole("button", {
      name: "Copiar 60×10 de la sesión anterior a Press banca serie 1",
    });
    await expect(chip1).toBeVisible();
    await nextSeries.click();
    await expect(
      mode.getByRole("button", {
        name: "Copiar 55×6 de la sesión anterior a Press banca serie 2",
      }),
    ).toBeVisible();
    await nextSeries.click();
    await expect(
      mode.getByRole("button", { name: /a Press banca serie 3$/ }),
    ).toHaveCount(0);
    // Vuelta a la primera serie para copiar la suya.
    await prevSeries.click();
    await prevSeries.click();
    await expect(chip1).toBeVisible();

    await chip1.click();
    await expect(reps1).toHaveValue("10");
    await expect(weight1).toHaveValue("60");
    await expect(box1).not.toBeChecked(); // copiar no marca la serie
    // Solo esa serie: la 2 sigue con lo precargado por /last (55×6).
    await nextSeries.click();
    await expect(
      mode.getByLabel("Reps · Press banca serie 2", { exact: true }),
    ).toHaveValue("6");
    await prevSeries.click();

    // En móvil el botón cabe en la fila, mide lo que un objetivo táctil y ni la
    // tarjeta ni la página se salen de ancho.
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(chip1).toBeVisible();
    const chipBox = await chip1.boundingBox();
    if (!chipBox) throw new Error("la copia no tiene caja");
    expect(chipBox.height).toBeGreaterThanOrEqual(48);
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(390);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await page.setViewportSize({ width: 1280, height: 720 });

    await finishSession(mode);
    await expect(page.getByText("Registrado")).toBeVisible();

    type Logged = {
      sets: {
        setIndex: number;
        weightKg: number;
        reps: number;
        done: boolean;
      }[];
    };
    const logged = await apiRequest<Logged>(
      page.request,
      "GET",
      `/api/workout-logs/${date}`,
    );
    expect(logged.sets[0]).toMatchObject({
      setIndex: 0,
      weightKg: 60,
      reps: 10,
      done: false,
    });
  });

  test("con veinte series el modo cabe entero y pinta solo la serie en curso (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    // La sesión se queda `planned` (no se registra): `resetPlanned` limpia.
    const date = mondayOf(weekOf(182 + testInfo.retry * 7));
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 20 }],
      "Empuje 20 series",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    // El resumen no lleva casillas: el modo pinta solo la serie en curso.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(
      mode.getByRole("checkbox", { name: "Press banca serie 1", exact: true }),
    ).toBeVisible();
    // La base es compartida: «Sin peso» sale de lo último registrado, así que
    // se apaga para poder escribir los kilos de la última serie.
    await mode
      .getByRole("switch", { name: "Sin peso · Press banca" })
      .uncheck();

    // Una sola casilla —la de la serie en curso— y nada que desplace en
    // horizontal: la tira de veinte casillas del encabezado ya no existe.
    await expect(
      mode.getByRole("checkbox", { name: / serie \d+$/ }),
    ).toHaveCount(1);
    const strips = await mode.evaluate(
      (section) =>
        [...section.querySelectorAll<HTMLElement>("*")].filter((el) => {
          const { overflowX } = getComputedStyle(el);
          return (
            (overflowX === "auto" || overflowX === "scroll") &&
            el.scrollWidth > el.clientWidth + 1
          );
        }).length,
    );
    expect(strips).toBe(0);

    // Veinte series caben enteras: ni el modo, ni su cuerpo, ni la página
    // tienen scroll vertical (antes la tira desplazaba y el pie se caía).
    const fits = await modeScroll(page);
    expect(fits.sectionScroll).toBeLessThanOrEqual(fits.sectionClient);
    expect(fits.bodyScroll).toBeLessThanOrEqual(fits.bodyClient);
    expect(fits.documentScroll).toBeLessThanOrEqual(fits.viewport);
    expect(fits.pageWidth).toBeLessThanOrEqual(390);

    // Se recorren las veinte con la flecha: el contador del nombre y el de la
    // fila van juntos y la última serie apaga la flecha de la derecha.
    const next = mode.getByRole("button", { name: "Serie siguiente" });
    for (let n = 1; n < 20; n += 1) await next.click();
    await expect(
      mode.getByRole("heading", { name: "Serie 20/20", exact: true }),
    ).toBeVisible();
    await expect(mode.getByText("20/20", { exact: true })).toBeVisible();
    await expect(next).toBeDisabled();

    // La vigésima se puede registrar (marcas completas) y cierra la sesión: es
    // el único ejercicio y su última serie.
    await mode
      .getByLabel("Peso (kg) · Press banca serie 20", { exact: true })
      .fill("50");
    await mode
      .getByLabel("Reps · Press banca serie 20", { exact: true })
      .fill("5");
    await expect(
      mode.getByRole("checkbox", { name: "Press banca serie 20", exact: true }),
    ).toBeChecked();
    // El ejercicio solo cuenta en el aro con TODAS sus series hechas (solo hay
    // una marcada), y sin descanso programado no arranca ninguna pausa.
    await expect(
      mode.getByRole("progressbar", { name: "0 de 1 ejercicios hechos" }),
    ).toBeVisible();
    await expect(mode.getByRole("progressbar", { name: /^Pausa/ })).toHaveCount(
      0,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(844);
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
