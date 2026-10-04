// HISTORIAL — dos superficies que leen lo que deja el registro de una sesión:
// el índice de días registrados (/historial, sección Deporte) y el historial de
// un ejercicio en su ficha. Ninguna escribe: el histórico se llena cerrando
// sesiones.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

/** Fecha propia de la prueba (nadie más escribe en 2020): un día distinto por
 *  test y por reintento, que reencontraría el día ya registrado. */
const dateFor = (test: number, retry: number): string =>
  new Date(Date.UTC(2020, 4, 4 + test * 10 + retry)).toISOString().slice(0, 10);

type Session = {
  id: number;
  name: string | null;
  exercises: { id: number; exerciseId: number }[];
};

/** Ejercicio propio, planificado y registrado: el histórico solo tiene esto. */
async function loggedDay(
  request: APIRequestContext,
  test: number,
  retry: number,
): Promise<{ date: string; exerciseId: number; sessionName: string }> {
  const date = dateFor(test, retry);
  const exercise = await apiRequest<{ id: number }>(
    request,
    "POST",
    "/api/exercises",
    { name: uniqueName("Historial"), tags: ["pecho"], kind: "strength" },
  );
  const sessionName = uniqueName("Empuje");
  const session = await apiRequest<Session>(
    request,
    "POST",
    "/api/plan-sessions",
    {
      date,
      name: sessionName,
      items: [{ exerciseId: exercise.id, targetSets: 2 }],
    },
  );
  const item = session.exercises.find((e) => e.exerciseId === exercise.id);
  if (!item) throw new Error("la sesión no trae su ejercicio");
  await apiRequest(request, "POST", `/api/workout-logs/${date}`, {
    effort: 4,
    note: "prueba del historial",
    sets: [
      {
        planSessionExerciseId: item.id,
        setIndex: 0,
        weightKg: 62.5,
        reps: 5,
        done: true,
      },
      {
        planSessionExerciseId: item.id,
        setIndex: 1,
        weightKg: 60,
        reps: 8,
        done: true,
      },
    ],
    cardio: [],
  });
  return { date, exerciseId: exercise.id, sessionName };
}

test.describe("HISTORIAL", () => {
  test("el índice lista el día registrado y lleva al registro", async ({
    page,
    request,
  }, testInfo) => {
    const { date, sessionName } = await loggedDay(request, 0, testInfo.retry);

    await page.goto("/historial");
    const row = page.getByRole("link", { name: new RegExp(sessionName) });
    await expect(row).toBeVisible();
    // El volumen y el esfuerzo los cubre el test del rango/iconos.

    await row.click();
    await expect(page).toHaveURL(new RegExp(`/sesion/${date}$`));
    // La vista registrada del día: solo lectura, con su nota.
    await expect(page.getByText("prueba del historial")).toBeVisible();
  });

  test("la ficha del ejercicio muestra su historial con la mejor serie", async ({
    page,
    request,
  }, testInfo) => {
    const { date, exerciseId } = await loggedDay(request, 1, testInfo.retry);

    await page.goto(`/ejercicios/${exerciseId}`);
    const history = page.getByRole("region", { name: "Historial" });
    await expect(history).toBeVisible();
    // El «mejor» lo calcula el API sobre todo el histórico, con su fecha.
    await expect(history.getByText(/^Mejor: 62\.5×5 · /)).toBeVisible();
    // Y la progresión se dibuja (un día sembrado, una barra).
    await expect(
      history.getByRole("img", {
        name: /^Progresión de .*: 62\.5 kg en 1 sesión$/,
      }),
    ).toBeVisible();

    await expect(
      history.getByRole("link", { name: /62\.5×5 · 60×8/ }),
    ).toHaveAttribute("href", `/sesion/${date}`);
  });

  test("en móvil la fila apila sus líneas y el historial no se sale de su ancho", async ({
    page,
    request,
  }, testInfo) => {
    const { exerciseId, sessionName } = await loggedDay(
      request,
      2,
      testInfo.retry,
    );
    const overflow = () =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/historial");
    const row = page.getByRole("link", { name: new RegExp(sessionName) });
    await row.waitFor();
    // La tarjeta de la fila es una columna: fecha, resumen y nota, cada uno en
    // su línea (en línea, la nota se pegaba al resumen y el ancho se salía).
    const tops = await row.evaluate((el) =>
      [...el.children].map((c) => Math.round(c.getBoundingClientRect().top)),
    );
    expect(tops).toEqual([...tops].sort((a, b) => a - b));
    expect(new Set(tops).size).toBe(tops.length);
    expect(await overflow()).toBe(0);

    await page.goto(`/ejercicios/${exerciseId}`);
    await page.getByRole("region", { name: "Historial" }).waitFor();
    // La tarjeta del historial no se sale de sí misma con un nombre de sesión
    // largo. Se mide dentro de la tarjeta y no la página: la ficha se sale con
    // nombres de PLANTILLA largos (el `<select>` de «Añadir a plantilla» no
    // encoge), que es un problema aparte y anterior a esta pantalla.
    const spill = await page.evaluate(() => {
      const section = document.querySelector("#ex-history")?.closest("section");
      if (!section) return Number.NaN;
      const right = section.getBoundingClientRect().right;
      return Math.ceil(
        [...section.querySelectorAll("*")].reduce(
          (max, el) => Math.max(max, el.getBoundingClientRect().right - right),
          0,
        ),
      );
    });
    expect(spill).toBeLessThanOrEqual(0);
  });

  test("el rango filtra los días y la fila enseña volumen y esfuerzo", async ({
    page,
    request,
  }, testInfo) => {
    const { date, sessionName } = await loggedDay(request, 3, testInfo.retry);

    await page.goto("/historial");
    const row = page.getByRole("link", { name: new RegExp(sessionName) });
    await expect(row).toBeVisible();
    // El volumen va en iconos con su nombre accesible, y el esfuerzo en formas.
    await expect(row.getByRole("img", { name: "1 ejercicio" })).toBeVisible();
    await expect(row.getByRole("img", { name: "2 series" })).toBeVisible();
    await expect(
      row.getByRole("img", { name: "Esfuerzo 4 de 5" }),
    ).toBeVisible();

    // Un rango de un día deja solo ese día (nadie más escribe en el año 2020).
    await page.getByLabel("Desde").fill(date);
    await page.getByLabel("Hasta").fill(date);
    await expect(page.locator("main a.card-interactive")).toHaveCount(1);
    await expect(row).toBeVisible();
    await expect(page.locator("header p")).toHaveText("1 día registrado");

    // Un rango sin días lo dice y ofrece volver a todo el historial.
    await page.getByLabel("Desde").fill("2021-01-01");
    await page.getByLabel("Hasta").fill("2021-12-31");
    await expect(
      page.getByText("No hay días registrados en ese rango"),
    ).toBeVisible();
    await page.getByRole("button", { name: "Ver todo el historial" }).click();
    await expect(row).toBeVisible();
  });

  test("el raíl de Deporte ofrece Historial", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.getByRole("button", { name: "Expandir Deporte" }).click();
    await expect(page.getByRole("link", { name: "Historial" })).toHaveAttribute(
      "href",
      "/historial",
    );
  });
});
