// MODO SESIÓN — el modo interactivo de registro: descansos programados en el
// plan, «Empezar» a pantalla completa, pausas con barra y cuenta atrás, y el
// paso al siguiente ejercicio al agotarse la pausa del ejercicio. Se prueba en
// móvil (390 px), que es el caso del gimnasio.
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

/** Dónde cae el bloque de la pausa (la fila de la barra con su cuenta atrás y
 *  el «Saltar»): pegado al encabezado y a la vista, no al pie. Se miden cajas
 *  porque es el sitio lo que se prueba, y se comprueba además si el cuerpo
 *  desborda (el caso en el que el pie quedaba fuera de la pantalla). */
async function measurePausePlacement(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    const header = section.querySelector<HTMLElement>(":scope > header");
    const bar = section.querySelector<HTMLElement>(
      '[role="progressbar"][aria-label^="Pausa"]',
    );
    const heading = section.querySelector<HTMLElement>("h2");
    if (!header || !bar || !heading) {
      throw new Error("Al modo le falta encabezado, barra de pausa o nombre");
    }
    const skip = [...section.querySelectorAll<HTMLElement>("button")].find(
      (b) => b.textContent?.trim() === "Saltar",
    );
    if (!skip) throw new Error("La pausa no tiene «Saltar»");
    let scroller = heading.parentElement as HTMLElement;
    while (scroller !== section) {
      const { overflowY } = getComputedStyle(scroller);
      if (overflowY === "auto" || overflowY === "scroll") break;
      scroller = scroller.parentElement as HTMLElement;
    }
    const h = header.getBoundingClientRect();
    // La fila de la barra: es la caja que abre el bloque.
    const row = bar.parentElement!.getBoundingClientRect();
    const s = skip.getBoundingClientRect();
    const body = scroller.getBoundingClientRect();
    return {
      headerBottom: h.bottom,
      rowTop: row.top,
      blockBottom: s.bottom,
      bodyTop: body.top,
      overflows: scroller.scrollHeight > scroller.clientHeight + 1,
      scrollTop: scroller.scrollTop,
      viewportHeight: window.innerHeight,
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

/** Geometría del encabezado del ejercicio en el modo: la tira que contiene las
 *  casillas de las series (el ancestro más cercano que desplaza en horizontal),
 *  dónde cae respecto a la lista de series y qué casillas quedan dentro de cada
 *  fila. Se mide el desborde y las cajas reales, no las clases. */
async function measureSetStrip(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    // Las casillas de las series: su nombre acaba en «serie N».
    const setBoxes = [
      ...section.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].filter((b) => / serie \d+$/.test(b.getAttribute("aria-label") ?? ""));
    if (setBoxes.length === 0)
      throw new Error("El modo no pinta las casillas de las series");
    // La tira: el ancestro más cercano de la casilla que desplaza en horizontal.
    let strip = setBoxes[0].parentElement as HTMLElement;
    while (strip !== section && getComputedStyle(strip).overflowX !== "auto") {
      strip = strip.parentElement as HTMLElement;
    }
    if (strip === section)
      throw new Error("Las casillas de las series no viven en una tira");
    const list = section.querySelector<HTMLElement>("ul");
    if (!list) throw new Error("El modo no pinta la lista de las series");
    const rows = [...list.querySelectorAll<HTMLElement>(":scope > li")];
    const box = strip.getBoundingClientRect();
    return {
      sets: setBoxes.length,
      allInStrip: setBoxes.every((b) => strip.contains(b)),
      stripHeight: box.height,
      stripAboveList: box.bottom <= list.getBoundingClientRect().top,
      scrolls: strip.scrollWidth > strip.clientWidth + 1,
      boxesInRows: list.querySelectorAll('input[type="checkbox"]').length,
      rows: rows.length,
      rowsWithSteppers: rows.filter(
        (r) => r.querySelectorAll('input[type="number"]').length > 0,
      ).length,
      pageWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Geometría de la cabecera del ejercicio en el modo: el bloque entero (de la
 *  etiqueta del tipo a la fila de debajo del nombre) y si esa fila cae en una
 *  sola línea. Vale para fuerza (la tira de casillas, con «Sin peso» al lado) y
 *  para cardio (el objetivo junto a su «Hecho»). Se miden las cajas reales, no
 *  las clases. */
async function measureExerciseHeader(page: Page) {
  return page.evaluate(() => {
    const section = document.querySelector<HTMLElement>(
      'section[aria-label="Modo sesión"]',
    );
    if (!section) throw new Error("El modo sesión no está abierto");
    const content = section.querySelector<HTMLElement>("div.my-auto");
    if (!content)
      throw new Error("El modo no pinta el contenido del ejercicio");
    const label = content.querySelector<HTMLElement>("p.section-label");
    const heading = section.querySelector<HTMLElement>("h2");
    // La fila es lo último del bloque de la cabecera: bajo el nombre.
    const row = label?.parentElement?.lastElementChild as HTMLElement | null;
    if (!label || !heading || !row)
      throw new Error("El modo no pinta la cabecera del ejercicio");
    const boxes = [
      ...content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ].filter((b) => / serie \d+$/.test(b.getAttribute("aria-label") ?? ""));
    // La tira: el ancestro de la casilla que desplaza en horizontal.
    let strip: HTMLElement | null = null;
    if (boxes.length > 0) {
      strip = boxes[0].parentElement as HTMLElement;
      while (
        strip !== section &&
        getComputedStyle(strip).overflowX !== "auto"
      ) {
        strip = strip.parentElement as HTMLElement;
      }
    }
    const rowBox = row.getBoundingClientRect();
    const pieces = [...row.children].map((c) => c.getBoundingClientRect());
    const nameStyle = getComputedStyle(heading);
    return {
      sets: boxes.length,
      headerHeight: rowBox.bottom - label.getBoundingClientRect().top,
      rowHeight: rowBox.height,
      nameFontSize: Number.parseFloat(nameStyle.fontSize),
      nameLines: Math.round(
        heading.getBoundingClientRect().height /
          Number.parseFloat(nameStyle.lineHeight),
      ),
      // Una sola línea: lo que va bajo el nombre se solapa en vertical.
      onOneRow:
        pieces.length > 0 &&
        Math.max(...pieces.map((b) => b.top)) <
          Math.min(...pieces.map((b) => b.bottom)),
      // El recuento de series no se repite: las casillas ya lo dicen.
      countLine: [...content.querySelectorAll("p, span")].some((el) =>
        /^\d+ series?$/.test((el.textContent ?? "").trim()),
      ),
      stripHeight: strip ? strip.getBoundingClientRect().height : 0,
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

  test("la pausa va pegada al encabezado, a la vista con el cuerpo desbordado", async ({
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
      "Bajo el encabezado",
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
      await expect(
        mode.getByRole("progressbar", {
          name: "Pausa entre series de Press banca",
        }),
      ).toBeVisible();

      const geo = await measurePausePlacement(page);
      // Ocho series: el cuerpo desborda, que es cuando el pie quedaba fuera.
      expect(geo.overflows).toBe(true);
      // La pausa abre el hueco bajo el encabezado, pegada a él…
      expect(geo.rowTop).toBeGreaterThanOrEqual(geo.headerBottom - 1);
      expect(geo.rowTop - geo.headerBottom).toBeLessThanOrEqual(16);
      // …y entra entera en la pantalla, con el ejercicio por debajo.
      expect(geo.blockBottom).toBeLessThanOrEqual(geo.viewportHeight);
      expect(geo.bodyTop).toBeGreaterThanOrEqual(geo.blockBottom);
      expect(geo.pageWidth).toBeLessThanOrEqual(viewport.width);

      // Y no se va con el scroll del cuerpo: es lo primero que se ve.
      await mode.getByRole("heading", { name: "Press banca" }).hover();
      await page.mouse.wheel(0, 400);
      await expect
        .poll(async () => (await measurePausePlacement(page)).scrollTop)
        .toBeGreaterThan(0);
      const scrolled = await measurePausePlacement(page);
      expect(Math.abs(scrolled.rowTop - geo.rowTop)).toBeLessThanOrEqual(1);
      expect(scrolled.blockBottom).toBeLessThanOrEqual(scrolled.viewportHeight);
    }
  });

  test("las casillas de las series van en una tira del encabezado, no una por fila (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const past = mondayFrom(364 + testInfo.retry * 14);
    const date = mondayFrom(371 + testInfo.retry * 14);
    await resetPlanned(page.request, past);
    await resetPlanned(page.request, date);
    await logPast(
      page.request,
      past,
      [
        { exerciseId: press.id, targetSets: 12, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 1, targetRepsMin: 10 },
      ],
      [
        {
          exerciseId: press.id,
          sets: Array.from({ length: 12 }, () => ({ weightKg: 60, reps: 8 })),
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
      ],
      "Tira",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(
      mode.getByRole("heading", { name: "Press banca" }),
    ).toBeVisible();

    // Las doce casillas viven en la tira del encabezado (una sola línea, que
    // desplaza) y ninguna fila de serie lleva casilla: cada fila se queda con
    // su número y sus steppers.
    const geo = await measureSetStrip(page);
    expect(geo).toMatchObject({
      sets: 12,
      allInStrip: true,
      boxesInRows: 0,
      rows: 12,
      rowsWithSteppers: 12,
      stripAboveList: true,
      scrolls: true,
    });
    expect(geo.stripHeight).toBeLessThan(60);
    expect(geo.pageWidth).toBeLessThanOrEqual(390);

    // La casilla de la tira marca SU serie: la primera arranca la pausa entre
    // series y la última (con otro ejercicio detrás) la de fin de ejercicio.
    const box = (n: number) =>
      mode.getByRole("checkbox", {
        name: `Press banca serie ${n}`,
        exact: true,
      });
    await box(1).check();
    await expect(box(1)).toBeChecked();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();

    await mode.getByRole("button", { name: "Saltar" }).click();
    await box(12).check();
    await expect(box(12)).toBeChecked();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa al terminar Press banca",
      }),
    ).toBeVisible();
  });

  test("la cabecera del ejercicio cabe en una fila y en la mitad de alto (móvil)", async ({
    page,
  }, testInfo) => {
    // El caso peor: nombre largo (que partía en dos líneas) y doce series (la
    // tira no cabe y desplaza). Con el nombre en `display-s`, el recuento de
    // series en su propia línea y «Sin peso» en otra, el bloque medía 280 px
    // (medido); ahora mide 108 (38 % de aquel).
    const pistol = await seededExercise(
      page.request,
      "Sentadilla a una pierna",
    );
    const remo = await seededExercise(page.request, "Remo con barra");
    const cinta = await apiRequest<{ id: number }>(
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
    await expect(
      mode.getByRole("heading", { name: "Sentadilla a una pierna" }),
    ).toBeVisible();

    const geo = await measureExerciseHeader(page);
    expect(geo).toMatchObject({
      sets: 12,
      onOneRow: true,
      nameLines: 1,
      countLine: false,
    });
    // Mitad del encabezado anterior (280 px) y un nombre ya pequeño (antes 36).
    expect(geo.headerHeight).toBeLessThanOrEqual(140);
    expect(geo.rowHeight).toBeLessThanOrEqual(56);
    expect(geo.nameFontSize).toBeLessThanOrEqual(24);
    expect(geo.pageWidth).toBeLessThanOrEqual(390);

    // Y el cardio, que no tiene tira: el objetivo del día y su «Hecho» van en
    // esa misma fila (antes eran dos).
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await expect(mode.getByRole("checkbox", { name: / hecho$/ })).toBeVisible();
    const cardio = await measureExerciseHeader(page);
    expect(cardio).toMatchObject({ sets: 0, onOneRow: true, countLine: false });
    expect(cardio.rowHeight).toBeLessThanOrEqual(56);
    expect(cardio.headerHeight).toBeLessThanOrEqual(140);
  });

  test("«A continuación» bajo la lista cuando solo queda la última serie (móvil)", async ({
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

    // Con tres series por delante todavía no hay nada que anunciar: queda más
    // de una serie.
    await expect(upNext).toHaveCount(0);
    await expect(lastOne).toHaveCount(0);

    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect(upNext).toHaveCount(0);
    await mode.getByRole("button", { name: "Saltar" }).click();

    // Al quedar solo la última serie aparece, con el siguiente por orden, bajo
    // la lista.
    await mode.getByRole("checkbox", { name: "Press banca serie 2" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect(upNext).toBeVisible();
    await expect(upNext).toContainText("Remo con barra");
    const list = await mode.locator("ul").boundingBox();
    const line = await upNext.boundingBox();
    expect(line?.y ?? 0).toBeGreaterThanOrEqual(
      (list?.y ?? 0) + (list?.height ?? 0),
    );
    await mode.getByRole("button", { name: "Saltar" }).click();

    // Y sigue a la vista en la pausa de fin de ejercicio.
    await mode.getByRole("checkbox", { name: "Press banca serie 3" }).check();
    await expect(
      mode.getByRole("progressbar", { name: "Pausa al terminar Press banca" }),
    ).toBeVisible();
    await expect(upNext).toBeVisible();

    // El siguiente es el último de la sesión: en vez del nombre, el aviso de
    // que no queda ninguno detrás.
    await mode.getByRole("button", { name: "Saltar" }).click();
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
    // aviso pasa a ser el de último ejercicio.
    await mode.getByRole("button", { name: "Siguiente", exact: true }).click();
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
    await page.getByRole("button", { name: "Series de Press banca" }).click();
    await page.getByLabel(/^peso \(kg\) · press banca serie 1$/i).fill("55");
    await page.getByLabel(/^reps · press banca serie 1$/i).fill("8");
    await expect(ring).toHaveAttribute("aria-valuenow", "1");
    expect(await paintedRingStrokes(page)).toBe(1);
  });
});
