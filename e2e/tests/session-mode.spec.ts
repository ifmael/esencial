// MODO SESIÓN — el modo interactivo de registro: descansos programados en el
// plan, «Empezar» a pantalla completa, pausas con barra y cuenta atrás, y el
// paso al siguiente ejercicio al agotarse la pausa del ejercicio. Se prueba en
// móvil (390 px), que es el caso del gimnasio.
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { apiRequest, apiUrl, seededExercise } from "./helpers";

type ItemPayload = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDistanceKm?: number | null;
  targetDurationMin?: number | null;
  /** Descansos programados (segundos). */
  restSecs?: number | null;
  restAfterSecs?: number | null;
};

/** Sesión del día: nombre + items expandidos. */
function createSession(
  request: APIRequestContext,
  date: string,
  items: ItemPayload[],
  name: string,
) {
  return apiRequest<{ id: number }>(request, "POST", "/api/plan-sessions", {
    date,
    name,
    items,
  });
}

/** El test se queda una fecha en exclusiva: limpia los reintentos previos. */
async function resetPlanned(request: APIRequestContext, date: string) {
  const sessions = await apiRequest<
    { id: number; date: string; status: string }[]
  >(request, "GET", "/api/plan-sessions");
  for (const s of sessions.filter(
    (s) => s.date === date && s.status === "planned",
  )) {
    await request.delete(apiUrl(`/api/plan-sessions/${s.id}`));
  }
}

/** Deja un registro previo con marcas para que el borrador los precargue: en
 *  el modo no hay campos donde escribir marcas, solo las casillas. */
async function logPast(
  request: APIRequestContext,
  date: string,
  items: ItemPayload[],
  marks: { exerciseId: number; sets: { weightKg: number; reps: number }[] }[],
) {
  const session = await createSession(request, date, items, "Previa");
  const detail = await apiRequest<{
    exercises: { id: number; exerciseId: number }[];
  }>(request, "GET", `/api/plan-sessions/${session.id}`);
  await apiRequest(request, "POST", `/api/workout-logs/${date}`, {
    effort: 2,
    note: null,
    sets: marks.flatMap((m) => {
      const se = detail.exercises.find((e) => e.exerciseId === m.exerciseId);
      if (!se) throw new Error(`La sesión previa no tiene ${m.exerciseId}`);
      return m.sets.map((s, setIndex) => ({
        planSessionExerciseId: se.id,
        setIndex,
        weightKg: s.weightKg,
        reps: s.reps,
        done: true,
      }));
    }),
    cardio: [],
  });
}

/** Geometría del cuerpo del modo: si el contenido desborda su caja con scroll,
 *  dónde arranca el scroll y si el nombre del ejercicio queda dentro del borde
 *  visible. Se mide a mano porque Playwright da por «visible» un elemento
 *  recortado por arriba (que es justo el fallo). */
async function measureModeBody(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    const heading = section.querySelector<HTMLElement>("h2");
    if (!heading) throw new Error("El modo no pinta el nombre del ejercicio");
    let scroller = heading.parentElement as HTMLElement;
    while (scroller !== section) {
      const { overflowY } = getComputedStyle(scroller);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scroller = scroller.parentElement as HTMLElement;
    }
    const style = getComputedStyle(scroller);
    const box = scroller.getBoundingClientRect();
    // Caja de contenido (sin relleno): ahí se miden los dos huecos del centrado.
    const top = box.top + parseFloat(style.paddingTop);
    const bottom = box.bottom - parseFloat(style.paddingBottom);
    const first = scroller.firstElementChild?.getBoundingClientRect();
    const last = scroller.lastElementChild?.getBoundingClientRect();
    const name = heading.getBoundingClientRect();
    return {
      overflows: scroller.scrollHeight > scroller.clientHeight + 1,
      scrollTop: scroller.scrollTop,
      topGap: first ? first.top - top : 0,
      bottomGap: last ? bottom - last.bottom : 0,
      nameTop: name.top - top,
      nameBottom: name.bottom - top,
      height: bottom - top,
    };
  });
}

/** Geometría de la fila de pausa: la barra y la cuenta atrás. Se miden las
 *  cajas (no las clases) porque lo que se prueba es dónde cae cada una; el
 *  tiempo se busca dentro del contenedor de la barra, así que la medición vale
 *  tanto si va al lado (una fila) como si va debajo (dos). */
async function measurePauseRow(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    const bar = section.querySelector<HTMLElement>(
      '[role="progressbar"][aria-label^="Pausa"]',
    );
    if (!bar) throw new Error("La pausa no pinta su barra");
    const time = bar.parentElement?.querySelector<HTMLElement>(".tabular");
    if (!time) throw new Error("La pausa no pinta la cuenta atrás");
    const b = bar.getBoundingClientRect();
    const t = time.getBoundingClientRect();
    return {
      sameRow: Math.abs((b.top + b.bottom) / 2 - (t.top + t.bottom) / 2) <= 8,
      timeAfterBar: t.left >= b.right - 1,
      barWidth: b.width,
      timeWidth: t.width,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
}

/** ISO week ("YYYY-Www") de una fecha (misma convención que la app). */
function isoWeekOf(date: string): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // jueves
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const week =
    1 + Math.round((t.getTime() - jan4.getTime()) / (7 * 86_400_000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

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

test.describe("MODO SESIÓN — modo interactivo de registro", () => {
  // Fechas lejos de las que usan otros tests (máx. offset 210 + reintentos) y
  // con su propio registro previo: el GET /last del borrador siempre los ve.
  const dayFrom = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const mondayFrom = (offsetDays: number) =>
    mondayOf(isoWeekOf(dayFrom(offsetDays)));

  test("«Empezar», pausa entre series y salto al siguiente ejercicio (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const past = mondayFrom(245 + testInfo.retry * 14);
    const date = mondayFrom(252 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await logPast(
      page.request,
      past,
      [
        { exerciseId: press.id, targetSets: 2, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
      ],
      [
        {
          exerciseId: press.id,
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 60, reps: 8 },
          ],
        },
        { exerciseId: remo.id, sets: [{ weightKg: 40, reps: 10 }] },
      ],
    );
    await createSession(
      page.request,
      date,
      [
        {
          exerciseId: press.id,
          targetSets: 2,
          targetRepsMin: 8,
          restSecs: 2,
          restAfterSecs: 3,
        },
        {
          exerciseId: remo.id,
          targetSets: 1,
          targetRepsMin: 10,
          restSecs: 2,
          restAfterSecs: 3,
        },
      ],
      "Modo",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(mode).toBeVisible();
    await expect(
      mode.getByRole("heading", { name: "Press banca" }),
    ).toBeVisible();
    await expect(mode.getByText("0 / 2")).toBeVisible();
    // El aro del encabezado cuenta ejercicios hechos: empieza en 0.
    await expect(
      mode.getByRole("progressbar", { name: "0 de 2 ejercicios hechos" }),
    ).toBeVisible();

    // Serie intermedia: pausa entre series con barra y cuenta atrás, que se
    // agota sola y deja el mismo ejercicio activo.
    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect(mode.getByText(/^\d:\d\d$/)).toBeVisible();
    await expect(
      mode.getByRole("progressbar", { name: /pausa entre series/i }),
    ).toBeHidden({ timeout: 5000 });
    await expect(mode.getByText("0 / 2")).toBeVisible();

    // Última serie: pausa al terminar y, al agotarse, el siguiente ejercicio
    // queda activo.
    await mode.getByRole("checkbox", { name: "Press banca serie 2" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa al terminar Press banca",
      }),
    ).toBeVisible();
    await expect(mode.getByText("1 / 2")).toBeVisible({ timeout: 6000 });
    await expect(
      mode.getByRole("heading", { name: "Remo con barra" }),
    ).toBeVisible();

    // Nada se sale de la pantalla en móvil.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    // «Salir» pregunta antes; al confirmar vuelve al borrador sin tocar nada.
    await mode.getByRole("button", { name: "Salir del modo sesión" }).click();
    await page
      .getByRole("dialog", { name: "¿Salir del modo sesión?" })
      .getByRole("button", { name: "Salir", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Modo sesión" }),
    ).toBeHidden();
    await expect(page.getByText("Esfuerzo percibido")).toBeVisible();
  });

  test("sin descanso programado no hay pausa: la casilla se marca directa", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const past = mondayFrom(266 + testInfo.retry * 14);
    const date = mondayFrom(273 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await logPast(
      page.request,
      past,
      [{ exerciseId: press.id, targetSets: 1, targetRepsMin: 8 }],
      [{ exerciseId: press.id, sets: [{ weightKg: 60, reps: 8 }] }],
    );
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 1, targetRepsMin: 8 }],
      "Sin descansos",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(mode.getByText("Sin descansos programados")).toBeVisible();
    await expect(
      mode.getByRole("button", { name: "Descanso", exact: true }),
    ).toBeDisabled();

    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(mode.getByRole("progressbar", { name: /pausa/i })).toHaveCount(
      0,
    );
    await expect(mode.getByText("1 / 1")).toBeVisible();
  });

  test("los descansos se programan en el editor del día y el modo los usa", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const past = mondayFrom(280 + testInfo.retry * 14);
    const date = mondayFrom(287 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await logPast(
      page.request,
      past,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8 }],
      [
        {
          exerciseId: press.id,
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 60, reps: 8 },
          ],
        },
      ],
    );
    const session = await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8 }],
      "Editor",
    );

    // El flujo del usuario: abrir el día en el planificador, escribir los
    // descansos y guardar.
    await page.goto(`/plan-fuerza?week=${isoWeekOf(date)}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    await page.getByLabel(/^press banca descanso entre series$/i).fill("2");
    await page.getByLabel(/^press banca descanso al terminar$/i).fill("3");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    // El editor se cierra cuando el PUT termina: espera a que cierre para leer
    // el detalle (leerlo antes es leer un guardado a medias).
    await expect(page.getByRole("dialog")).toBeHidden();

    // Persistidos en la API…
    const detail = await apiRequest<{
      exercises: { restSecs: number | null; restAfterSecs: number | null }[];
    }>(page.request, "GET", `/api/plan-sessions/${session.id}`);
    expect(detail.exercises[0]).toMatchObject({
      restSecs: 2,
      restAfterSecs: 3,
    });

    // …y el modo los usa.
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
  });

  test("lo registrado sobrevive a un recargado (autoguardado)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const date = mondayFrom(294 + testInfo.retry * 14);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8 }],
      "Autoguardado",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Series de Press banca" }).click();
    await page.getByLabel(/^peso \(kg\) · press banca serie 1$/i).fill("55");
    await page.getByLabel(/^reps · press banca serie 1$/i).fill("9");
    // Completar las marcas marca la serie.
    await expect(
      page.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();

    // Un refresco accidental: al volver, el borrador está tal cual (la tarjeta
    // arranca plegada, así que la casilla que se ve es la de la tira).
    await page.reload();
    await expect(
      page.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();
    await page.getByRole("button", { name: "Series de Press banca" }).click();
    await expect(
      page.getByLabel(/^peso \(kg\) · press banca serie 1$/i),
    ).toHaveValue("55");
    await expect(page.getByLabel(/^reps · press banca serie 1$/i)).toHaveValue(
      "9",
    );
  });

  test("el cuerpo centra el contenido y, si no cabe, el nombre no queda tapado (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    // Una serie (cabe) y ocho (no cabe), en fechas propias del test.
    const shortDate = mondayFrom(301 + testInfo.retry * 14);
    const tallDate = mondayFrom(308 + testInfo.retry * 14);
    await resetPlanned(page.request, shortDate);
    await resetPlanned(page.request, tallDate);
    await createSession(
      page.request,
      shortDate,
      [{ exerciseId: press.id, targetSets: 1, targetRepsMin: 8 }],
      "Cabe",
    );
    await createSession(
      page.request,
      tallDate,
      [{ exerciseId: press.id, targetSets: 8, targetRepsMin: 8 }],
      "No cabe",
    );

    await page.setViewportSize({ width: 390, height: 844 });

    // Con una serie el contenido cabe en el alto: sigue centrado (los dos
    // huecos, arriba y abajo, iguales).
    await page.goto(`/sesion/${shortDate}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Modo sesión" }),
    ).toBeVisible();
    const fits = await measureModeBody(page);
    expect(fits.overflows).toBe(false);
    expect(fits.topGap).toBeGreaterThan(80);
    expect(Math.abs(fits.topGap - fits.bottomGap)).toBeLessThanOrEqual(8);

    // Con ocho series el contenido desborda: el scroll arranca en el principio y
    // el nombre se ve entero. Centraba con `justify-center`, así que la mitad de
    // arriba quedaba inaccesible y el nombre aparecía cortado bajo la cabecera.
    await page.goto(`/sesion/${tallDate}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "Modo sesión" }),
    ).toBeVisible();
    const tall = await measureModeBody(page);
    expect(tall.overflows).toBe(true);
    expect(tall.scrollTop).toBe(0);
    expect(tall.nameTop).toBeGreaterThanOrEqual(0);
    expect(tall.nameBottom).toBeLessThanOrEqual(tall.height);
  });

  test("la cuenta atrás va al final de la barra, en la misma fila (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const past = mondayFrom(315 + testInfo.retry * 14);
    const date = mondayFrom(322 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await logPast(
      page.request,
      past,
      [
        { exerciseId: press.id, targetSets: 2, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
      ],
      [
        {
          exerciseId: press.id,
          sets: [
            { weightKg: 60, reps: 8 },
            { weightKg: 60, reps: 8 },
          ],
        },
        { exerciseId: remo.id, sets: [{ weightKg: 40, reps: 10 }] },
      ],
    );
    await createSession(
      page.request,
      date,
      [
        {
          exerciseId: press.id,
          targetSets: 2,
          targetRepsMin: 8,
          restSecs: 60,
          restAfterSecs: 60,
        },
        {
          exerciseId: remo.id,
          targetSets: 1,
          targetRepsMin: 10,
          restSecs: 60,
          restAfterSecs: 60,
        },
      ],
      "Fila",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(
      mode.getByRole("heading", { name: "Press banca" }),
    ).toBeVisible();

    // Pausa entre series: el `mm:ss` va al final de la barra, en su misma fila
    // (antes caía debajo, en una línea propia).
    const row = async () => {
      const m = await measurePauseRow(page);
      return { sameRow: m.sameRow, timeAfterBar: m.timeAfterBar };
    };
    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect.poll(row).toEqual({ sameRow: true, timeAfterBar: true });

    // Y lo mismo en la pausa de fin de ejercicio.
    await mode.getByRole("checkbox", { name: "Press banca serie 2" }).check();
    await expect(
      mode.getByRole("progressbar", { name: "Pausa al terminar Press banca" }),
    ).toBeVisible();
    await expect.poll(row).toEqual({ sameRow: true, timeAfterBar: true });

    // La fila no desborda a 390 px.
    expect((await measurePauseRow(page)).pageWidth).toBeLessThanOrEqual(390);
  });
});
