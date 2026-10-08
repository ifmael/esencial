// MODO SESIÓN — el modo interactivo de registro: descansos programados en el
// plan, «Empezar» a pantalla completa, una serie a la vez con sus flechas, el
// menú flotante para añadir/quitar series, pausas con barra y cuenta atrás (y
// play/pausa), el cierre con esfuerzo y nota, y el paso al siguiente ejercicio
// al agotarse la pausa. El rediseño cabe entero en la ventana, sin scroll
// vertical, así que se prueba en móvil (390×844) y en escritorio (1280×800).
import {
  type APIRequestContext,
  expect,
  type Locator,
  type Page,
  test,
} from "@playwright/test";
import { apiRequest, apiUrl, seededExercise, uniqueName } from "./helpers";

/** Un tono de los que suenan en la pestaña, con el momento en que se arrancó. */
type RecordedTone = { hz: number; at: number };

declare global {
  interface Window {
    /** Lo deja el `addInitScript` de la prueba del aviso previo. */
    __tones?: RecordedTone[];
  }
}

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

/** Caja real de una pieza del modo; falla si no está pintada. Se miden cajas
 *  (no clases) porque lo que se prueba es dónde cae cada pieza. */
type Box = { x: number; y: number; width: number; height: number };

async function boxOf(locator: Locator, what: string): Promise<Box> {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${what} no está visible`);
  return box;
}

/** Las cajas van en una sola fila: cada par consecutivo se solapa en vertical
 *  (no cabe un salto de línea entre ellas) y el orden es de izquierda a derecha. */
function expectRow(boxes: Box[]) {
  for (let i = 1; i < boxes.length; i++) {
    const overlap =
      Math.min(
        boxes[i - 1].y + boxes[i - 1].height,
        boxes[i].y + boxes[i].height,
      ) - Math.max(boxes[i - 1].y, boxes[i].y);
    expect(overlap).toBeGreaterThan(4);
    expect(boxes[i - 1].x + boxes[i - 1].width).toBeLessThanOrEqual(
      boxes[i].x + 1,
    );
  }
}

/** El contrato de «cabe entero»: el `section` del modo no desborda su caja, el
 *  cuerpo que puede desplazar no tiene scroll y la página no pasa del alto de la
 *  ventana. Se leen `scrollHeight`/`clientHeight` reales. */
async function modeScroll(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    // El cuerpo que desplaza: el hijo directo del `section` con `overflow-y`
    // propio (se lee del estilo calculado, no de las clases).
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

/** Cuántos trazos pinta el aro del borrador. A 0 series no debe pintar ninguno
 *  (no hay círculo de fondo) y el arco tiene que aparecer al marcar; se cuentan
 *  los elementos con trazo y opacidad, no las clases. */
async function paintedRingStrokes(page: Page) {
  return page.evaluate(() => {
    const ring = document.querySelector('header [role="progressbar"]');
    if (!ring) throw new Error("El borrador no pinta el aro");
    return [...ring.querySelectorAll("circle, path")].filter((el) => {
      const style = getComputedStyle(el);
      return style.stroke !== "none" && Number(style.opacity) > 0;
    }).length;
  });
}

/** Geometría del encabezado del borrador —flecha, nombre y aro en una fila, y
 *  el día debajo— más lo que ocupa de la primera pantalla. Se miden las cajas
 *  (no las clases) porque lo que se prueba es dónde cae cada pieza; el texto del
 *  día se mide con un rango porque su `p` lleva el relleno que lo alinea. */
async function measureDraftHeader(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector<HTMLElement>("header");
    if (!header) throw new Error("El borrador no pinta su encabezado");
    const back = header.querySelector<HTMLElement>("a");
    const name = header.querySelector<HTMLElement>("h1");
    const ring = header.querySelector<HTMLElement>('[role="progressbar"]');
    const day = header.querySelector<HTMLElement>("p");
    const empezar = [...document.querySelectorAll<HTMLElement>("button")].find(
      (b) => b.textContent?.trim() === "Empezar",
    );
    if (!back || !name || !ring || !day || !empezar) {
      throw new Error("Al borrador le falta flecha, nombre, aro o «Empezar»");
    }
    const text = document.createRange();
    text.selectNodeContents(day);
    const head = header.getBoundingClientRect();
    const backBox = back.getBoundingClientRect();
    const circle = ring.getBoundingClientRect();
    const dayBox = text.getBoundingClientRect();
    const empezarBox = empezar.getBoundingClientRect();
    const title = name.getBoundingClientRect();
    return {
      headerHeight: head.height,
      titleText: name.textContent?.trim() ?? "",
      dayText: day.textContent?.trim() ?? "",
      arrowThenName: backBox.right <= title.left,
      ringRightOfName: circle.left >= title.right - 1,
      ringOnNameRow:
        Math.abs(
          (circle.top + circle.bottom) / 2 - (title.top + title.bottom) / 2,
        ) <= 4,
      dayBelowName: dayBox.top >= title.bottom - 1,
      dayAlignedWithName: Math.abs(dayBox.left - title.left) <= 2,
      empezarBottom: empezarBox.bottom,
      viewportHeight: window.innerHeight,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Las casillas de serie que pinta el modo y si algo dentro de él desplaza en
 *  horizontal. Con una serie por pantalla sobra una casilla —la de la serie en
 *  curso— y la tira que desplazaba ya no existe. Se cuentan nodos y desbordes
 *  reales, no clases. */
async function setBoxes(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    // Las casillas de las series: su nombre acaba en «serie N».
    const boxes = [
      ...section.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].filter((b) => / serie \d+$/.test(b.getAttribute("aria-label") ?? ""));
    const strips = [...section.querySelectorAll<HTMLElement>("*")].filter(
      (el) => {
        const { overflowX } = getComputedStyle(el);
        return (
          (overflowX === "auto" || overflowX === "scroll") &&
          el.scrollWidth > el.clientWidth + 1
        );
      },
    ).length;
    return {
      count: boxes.length,
      label: boxes[0]?.getAttribute("aria-label") ?? null,
      strips,
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
    // agota sola y deja el mismo ejercicio activo, con el cursor ya en la serie
    // que toca hacer (la siguiente a la marcada).
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
    await expect(
      mode.getByRole("heading", { name: "Serie 2/2", exact: true }),
    ).toBeVisible();

    // Última serie: la pausa dejó el cursor en ella, así que se marca sin tocar
    // las flechas; arranca la pausa al terminar y, al agotarse, el siguiente
    // ejercicio queda activo.
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

    // «Salir» pregunta antes; al confirmar vuelve al resumen sin tocar nada.
    await mode.getByRole("button", { name: "Salir del modo sesión" }).click();
    await page
      .getByRole("dialog", { name: "¿Salir del modo sesión?" })
      .getByRole("button", { name: "Salir", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Modo sesión" }),
    ).toBeHidden();
    // Lo marcado queda en el borrador: el resumen lo enseña y «Empezar» sigue.
    await expect(page.getByText("2/2")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Empezar", exact: true }),
    ).toBeVisible();
  });

  test("el aviso previo suena a los 3 s y a los 2 s del pitido de fin (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const past = mondayFrom(455 + testInfo.retry * 14);
    const date = mondayFrom(462 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await logPast(
      page.request,
      past,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8 }],
      [{ exerciseId: press.id, sets: [{ weightKg: 60, reps: 8 }] }],
    );
    // Un descanso entre series de 6 s: cabe entero en el test y pasa del aviso.
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8, restSecs: 6 }],
      "Aviso",
    );

    // Los tonos los graba el Web Audio de la propia página: se prueba el sonido
    // de verdad, con el reloj de verdad (los unitarios simulan los dos).
    await page.addInitScript(() => {
      const tones: { hz: number; at: number }[] = [];
      Object.assign(window, { __tones: tones });
      const proto = AudioContext.prototype;
      const create = proto.createOscillator;
      proto.createOscillator = function (this: AudioContext) {
        const osc = create.call(this);
        const start = osc.start.bind(osc);
        osc.start = (when?: number) => {
          tones.push({ hz: osc.frequency.value, at: performance.now() });
          start(when);
        };
        return osc;
      };
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();

    // La pausa se agota sola; para entonces ha sonado todo, en este orden: el
    // keep-alive del arranque, los dos avisos y los tres tonos del fin, cada uno
    // una sola vez (ninguno se repite, ni se cuela un tono de más).
    await expect(
      mode.getByRole("progressbar", { name: /pausa entre series/i }),
    ).toBeHidden({ timeout: 10_000 });
    const recorded = await page.evaluate(() => window.__tones ?? []);
    expect(recorded.map((t) => t.hz)).toEqual([60, 660, 660, 880, 1175, 1568]);

    // El primer aviso llega ~3 s antes del pitido de fin, y el segundo un
    // segundo después (el tic es de 250 ms).
    const warnAt = recorded.filter((t) => t.hz === 660).map((t) => t.at);
    expect(warnAt).toHaveLength(2);
    const [first = 0, second = 0] = warnAt;
    const end = recorded.find((t) => t.hz === 880)?.at ?? 0;
    expect(end - first).toBeGreaterThan(2600);
    expect(end - first).toBeLessThan(3400);
    expect(second - first).toBeGreaterThan(600);
    expect(second - first).toBeLessThan(1400);
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
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await mode.getByLabel(/^peso \(kg\) · press banca serie 1$/i).fill("55");
    await mode.getByLabel(/^reps · press banca serie 1$/i).fill("9");
    // Completar las marcas marca la serie.
    await expect(
      mode.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();

    // Un refresco accidental: al volver, el resumen ya enseña la serie hecha y
    // el borrador sigue tal cual dentro del modo.
    await page.reload();
    await expect(page.getByText("1/2")).toBeVisible();
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await expect(
      page.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();
    await expect(
      page.getByLabel(/^peso \(kg\) · press banca serie 1$/i),
    ).toHaveValue("55");
    await expect(page.getByLabel(/^reps · press banca serie 1$/i)).toHaveValue(
      "9",
    );
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

    // Y lo mismo en la pausa de fin de ejercicio (el modo pinta la serie en
    // curso: se llega a la última con la flecha).
    await mode.getByRole("button", { name: "Serie siguiente" }).click();
    await mode.getByRole("checkbox", { name: "Press banca serie 2" }).check();
    await expect(
      mode.getByRole("progressbar", { name: "Pausa al terminar Press banca" }),
    ).toBeVisible();
    await expect.poll(row).toEqual({ sameRow: true, timeAfterBar: true });

    // La fila no desborda a 390 px.
    expect((await measurePauseRow(page)).pageWidth).toBeLessThanOrEqual(390);
  });

  test("el descanso va en el cuerpo, bajo los campos de la serie, y no hay scroll", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const past = mondayFrom(427 + testInfo.retry * 14);
    const date = mondayFrom(434 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    // Una sesión previa que llene las ocho series: sin marcas, la casilla de
    // una serie no se puede marcar.
    await logPast(
      page.request,
      past,
      [
        { exerciseId: press.id, targetSets: 8, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
      ],
      [
        {
          exerciseId: press.id,
          sets: Array.from({ length: 8 }, () => ({ weightKg: 60, reps: 8 })),
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
          targetSets: 8,
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
      "En el cuerpo",
    );

    // Móvil y escritorio: el sitio del bloque no depende del ancho.
    for (const [i, viewport] of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ].entries()) {
      // El autoguardado del borrador vive en `localStorage`: se limpia para que
      // la segunda vuelta no arranque con la serie de la primera ya marcada.
      if (i > 0) await page.evaluate(() => localStorage.clear());
      await page.setViewportSize(viewport);
      await page.goto(`/sesion/${date}`);
      await page.getByRole("button", { name: "Empezar", exact: true }).click();
      const mode = page.getByRole("dialog", { name: "Modo sesión" });
      await expect(
        mode.getByRole("heading", { name: "Press banca" }),
      ).toBeVisible();

      await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
      const bar = mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      });
      await expect(bar).toBeVisible();

      // La pausa ya no va pegada al encabezado: vive en el cuerpo, bajo los
      // campos de la serie en curso, y el pie queda por debajo.
      const [barBox, skipBox, fieldBox, footerBox] = await Promise.all([
        boxOf(bar, "la barra de la pausa"),
        boxOf(
          mode.getByRole("button", { name: "Saltar", exact: true }),
          "el «Saltar» de la pausa",
        ),
        boxOf(
          mode.getByLabel(/^peso \(kg\) · press banca serie 1$/i),
          "el peso de la serie",
        ),
        boxOf(
          mode.getByRole("button", { name: "Terminar", exact: true }),
          "el «Terminar» del pie",
        ),
      ]);
      expect(barBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);
      expect(skipBox.y + skipBox.height).toBeLessThanOrEqual(footerBox.y);
      expect(skipBox.y + skipBox.height).toBeLessThanOrEqual(viewport.height);

      // Con ocho series y la pausa en marcha nada desborda: ni el `section`, ni
      // el cuerpo que puede desplazar, ni la página (el pie se quedaba fuera).
      const fits = await modeScroll(page);
      expect(fits.sectionScroll).toBeLessThanOrEqual(fits.sectionClient);
      expect(fits.bodyScroll).toBeLessThanOrEqual(fits.bodyClient);
      expect(fits.documentScroll).toBeLessThanOrEqual(fits.viewport);
      expect(fits.pageWidth).toBeLessThanOrEqual(viewport.width);

      // Y no hay scroll que llevarse: la rueda no mueve la pausa de su sitio.
      await mode.getByRole("heading", { name: "Press banca" }).hover();
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(150);
      const afterWheel = await boxOf(bar, "la barra de la pausa");
      expect(Math.abs(afterWheel.y - barBox.y)).toBeLessThanOrEqual(1);
    }
  });

  test("la fila del ejercicio cabe en una línea con doce series y el nombre largo (móvil)", async ({
    page,
  }, testInfo) => {
    // El caso peor del rediseño: nombre largo y doce series (con la tira de
    // casillas el bloque medía 280 px y el nombre partía en dos líneas). Se
    // miden las cajas reales: la etiqueta del tipo, el nombre, el menú y las
    // flechas.
    const pistol = await seededExercise(
      page.request,
      "Sentadilla a una pierna",
    );
    const remo = await seededExercise(page.request, "Remo con barra");
    const cinta = await apiRequest<{ id: number; name: string }>(
      page.request,
      "POST",
      "/api/exercises",
      { name: uniqueName("Cinta cabecera"), tags: ["cardio"], kind: "running" },
    );
    const date = mondayFrom(448 + testInfo.retry * 14);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [
        { exerciseId: pistol.id, targetSets: 12, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
        { exerciseId: cinta.id, targetDistanceKm: 5, targetDurationMin: 30 },
      ],
      "Cabecera",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    const heading = mode.getByRole("heading", {
      name: "Sentadilla a una pierna",
    });
    await expect(heading).toBeVisible();

    // La fila —anterior · nombre · series · siguiente— cae en una sola línea y
    // la etiqueta del tipo va encima.
    const label = mode.getByText("Fuerza", { exact: true });
    const row = [
      await boxOf(
        mode.getByRole("button", { name: "Ejercicio anterior" }),
        "la flecha anterior",
      ),
      await boxOf(heading, "el nombre del ejercicio"),
      await boxOf(
        mode.getByRole("button", {
          name: "Series de Sentadilla a una pierna",
        }),
        "el menú de series",
      ),
      await boxOf(
        mode.getByRole("button", { name: "Ejercicio siguiente" }),
        "la flecha siguiente",
      ),
    ];
    expectRow(row);
    const labelBox = await boxOf(label, "la etiqueta del tipo");
    expect(labelBox.y + labelBox.height).toBeLessThanOrEqual(row[1].y + 1);
    // El contador de series va dentro del nombre (y no mide más alto que él).
    await expect(mode.getByText("1/12", { exact: true })).toBeVisible();
    expect(row[1].height).toBeLessThanOrEqual(row[0].height);
    // El bloque entero (de la etiqueta a la fila) es una franja, no media
    // pantalla: con la tira medía 280 px.
    expect(row[3].y + row[3].height - labelBox.y).toBeLessThanOrEqual(120);
    expect(row[3].x + row[3].width).toBeLessThanOrEqual(390);

    // Con doce series solo se pinta la serie en curso: una casilla y ninguna
    // tira que desplace en horizontal.
    expect(await setBoxes(page)).toMatchObject({
      count: 1,
      label: "Sentadilla a una pierna serie 1",
      strips: 0,
    });

    // El pie ya no repite «Siguiente»: se cambia de ejercicio con la flecha.
    expect(
      await mode
        .getByRole("button", { name: "Siguiente", exact: true })
        .count(),
    ).toBe(0);
    await mode.getByRole("button", { name: "Ejercicio siguiente" }).click();
    await expect(
      mode.getByRole("heading", { name: "Remo con barra" }),
    ).toBeVisible();
    await mode.getByRole("button", { name: "Ejercicio siguiente" }).click();
    await expect(mode.getByRole("heading", { name: cinta.name })).toBeVisible();

    // Y el cardio, que no tiene series: el objetivo del día y su «Hecho» van en
    // esa misma fila (antes eran dos).
    await expect(mode.getByRole("checkbox", { name: / hecho$/ })).toBeVisible();
    await expect(
      mode.getByRole("checkbox", { name: / serie \d+$/ }),
    ).toHaveCount(0);
    expectRow([
      await boxOf(
        mode.getByText("5 km · 30 min", { exact: true }),
        "el objetivo del cardio",
      ),
      await boxOf(mode.getByText("Hecho", { exact: true }), "el «Hecho»"),
    ]);
  });

  test("«A continuación» bajo los campos cuando solo queda la última serie (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const run = await apiRequest<{ id: number; name: string }>(
      page.request,
      "POST",
      "/api/exercises",
      { name: uniqueName("Cinta"), tags: ["cardio"], kind: "running" },
    );
    const past = mondayFrom(378 + testInfo.retry * 14);
    const date = mondayFrom(385 + testInfo.retry * 14);
    const cardioDate = mondayFrom(399 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await resetPlanned(page.request, cardioDate);
    // Marcas previas: en el modo no hay campos donde escribir, así que la serie
    // solo se puede marcar si llega completa desde `/last`.
    await logPast(
      page.request,
      past,
      [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
      ],
      [
        {
          exerciseId: press.id,
          sets: [
            { weightKg: 60, reps: 8 },
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
          targetSets: 3,
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
      "A continuación",
    );
    // Segunda sesión: un ejercicio de una sola serie y, detrás, cardio.
    await createSession(
      page.request,
      cardioDate,
      [
        { exerciseId: press.id, targetSets: 1, targetRepsMin: 8 },
        { exerciseId: run.id, targetDistanceKm: 5, targetDurationMin: 30 },
      ],
      "A continuación cardio",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(
      mode.getByRole("heading", { name: "Press banca" }),
    ).toBeVisible();
    const upNext = mode.getByText(/^A continuación: /);
    const lastOne = mode.getByText("Último ejercicio");
    const skip = mode.getByRole("button", { name: "Saltar", exact: true });
    const nextSeries = mode.getByRole("button", { name: "Serie siguiente" });
    const seriesBox = (n: number) =>
      mode.getByRole("checkbox", {
        name: `Press banca serie ${n}`,
        exact: true,
      });

    // Con tres series por delante todavía no hay nada que anunciar: queda más
    // de una serie.
    await expect(upNext).toHaveCount(0);
    await expect(lastOne).toHaveCount(0);

    await seriesBox(1).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect(upNext).toHaveCount(0);
    // Saltar la pausa deja el cursor en la serie siguiente a la marcada.
    await skip.click();
    await expect(
      mode.getByRole("heading", { name: "Serie 2/3", exact: true }),
    ).toBeVisible();

    // Al quedar solo la última serie aparece, con el siguiente por orden del
    // día, bajo los campos de la serie (y por encima del pie).
    await seriesBox(2).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect(upNext).toBeVisible();
    await expect(upNext).toContainText("Remo con barra");
    const [skipBox, lineBox, footerBox] = await Promise.all([
      boxOf(skip, "el «Saltar» de la pausa"),
      boxOf(upNext, "el «A continuación»"),
      boxOf(
        mode.getByRole("button", { name: "Terminar", exact: true }),
        "el «Terminar» del pie",
      ),
    ]);
    expect(lineBox.y).toBeGreaterThanOrEqual(skipBox.y + skipBox.height);
    expect(lineBox.y + lineBox.height).toBeLessThanOrEqual(footerBox.y);

    // Y sigue a la vista en la pausa de fin de ejercicio, con el cursor ya en
    // la última serie de la vuelta (ahí la flecha de la derecha se apaga).
    await skip.click();
    await expect(
      mode.getByRole("heading", { name: "Serie 3/3", exact: true }),
    ).toBeVisible();
    await expect(nextSeries).toBeDisabled();
    await seriesBox(3).check();
    await expect(
      mode.getByRole("progressbar", { name: "Pausa al terminar Press banca" }),
    ).toBeVisible();
    await expect(upNext).toBeVisible();

    // El siguiente es el último de la sesión: en vez del nombre, el aviso de
    // que no queda ninguno detrás.
    await skip.click();
    await expect(
      mode.getByRole("heading", { name: "Remo con barra" }),
    ).toBeVisible();
    await expect(upNext).toHaveCount(0);
    await expect(lastOne).toBeVisible();

    // Con una sola serie la condición ya se cumple al abrir el ejercicio, así
    // que el aviso sale desde el principio.
    await page.goto(`/sesion/${cardioDate}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    await expect(
      mode.getByRole("heading", { name: "Press banca" }),
    ).toBeVisible();
    await expect(upNext).toBeVisible();
    await expect(upNext).toContainText(run.name);

    // El cardio solo cuenta cuando está hecho; al marcarlo (es el último) el
    // aviso pasa a ser el de último ejercicio. Se cambia de ejercicio con la
    // flecha, que es la que queda en el encabezado.
    await mode.getByRole("button", { name: "Ejercicio siguiente" }).click();
    await expect(mode.getByRole("heading", { name: run.name })).toBeVisible();
    await expect(upNext).toHaveCount(0);
    await expect(lastOne).toHaveCount(0);
    await mode.getByRole("checkbox", { name: `${run.name} hecho` }).check();
    await expect(lastOne).toBeVisible();

    // Nada se sale de la pantalla en móvil.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });

  test("el encabezado lleva el ejercicio activo y su lista salta de uno a otro (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const run = await apiRequest<{ id: number; name: string }>(
      page.request,
      "POST",
      "/api/exercises",
      { name: uniqueName("Cinta"), tags: ["cardio"], kind: "running" },
    );
    const past = mondayFrom(406 + testInfo.retry * 14);
    const date = mondayFrom(413 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    // Marcas previas: las series llegan completas de `/last` (en el modo no hay
    // campos donde escribirlas, solo casillas).
    await logPast(
      page.request,
      past,
      [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
      ],
      [
        {
          exerciseId: press.id,
          sets: [
            { weightKg: 60, reps: 8 },
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
          targetSets: 3,
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
        { exerciseId: run.id, targetDistanceKm: 5, targetDurationMin: 30 },
      ],
      "Lista",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    const heading = (name: string) => mode.getByRole("heading", { name });
    // El botón del encabezado lleva el nombre del activo; la fila del listado,
    // el mismo nombre más su estado («, pendiente» / «, hecho»).
    const opener = (name: string) =>
      mode.getByRole("button", { name, exact: true });
    const sheet = () => page.getByRole("dialog", { name: "Ejercicios" });
    const row = (name: string, done: boolean) =>
      sheet().getByRole("button", {
        name: `${name}, ${done ? "hecho" : "pendiente"}`,
        exact: true,
      });
    // El color con el que se pinta cada fila (se mide, no se leen clases).
    const bg = (l: Locator) =>
      l.evaluate((el) => getComputedStyle(el).backgroundColor);

    await expect(heading("Press banca")).toBeVisible();
    // El nombre del activo va en el encabezado, encima del nombre del cuerpo.
    const openerBox = await opener("Press banca").boundingBox();
    const headingBox = await heading("Press banca").boundingBox();
    expect((openerBox?.y ?? 0) + (openerBox?.height ?? 0)).toBeLessThanOrEqual(
      headingBox?.y ?? 0,
    );

    // Al pulsarlo se abre el sheet con los tres ejercicios del día, en el orden
    // del día y cada uno con su estado: ninguno hecho todavía.
    await opener("Press banca").click();
    await expect(sheet()).toBeVisible();
    await expect(row("Press banca", false)).toBeVisible();
    await expect(row("Remo con barra", false)).toBeVisible();
    await expect(row(run.name, false)).toBeVisible();
    const y = await Promise.all(
      [
        row("Press banca", false),
        row("Remo con barra", false),
        row(run.name, false),
      ].map(async (r) => (await r.boundingBox())?.y ?? 0),
    );
    expect(y[0]).toBeLessThan(y[1]);
    expect(y[1]).toBeLessThan(y[2]);
    // Y el que está en curso va resaltado: su fondo no es el del reposo, que
    // comparten los otros dos.
    const bgs = await Promise.all([
      bg(row("Press banca", false)),
      bg(row("Remo con barra", false)),
      bg(row(run.name, false)),
    ]);
    expect(bgs[0]).not.toBe(bgs[1]);
    expect(bgs[1]).toBe(bgs[2]);

    // Pulsar una fila cierra el listado y salta a ese ejercicio.
    await row("Remo con barra", false).click();
    await expect(sheet()).toBeHidden();
    await expect(heading("Remo con barra")).toBeVisible();
    await expect(opener("Remo con barra")).toBeVisible();
    await expect(
      mode.getByRole("checkbox", { name: "Remo con barra serie 1" }),
    ).toBeVisible();

    // Con el salto, la fila en curso pasa a ser la del ejercicio elegido.
    await opener("Remo con barra").click();
    const jumpBgs = await Promise.all([
      bg(row("Press banca", false)),
      bg(row("Remo con barra", false)),
      bg(row(run.name, false)),
    ]);
    expect(jumpBgs[1]).not.toBe(jumpBgs[0]);
    expect(jumpBgs[1]).not.toBe(jumpBgs[2]);
    // Escape cierra el listado, no el modo.
    await page.keyboard.press("Escape");
    await expect(sheet()).toBeHidden();
    await expect(mode).toBeVisible();

    // Con una pausa corriendo, el salto no la toca: la misma pausa (su nombre
    // no cambia con el ejercicio activo) y la ola sigue avanzando.
    await mode
      .getByRole("checkbox", { name: "Remo con barra serie 1" })
      .check();
    const pause = mode.getByRole("progressbar", {
      name: "Pausa al terminar Remo con barra",
    });
    await expect(pause).toBeVisible();
    await opener("Remo con barra").click();
    // Remo hecho (todas sus series) frente a Press banca, todavía pendiente.
    await expect(row("Remo con barra", true)).toBeVisible();
    await expect(row("Press banca", false)).toBeVisible();
    await row(run.name, false).click();
    await expect(sheet()).toBeHidden();
    await expect(heading(run.name)).toBeVisible();
    // Con el nombre largo del cardio el encabezado sigue en una sola fila: el
    // nombre se recorta y no empuja el aspa.
    const longOpener = await opener(run.name).boundingBox();
    const closeButton = await mode
      .getByRole("button", { name: "Salir del modo sesión" })
      .boundingBox();
    expect((longOpener?.x ?? 0) + (longOpener?.width ?? 0)).toBeLessThanOrEqual(
      closeButton?.x ?? 0,
    );
    expect((await mode.locator("header").boundingBox())?.height).toBeLessThan(
      96,
    );
    const before = Number(await pause.getAttribute("aria-valuenow"));
    await expect
      .poll(async () => Number(await pause.getAttribute("aria-valuenow")))
      .toBeGreaterThan(before);

    // El cardio, hecho, también sale con su ✓.
    await mode.getByRole("checkbox", { name: `${run.name} hecho` }).check();
    await opener(run.name).click();
    await expect(row(run.name, true)).toBeVisible();
    await expect(row("Remo con barra", true)).toBeVisible();

    // Nada se sale de la pantalla en móvil.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  });

  // El contrato del rediseño, medido dentro de la ventana: todo entra sin
  // scroll vertical (ni con doce series ni con el cierre abierto), el
  // encabezado es una fila, el nombre de la sesión va debajo, las flechas
  // navegan por el ejercicio y por la serie, el menú flotante manda sobre el
  // recuento y el cierre avisa de lo que falta antes de pedir esfuerzo y nota.
  for (const [i, viewport] of [
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ].entries()) {
    test(`el modo cabe entero en ${viewport.width}×${viewport.height} y cumple el contrato`, async ({
      page,
    }, testInfo) => {
      const press = await seededExercise(page.request, "Press banca");
      const remo = await seededExercise(page.request, "Remo con barra");
      const pistol = await seededExercise(
        page.request,
        "Sentadilla a una pierna",
      );
      const cinta = await apiRequest<{ id: number; name: string }>(
        page.request,
        "POST",
        "/api/exercises",
        {
          name: uniqueName("Cinta contrato"),
          tags: ["cardio"],
          kind: "running",
        },
      );
      const past = dayFrom(571 + i * 6 + testInfo.retry * 14);
      const date = dayFrom(572 + i * 6 + testInfo.retry * 14);
      await resetPlanned(page.request, past);
      await resetPlanned(page.request, date);
      // Marcas previas: en el modo la casilla solo se puede marcar si la serie
      // llega completa desde `/last`.
      await logPast(
        page.request,
        past,
        [
          { exerciseId: press.id, targetSets: 12, targetRepsMin: 8 },
          { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
          { exerciseId: pistol.id, targetSets: 2, targetRepsMin: 8 },
        ],
        [
          {
            exerciseId: press.id,
            sets: Array.from({ length: 12 }, () => ({
              weightKg: 60,
              reps: 8,
            })),
          },
          { exerciseId: remo.id, sets: [{ weightKg: 40, reps: 10 }] },
          {
            exerciseId: pistol.id,
            sets: [
              { weightKg: 30, reps: 8 },
              { weightKg: 30, reps: 8 },
            ],
          },
        ],
      );
      await createSession(
        page.request,
        date,
        [
          {
            exerciseId: press.id,
            targetSets: 12,
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
          {
            exerciseId: pistol.id,
            targetSets: 2,
            targetRepsMin: 8,
            restSecs: 60,
            restAfterSecs: 60,
          },
          { exerciseId: cinta.id, targetDistanceKm: 5, targetDurationMin: 30 },
        ],
        "Contrato",
      );

      await page.setViewportSize(viewport);
      await page.goto(`/sesion/${date}`);
      await page.getByRole("button", { name: "Empezar", exact: true }).click();
      const mode = page.getByRole("dialog", { name: "Modo sesión" });
      const heading = mode.getByRole("heading", { name: "Press banca" });
      await expect(heading).toBeVisible();
      const openerFor = (name: string) =>
        mode.getByRole("button", { name, exact: true });

      // (a) Ni un scroll vertical con el ejercicio de doce series abierto.
      const fits = await modeScroll(page);
      expect(fits.sectionScroll).toBeLessThanOrEqual(fits.sectionClient);
      expect(fits.bodyScroll).toBeLessThanOrEqual(fits.bodyClient);
      expect(fits.documentScroll).toBeLessThanOrEqual(fits.viewport);
      expect(fits.pageWidth).toBeLessThanOrEqual(viewport.width);
      // El cursor de serie nace en la primera de la vuelta.
      await expect(
        mode.getByRole("heading", { name: "Serie 1/12", exact: true }),
      ).toBeVisible();
      await expect(
        mode.getByRole("button", { name: "Serie anterior" }),
      ).toBeDisabled();

      // (b) El encabezado, en una fila: aro «0 / 4», el ejercicio activo (que
      // abre el listado) y el aspa de salir.
      const ring = mode.getByRole("progressbar", {
        name: "0 de 4 ejercicios hechos",
      });
      await expect(ring).toBeVisible();
      await expect(mode.getByText("0 / 4", { exact: true })).toBeVisible();
      await openerFor("Press banca").click();
      const itemsDialog = page.getByRole("dialog", { name: "Ejercicios" });
      await expect(itemsDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(itemsDialog).toBeHidden();
      const headerBox = await boxOf(mode.locator("header"), "el encabezado");
      const rowBoxes = await Promise.all([
        boxOf(ring, "el aro de ejercicios"),
        boxOf(openerFor("Press banca"), "el botón del ejercicio activo"),
        boxOf(
          mode.getByRole("button", { name: "Salir del modo sesión" }),
          "el aspa de salir",
        ),
      ]);
      expectRow(rowBoxes);
      for (const box of rowBoxes) {
        expect(box.y).toBeGreaterThanOrEqual(headerBox.y - 1);
        expect(box.y + box.height).toBeLessThanOrEqual(
          headerBox.y + headerBox.height + 1,
        );
      }
      expect(headerBox.height).toBeLessThan(96);
      expect(headerBox.width).toBeLessThanOrEqual(viewport.width);

      // (c) El nombre de la sesión, bajo el encabezado y sobre el ejercicio.
      const nameBox = await boxOf(
        mode.getByText("Contrato", { exact: true }),
        "el nombre de la sesión",
      );
      expect(nameBox.y).toBeGreaterThanOrEqual(
        headerBox.y + headerBox.height - 1,
      );
      expect(nameBox.y + nameBox.height).toBeLessThanOrEqual(
        (await boxOf(heading, "el nombre del ejercicio")).y,
      );

      // (d) Las flechas cambian de ejercicio activo y el contador de series va
      // con él.
      const prevExercise = mode.getByRole("button", {
        name: "Ejercicio anterior",
      });
      const nextExercise = mode.getByRole("button", {
        name: "Ejercicio siguiente",
      });
      await expect(prevExercise).toBeDisabled();
      await expect(mode.getByText("1/12", { exact: true })).toBeVisible();
      await nextExercise.click();
      await expect(
        mode.getByRole("heading", { name: "Remo con barra" }),
      ).toBeVisible();
      await expect(openerFor("Remo con barra")).toBeVisible();
      await expect(mode.getByText("1/1", { exact: true })).toBeVisible();
      await nextExercise.click();
      await expect(
        mode.getByRole("heading", { name: "Sentadilla a una pierna" }),
      ).toBeVisible();
      await nextExercise.click();
      await expect(
        mode.getByRole("heading", { name: cinta.name }),
      ).toBeVisible();
      await expect(nextExercise).toBeDisabled();
      // El cardio va sin series: ni casilla, ni menú de series, ni flechas.
      await expect(
        mode.getByRole("button", { name: `Series de ${cinta.name}` }),
      ).toHaveCount(0);
      expect((await setBoxes(page)).count).toBe(0);
      await prevExercise.click();
      await expect(
        mode.getByRole("heading", { name: "Sentadilla a una pierna" }),
      ).toBeVisible();
      await prevExercise.click();
      await prevExercise.click();
      await expect(heading).toBeVisible();
      await expect(mode.getByText("0 / 4", { exact: true })).toBeVisible();

      // (i) «Descanso» arranca la pausa a mano y no mueve el cursor de serie;
      // «Terminar» con series pendientes avisa —ejercicio a ejercicio— y, al
      // aceptar, pide esfuerzo y nota.
      await mode.getByRole("button", { name: "Descanso", exact: true }).click();
      await expect(
        mode.getByRole("progressbar", {
          name: "Pausa entre series de Press banca",
        }),
      ).toBeVisible();
      await mode.getByRole("button", { name: "Saltar", exact: true }).click();
      await expect(
        mode.getByRole("heading", { name: "Serie 1/12", exact: true }),
      ).toBeVisible();
      await expect(
        mode.getByRole("progressbar", { name: /^Pausa/ }),
      ).toHaveCount(0);

      await mode.getByRole("button", { name: "Terminar", exact: true }).click();
      const pendingDialog = page.getByRole("dialog", {
        name: "Series sin completar",
      });
      await expect(pendingDialog).toBeVisible();
      const pendingRow = (lesson: string) =>
        pendingDialog.getByRole("listitem").filter({ hasText: lesson });
      await expect(pendingRow("Press banca")).toContainText(
        "Series 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12",
      );
      await expect(pendingRow("Remo con barra")).toContainText("Series 1");
      await expect(pendingRow("Sentadilla a una pierna")).toContainText(
        "Series 1, 2",
      );
      await expect(pendingRow(cinta.name)).toContainText("Sin hacer");
      // (a) Y con el aviso abierto el modo sigue cabiendo entero.
      const withDialog = await modeScroll(page);
      expect(withDialog.sectionScroll).toBeLessThanOrEqual(
        withDialog.sectionClient,
      );
      expect(withDialog.documentScroll).toBeLessThanOrEqual(
        withDialog.viewport,
      );

      await pendingDialog
        .getByRole("button", { name: "Terminar", exact: true })
        .click();
      await expect(pendingDialog).toBeHidden();
      const effort = mode.getByRole("radiogroup", {
        name: "Esfuerzo percibido",
      });
      await expect(effort).toBeVisible();
      await expect(mode.getByRole("radio", { name: /Moderado/ })).toBeVisible();
      await expect(
        mode.getByRole("textbox", { name: "Nota de la sesión" }),
      ).toBeVisible();
      await expect(
        mode.getByText("Elige cómo fue para poder cerrar la sesión."),
      ).toBeVisible();
      // Sin esfuerzo no hay cierre; con el cierre abierto tampoco hay scroll.
      await expect(
        mode.getByRole("button", { name: "Terminar", exact: true }),
      ).toBeDisabled();
      const withFinish = await modeScroll(page);
      expect(withFinish.sectionScroll).toBeLessThanOrEqual(
        withFinish.sectionClient,
      );
      expect(withFinish.documentScroll).toBeLessThanOrEqual(
        withFinish.viewport,
      );
      await mode.getByRole("button", { name: "Seguir", exact: true }).click();
      await expect(effort).toBeHidden();

      // (g) El descanso en curso: barra, play/pausa que congela la cuenta atrás
      // y segundos que siguen al reanudar.
      const seriesBox = (n: number) =>
        mode.getByRole("checkbox", {
          name: `Press banca serie ${n}`,
          exact: true,
        });
      await seriesBox(1).check();
      const bar = mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      });
      await expect(bar).toBeVisible();
      const countdown = mode.getByText(/^\d+:\d\d$/);
      await expect(countdown).toBeVisible();
      await mode.getByRole("button", { name: "Pausar descanso" }).click();
      await expect(
        mode.getByRole("button", { name: "Reanudar descanso" }),
      ).toBeVisible();
      const frozen = await countdown.textContent();
      await page.waitForTimeout(1300);
      expect(await countdown.textContent()).toBe(frozen);
      await mode.getByRole("button", { name: "Reanudar descanso" }).click();
      await expect(
        mode.getByRole("button", { name: "Pausar descanso" }),
      ).toBeVisible();
      await expect
        .poll(async () => countdown.textContent(), { timeout: 5000 })
        .not.toBe(frozen);
      await mode.getByRole("button", { name: "Saltar", exact: true }).click();
      await expect(bar).toBeHidden();

      // (e) Tras saltar la pausa el cursor queda en la serie siguiente a la
      // marcada (no vuelve a la ya hecha), y solo se pinta la serie en curso:
      // una casilla, sin la tira del encabezado.
      await expect(
        mode.getByRole("heading", { name: "Serie 2/12", exact: true }),
      ).toBeVisible();
      expect(await setBoxes(page)).toMatchObject({
        count: 1,
        label: "Press banca serie 2",
        strips: 0,
      });
      await expect(
        mode.getByRole("button", { name: "Serie anterior" }),
      ).toBeEnabled();

      // (f) El menú flotante manda sobre el recuento: los dos contadores —el del
      // nombre y el de la fila de la serie— suben y bajan juntos, sin mover el
      // cursor. Escape lo cierra y devuelve el foco a su botón.
      const setsMenuButton = mode.getByRole("button", {
        name: "Series de Press banca",
      });
      await setsMenuButton.click();
      const menu = mode.getByRole("menu", { name: "Series de Press banca" });
      await expect(menu).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(menu).toBeHidden();
      expect(
        await setsMenuButton.evaluate((el) => el === document.activeElement),
      ).toBe(true);

      await setsMenuButton.click();
      await menu
        .getByRole("menuitem", { name: "Añadir serie a Press banca" })
        .click();
      await expect(menu).toBeHidden();
      await expect(
        mode.getByRole("heading", { name: "Serie 2/13", exact: true }),
      ).toBeVisible();
      await expect(mode.getByText("2/13", { exact: true })).toBeVisible();

      await setsMenuButton.click();
      await menu
        .getByRole("menuitem", { name: "Quitar serie a Press banca" })
        .click();
      await expect(
        mode.getByRole("heading", { name: "Serie 2/12", exact: true }),
      ).toBeVisible();
      await expect(mode.getByText("2/12", { exact: true })).toBeVisible();

      // Las marcas de una serie viajan con ella: escribir unas nuevas la marca
      // (y arranca su pausa, que deja el cursor en la siguiente), y al volver
      // siguen ahí.
      const nextSeries = mode.getByRole("button", { name: "Serie siguiente" });
      await mode
        .getByLabel(/^peso \(kg\) · press banca serie 2$/i)
        .fill("62.5");
      await expect(seriesBox(2)).toBeChecked();
      await expect(bar).toBeVisible();
      await mode.getByRole("button", { name: "Saltar", exact: true }).click();
      // La pausa deja el cursor en la 3 (la siguiente a la marcada)…
      await expect(
        mode.getByRole("heading", { name: "Serie 3/12", exact: true }),
      ).toBeVisible();
      await expect(
        mode.getByLabel(/^peso \(kg\) · press banca serie 3$/i),
      ).toHaveValue("60");
      await expect(seriesBox(3)).not.toBeChecked();
      // …y la 2 sigue con lo escrito al volver con la flecha.
      await mode.getByRole("button", { name: "Serie anterior" }).click();
      await expect(
        mode.getByLabel(/^peso \(kg\) · press banca serie 2$/i),
      ).toHaveValue("62.5");
      await expect(seriesBox(2)).toBeChecked();
      for (let n = 2; n < 12; n++) await nextSeries.click();
      await expect(
        mode.getByRole("heading", { name: "Serie 12/12", exact: true }),
      ).toBeVisible();
      await expect(nextSeries).toBeDisabled();

      // (h) «A continuación: X» cuando al ejercicio solo le queda la última
      // serie: el salto se hace desde el listado del encabezado.
      await openerFor("Press banca").click();
      await expect(itemsDialog).toBeVisible();
      await itemsDialog
        .getByRole("button", {
          name: "Sentadilla a una pierna, pendiente",
          exact: true,
        })
        .click();
      await expect(itemsDialog).toBeHidden();
      await expect(
        mode.getByRole("heading", { name: "Sentadilla a una pierna" }),
      ).toBeVisible();
      const upNext = mode.getByText(/^A continuación: /);
      await expect(upNext).toHaveCount(0);
      const pistolBox = (n: number) =>
        mode.getByRole("checkbox", {
          name: `Sentadilla a una pierna serie ${n}`,
          exact: true,
        });
      await pistolBox(1).check();
      await expect(
        mode.getByRole("progressbar", {
          name: "Pausa entre series de Sentadilla a una pierna",
        }),
      ).toBeVisible();
      await expect(upNext).toBeVisible();
      await expect(upNext).toContainText(cinta.name);
      // Saltar deja el cursor en la segunda (y última) serie del ejercicio.
      await mode.getByRole("button", { name: "Saltar", exact: true }).click();
      await expect(
        mode.getByRole("heading", { name: "Serie 2/2", exact: true }),
      ).toBeVisible();
      await pistolBox(2).check();
      await expect(
        mode.getByRole("progressbar", {
          name: "Pausa al terminar Sentadilla a una pierna",
        }),
      ).toBeVisible();
      await expect(upNext).toBeVisible();
      await mode.getByRole("button", { name: "Saltar", exact: true }).click();
      await expect(
        mode.getByRole("heading", { name: cinta.name }),
      ).toBeVisible();
      await expect(upNext).toHaveCount(0);

      // El modo entero sigue cabiendo, ya con todo marcado.
      const end = await modeScroll(page);
      expect(end.sectionScroll).toBeLessThanOrEqual(end.sectionClient);
      expect(end.documentScroll).toBeLessThanOrEqual(end.viewport);
      expect(end.pageWidth).toBeLessThanOrEqual(viewport.width);
    });
  }

  test("sin nombre, el modo enseña «Sesión» bajo el encabezado (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const date = dayFrom(589 + testInfo.retry * 14);
    await resetPlanned(page.request, date);
    // Sin nombre: la API lo guarda `null` y el modo (como el borrador) lo
    // enseña como «Sesión».
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 1, targetRepsMin: 8 }],
      "",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    const nameBox = await boxOf(
      mode.getByText("Sesión", { exact: true }),
      "el nombre de la sesión",
    );
    const headerBox = await boxOf(mode.locator("header"), "el encabezado");
    expect(nameBox.y).toBeGreaterThanOrEqual(
      headerBox.y + headerBox.height - 1,
    );
  });

  test("el encabezado del borrador va en una fila y cabe en la primera pantalla (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const date = mondayFrom(350 + testInfo.retry * 14);
    await resetPlanned(page.request, date);
    await createSession(
      page.request,
      date,
      [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 3, targetRepsMin: 10 },
      ],
      "Piernas",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await expect(
      page.getByRole("heading", { name: "Piernas", exact: true }),
    ).toBeVisible();

    const geo = await measureDraftHeader(page);
    // El sujeto de la página es la sesión, junto a la flecha; el día, debajo y
    // alineado con el nombre (no con la flecha).
    expect(geo.titleText).toBe("Piernas");
    expect(geo.dayText).toMatch(/\d+ de \w+/);
    expect(geo.arrowThenName).toBe(true);
    expect(geo.ringRightOfName).toBe(true);
    expect(geo.ringOnNameRow).toBe(true);
    expect(geo.dayBelowName).toBe(true);
    expect(geo.dayAlignedWithName).toBe(true);

    // Y el bloque entero cabe en la primera pantalla: el encabezado se queda en
    // 150 px (apilado medía 284) y «Empezar» entra sin desplazar la página.
    expect(geo.headerHeight).toBeLessThanOrEqual(150);
    expect(geo.empezarBottom).toBeLessThanOrEqual(geo.viewportHeight);
    expect(geo.pageWidth).toBeLessThanOrEqual(390);

    // El aro cuenta las series del día y avanza con el borrador. A 0 no pinta
    // nada —sin círculo de fondo—, y al marcar aparece el arco.
    const ring = page.getByRole("progressbar", { name: "Series hechas" });
    await expect(ring).toHaveAttribute("aria-valuenow", "0");
    await expect(ring).toHaveAttribute("aria-valuemax", "6");
    expect(await paintedRingStrokes(page)).toBe(0);
    // El aro avanza con lo registrado: se marca una serie dentro del modo y, al
    // volver al resumen, el arco ya está pintado.
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await mode.getByLabel(/^peso \(kg\) · press banca serie 1$/i).fill("55");
    await mode.getByLabel(/^reps · press banca serie 1$/i).fill("8");
    await mode.getByRole("button", { name: "Salir del modo sesión" }).click();
    await page.getByRole("button", { name: "Salir", exact: true }).click();
    await expect(ring).toHaveAttribute("aria-valuenow", "1");
    expect(await paintedRingStrokes(page)).toBe(1);
  });
});
