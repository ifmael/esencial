// COPIAR SESIÓN — copiar el plan de un día a otro y de una semana entera a
// otra desde /plan-fuerza: el aviso previo, lo que acaba en el servidor y el
// «Deshacer», que devuelve la rejilla a como estaba.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest, seededExercise } from "./helpers";

type SessionRow = {
  id: number;
  date: string;
  name: string | null;
  status: string;
  exercises: {
    exerciseName: string;
    restSecs: number | null;
    superset?: boolean;
  }[];
};

/** ISO week "YYYY-Www" de una fecha (misma convención que la app). */
function isoWeekOf(date: string): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // jueves
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const week =
    1 + Math.round((t.getTime() - jan4.getTime()) / (7 * 86_400_000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Lunes de la semana ISO (espejo de iso-week.ts). */
function mondayOf(week: string): string {
  const [year, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  monday.setUTCDate(monday.getUTCDate() + (w - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** Las siete fechas de la semana ISO del lunes dado. */
function weekDates(week: string): string[] {
  const monday = new Date(`${mondayOf(week)}T12:00:00Z`);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getTime() + i * 86_400_000);
    return d.toISOString().slice(0, 10);
  });
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Rótulo corto del día, espejo de `dayLabel` (`web/src/lib/day.ts`). */
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sept",
  "oct",
  "nov",
  "dic",
];

function dayLabel(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Semana de origen de cada test, lejos de las que usan los demás specs.
 *
 *  Es la excepción al criterio de «fechas reales» del resto de la suite: copiar
 *  escribe sesiones en días que otros specs también siembran (la semana vista,
 *  la de hoy), así que aquí cada test se va a un lunes a `offset` días de hoy y
 *  cada reintento estrena la suya (28 días más allá) para no heredar los restos
 *  del intento anterior. `clearDays` deja limpios los días que va a usar. */
function sourceWeekFrom(offset: number, retry: number): string {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + offset + retry * 28);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return isoWeekOf(day.toISOString().slice(0, 10));
}

/** Deja esos días sin sesión planificada (un reintento reencuentra sus restos). */
async function clearDays(request: APIRequestContext, dates: string[]) {
  const all = await apiRequest<SessionRow[]>(
    request,
    "GET",
    "/api/plan-sessions",
  );
  for (const s of all) {
    if (dates.includes(s.date) && s.status === "planned")
      await apiRequest(request, "DELETE", `/api/plan-sessions/${s.id}`);
  }
}

const sessions = (request: APIRequestContext) =>
  apiRequest<SessionRow[]>(request, "GET", "/api/plan-sessions");

test.describe("COPIAR SESIÓN — día y semana", () => {
  test("día → día: copia el plan (nombre, orden y descansos) y se deshace", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const sourceWeek = sourceWeekFrom(658, testInfo.retry);
    const week = isoWeekOf(addDays(mondayOf(sourceWeek), 14));
    const source = mondayOf(sourceWeek);
    const target = weekDates(week)[1]; // martes
    await clearDays(page.request, [source, target]);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: source,
      name: "Empuje copia",
      items: [
        {
          exerciseId: press.id,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
          // Biserie: el primero va pegado al segundo y sin descanso propio.
          superset: true,
        },
        {
          exerciseId: remo.id,
          targetSets: 3,
          targetRepsMin: 10,
          restSecs: 90,
          restAfterSecs: 120,
        },
      ],
    });

    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Copiar al ${dayLabel(target)}` })
      .click();
    const dialog = page.getByRole("dialog", { name: /Copiar sesión/ });
    await expect(dialog).toBeVisible();
    // El origen arranca en la sesión guardada más reciente.
    await expect(dialog.getByLabel("Copiar desde")).toHaveValue(source);
    await expect(
      dialog.getByText("«Empuje copia» · 2 ejercicios"),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Copiar", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const copied = page.getByRole("list", { name: `Ejercicios del ${target}` });
    await expect(copied.getByText("Press banca")).toBeVisible();
    await expect(copied.getByText("Remo con barra")).toBeVisible();
    // La cadena viaja con la copia: los dos miembros van en su caja.
    await expect(copied.getByText("Superserie")).toBeVisible();
    await expect(page.getByText(/^Sesión copiada al /)).toBeVisible();

    // En el servidor: el plan del origen, sin tocar el origen.
    const rows = await sessions(page.request);
    const day = rows.find((s) => s.date === target);
    expect(day?.name).toBe("Empuje copia");
    expect(day?.status).toBe("planned");
    expect(day?.exercises.map((e) => e.exerciseName)).toEqual([
      "Press banca",
      "Remo con barra",
    ]);
    expect(day?.exercises[0].superset).toBe(true);
    expect(day?.exercises[0].restSecs).toBeNull();
    expect(day?.exercises[1].restSecs).toBe(90);
    expect(rows.filter((s) => s.date === source)).toHaveLength(1);

    // «Deshacer» retira el día copiado y lo deja vacío otra vez.
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(
      page.getByRole("list", { name: `Ejercicios del ${target}` }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "+ añadir" }).first(),
    ).toBeVisible();
    expect((await sessions(page.request)).some((s) => s.date === target)).toBe(
      false,
    );
  });

  test("día → día sobre un día planificado: avisa de la sustitución y la devuelve", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const sourceWeek = sourceWeekFrom(686, testInfo.retry);
    const week = isoWeekOf(addDays(mondayOf(sourceWeek), 14));
    const source = mondayOf(sourceWeek);
    const target = weekDates(week)[2]; // miércoles
    await clearDays(page.request, [source, target]);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: source,
      name: "Pierna copia",
      items: [{ exerciseId: press.id, targetSets: 4, targetRepsMin: 6 }],
    });
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: target,
      name: "Viejo plan",
      items: [{ exerciseId: remo.id, targetSets: 2, targetRepsMin: 12 }],
    });

    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Copiar al ${dayLabel(target)}` })
      .click();
    const dialog = page.getByRole("dialog", { name: /Copiar sesión/ });
    await expect(
      dialog.getByText("El día ya tiene 1 ejercicio: se sustituirá."),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Copiar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const cell = page.getByRole("list", { name: `Ejercicios del ${target}` });
    await expect(cell.getByText("Press banca")).toBeVisible();
    await expect(cell.getByText("Remo con barra")).toHaveCount(0);
    const afterCopy = (await sessions(page.request)).find(
      (s) => s.date === target,
    );
    expect(afterCopy?.name).toBe("Pierna copia");
    expect(afterCopy?.exercises.map((e) => e.exerciseName)).toEqual([
      "Press banca",
    ]);

    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect
      .poll(
        async () =>
          (await sessions(page.request)).find((s) => s.date === target)?.name,
      )
      .toBe("Viejo plan");
    await expect(cell.getByText("Remo con barra")).toBeVisible();
    const back = (await sessions(page.request)).find((s) => s.date === target);
    expect(back?.exercises.map((e) => e.exerciseName)).toEqual([
      "Remo con barra",
    ]);
  });

  test("semana → semana: se vacía y se copia día a día, y se deshace entera", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const sourceWeek = sourceWeekFrom(714, testInfo.retry);
    const week = isoWeekOf(addDays(mondayOf(sourceWeek), 14));
    const sourceDates = weekDates(sourceWeek);
    const targetDates = weekDates(week);
    await clearDays(page.request, [...sourceDates, ...targetDates]);
    // Origen: lunes, martes y miércoles con sesión. Destino: martes con una
    // planificada (se sustituye) y jueves con otra (se borra).
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: sourceDates[0],
      name: "Empuje semana",
      items: [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 3, targetRepsMin: 10 },
      ],
    });
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: sourceDates[1],
      name: "Pierna semana",
      items: [{ exerciseId: press.id, targetSets: 4, targetRepsMin: 6 }],
    });
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: sourceDates[2],
      name: "Espalda semana",
      items: [{ exerciseId: remo.id, targetSets: 4, targetRepsMin: 12 }],
    });
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: targetDates[1],
      name: "Vieja del martes",
      items: [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 12 }],
    });
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: targetDates[3],
      name: "Viejo del jueves",
      items: [{ exerciseId: remo.id, targetSets: 2, targetRepsMin: 10 }],
    });

    await page.goto(`/plan-fuerza?week=${week}`);
    await page.getByRole("button", { name: "Copiar semana" }).click();
    const dialog = page.getByRole("dialog", { name: /Copiar semana/ });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Semana de origen").selectOption(sourceWeek);
    // El aviso global lista, día a día, lo que va a pasar.
    await expect(
      dialog.getByText(/se copia «Empuje semana» \(2 ejercicios\)/),
    ).toBeVisible();
    await expect(
      dialog.getByText(/se sustituye por «Pierna semana» \(1 ejercicio\)/),
    ).toBeVisible();
    await expect(
      dialog.getByText(/se copia «Espalda semana» \(1 ejercicio\)/),
    ).toBeVisible();
    await expect(
      dialog.getByText(/se borra «Viejo del jueves» \(1 ejercicio\)/),
    ).toBeVisible();

    await dialog.getByRole("button", { name: "Copiar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByText(/^Semana copiada · 2 creados · 1 sustituido · 1 borrado/),
    ).toBeVisible();

    // La semana destino queda como la origen: lunes, martes y miércoles
    // copiados y el jueves vacío.
    const rows = await sessions(page.request);
    const inTarget = rows
      .filter((s) => targetDates.includes(s.date))
      .map((s) => [s.date, s.name]);
    expect(inTarget.sort()).toEqual([
      [targetDates[0], "Empuje semana"],
      [targetDates[1], "Pierna semana"],
      [targetDates[2], "Espalda semana"],
    ]);

    // «Deshacer» devuelve los siete días: el martes y el jueves vuelven (con su
    // PUT y su POST) y los copiados se van. El deshacer es asíncrono y encadena
    // cuatro escrituras, así que se espera al estado final en vez de leer una vez.
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect
      .poll(async () =>
        (await sessions(page.request))
          .filter((s) => targetDates.includes(s.date))
          .map((s) => [s.date, s.name])
          .sort(),
      )
      .toEqual([
        [targetDates[1], "Vieja del martes"],
        [targetDates[3], "Viejo del jueves"],
      ]);
  });
});
