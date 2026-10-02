// MODO SESIÓN — el modo interactivo de registro: descansos programados en el
// plan, «Empezar» a pantalla completa, pausas con barra y cuenta atrás, y el
// paso al siguiente ejercicio al agotarse la pausa del ejercicio. Se prueba en
// móvil (390 px), que es el caso del gimnasio.
import { type APIRequestContext, expect, test } from "@playwright/test";
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
  test.use({ storageState: ".auth/state.json" });

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
    await expect(mode.getByText("1 / 2")).toBeVisible();
    // La barra de progreso de la sesión: series hechas sobre el total.
    await expect(
      mode.getByRole("progressbar", { name: "0 de 3 series hechas" }),
    ).toBeVisible();

    // Serie intermedia: pausa entre series con barra y cuenta atrás, que se
    // agota sola y deja el mismo ejercicio activo.
    await mode.getByRole("checkbox", { name: "Press banca serie 1" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa entre series de Press banca",
      }),
    ).toBeVisible();
    await expect(
      mode.getByRole("progressbar", { name: "1 de 3 series hechas" }),
    ).toBeVisible();
    await expect(mode.getByText(/^\d:\d\d$/)).toBeVisible();
    await expect(
      mode.getByRole("progressbar", { name: /pausa entre series/i }),
    ).toBeHidden({ timeout: 5000 });
    await expect(mode.getByText("1 / 2")).toBeVisible();

    // Última serie: pausa al terminar y, al agotarse, el siguiente ejercicio
    // queda activo.
    await mode.getByRole("checkbox", { name: "Press banca serie 2" }).check();
    await expect(
      mode.getByRole("progressbar", {
        name: "Pausa al terminar Press banca",
      }),
    ).toBeVisible();
    await expect(mode.getByText("2 / 2")).toBeVisible({ timeout: 6000 });
    await expect(
      mode.getByRole("heading", { name: "Remo con barra" }),
    ).toBeVisible();

    // Nada se sale de la pantalla en móvil.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);

    // «Salir» vuelve al borrador sin tocar nada.
    await mode.getByRole("button", { name: "Salir del modo sesión" }).click();
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
      mode.getByRole("progressbar", { name: "0 de 1 series hechas" }),
    ).toBeVisible();
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
});
