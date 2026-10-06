// BLOQUES (SUPERSERIES) — la marca que pega un ejercicio al siguiente: el
// editor la pone, viaja con el día (API + D1) y al recargar sigue ahí, con los
// descansos en el último miembro.
import {
  type APIRequestContext,
  expect,
  type Page,
  test,
} from "@playwright/test";
import { apiRequest, seededExercise } from "./helpers";

type SessionRow = { id: number; date: string };

/** Espera a que acaben las animaciones (entrada del diálogo y transición de
 *  vista día → modal): mientras duran, su capa se queda con el puntero. */
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

/** El test se queda una fecha en exclusiva: limpia los intentos previos. */
async function resetPlanned(request: APIRequestContext, date: string) {
  const all = await apiRequest<SessionRow[]>(
    request,
    "GET",
    "/api/plan-sessions",
  );
  const found = all.find((s) => s.date === date);
  if (found)
    await apiRequest(request, "DELETE", `/api/plan-sessions/${found.id}`);
}

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

test.describe("BLOQUES — superseries en el día", () => {
  const dayFrom = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return d.toISOString().slice(0, 10);
  };
  const mondayFrom = (offsetDays: number) =>
    mondayOf(isoWeekOf(dayFrom(offsetDays)));

  test("encadenar en el editor viaja al día y la celda lo conserva", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const date = mondayFrom(420 + testInfo.retry * 14);
    const week = isoWeekOf(date);
    await resetPlanned(page.request, date);
    // El día nace sin bloque: lo pone el editor.
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date,
      name: "Superserie de empuje",
      items: [
        { exerciseId: press.id, targetSets: 3, targetRepsMin: 8 },
        { exerciseId: remo.id, targetSets: 3, targetRepsMin: 10 },
      ],
    });

    await page.goto(`/plan-fuerza?week=${week}`);
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const chip = dialog.getByRole("button", {
      name: "Encadenar Press banca con el siguiente",
    });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    // El encadenado ya no tiene descansos; los del bloque los lleva el último.
    await expect(
      dialog.getByLabel(/press banca descanso entre series/i),
    ).toHaveCount(0);
    await expect(
      dialog.getByText(/va pegado a «Remo con barra»/),
    ).toBeVisible();
    await expect(dialog.getByText("Descanso entre vueltas (s)")).toBeVisible();

    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Persistió: al recargar, la marca sigue puesta.
    await page.reload();
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    await expect(
      page.getByRole("dialog").getByRole("button", {
        name: "Encadenar Press banca con el siguiente",
      }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  // La CAJA del bloque: los encadenados se leen juntos en la celda y en el
  // editor, con su tono y su borde, sin desbordar a 390 px y sin romper el
  // ordenable (dnd-kit mide las filas al empezar a arrastrar).
  test("la caja del bloque: tono propio, cabe a 390 px y el arrastre sigue ordenando", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const sentadilla = await seededExercise(page.request, "Sentadilla trasera");
    const suelta = await seededExercise(page.request, "Dominadas");
    const date = mondayFrom(434 + testInfo.retry * 14);
    const week = isoWeekOf(date);
    await resetPlanned(page.request, date);
    // El día nace con la triserie y una fila suelta.
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date,
      name: "Triserie",
      items: [
        { exerciseId: press.id, targetSets: 3, superset: true },
        { exerciseId: remo.id, targetSets: 3, superset: true },
        { exerciseId: sentadilla.id, targetSets: 3 },
        { exerciseId: suelta.id, targetSets: 3 },
      ],
    });

    await page.goto(`/plan-fuerza?week=${week}`);
    // La celda del día agrupa los tres en su caja y deja suelta la cuarta.
    const cell = page.getByRole("list", { name: `Ejercicios del ${date}` });
    const cellBox = cell.getByRole("list", { name: "Triserie" });
    await expect(cellBox).toBeVisible();
    expect(await cellBox.locator("> li").count()).toBe(3);
    await expect(cellBox).toContainText("Press banca");
    expect(cellBox.getByText("Dominadas")).toHaveCount(0);
    // La agrupación la dice el tono: distinto del de una fila suelta y del de
    // la superficie de detrás. La caja es el contenedor de la lista.
    const box = cellBox.locator("..");
    const [boxPaint, rowPaint, pagePaint] = await Promise.all([
      box.evaluate((el) => getComputedStyle(el).backgroundColor),
      cell
        .locator("li", { hasText: "Dominadas" })
        .last()
        .evaluate((el) => getComputedStyle(el).backgroundColor),
      page.evaluate(() => getComputedStyle(document.body).backgroundColor),
    ]);
    expect(boxPaint).not.toBe(rowPaint);
    expect(boxPaint).not.toBe(pagePaint);
    expect(boxPaint).not.toBe("rgba(0, 0, 0, 0)");
    // La etiqueta del bloque cabe en una línea en la columna más estrecha.
    const caption = await box.locator("p").boundingBox();
    expect(caption?.height ?? 99).toBeLessThanOrEqual(20);

    // En móvil, el editor del día: la caja cabe y el bloque no desborda.
    await page.setViewportSize({ width: 390, height: 800 });
    await page
      .getByRole("button", { name: `Editar sesión del ${date}` })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await settle(page);
    const editorBox = dialog.getByRole("list", { name: "Triserie" });
    await expect(editorBox).toBeVisible();
    const boxElement = editorBox.locator("..");
    const members = editorBox.locator("> li");
    expect(await members.count()).toBe(3);
    for (const member of await members.all()) {
      const size = await member.boundingBox();
      // Objetivo táctil intacto.
      expect(size?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
    const [boxBox, dialogBox, overflow] = await Promise.all([
      boxElement.boundingBox(),
      dialog.boundingBox(),
      page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      })),
    ]);
    if (!boxBox || !dialogBox) throw new Error("Sin caja que medir");
    expect(boxBox.x).toBeGreaterThanOrEqual(dialogBox.x);
    expect(boxBox.x + boxBox.width).toBeLessThanOrEqual(
      dialogBox.x + dialogBox.width + 1,
    );
    expect(overflow.width).toBeLessThanOrEqual(overflow.client);

    // El ordenable sigue midiendo las filas anidadas: arrastrar el primer
    // miembro hasta abajo reordena el día (y con él viaja su marca, así que la
    // caja se rehace). El salto exacto depende de la geometría del arrastre
    // simulado; los cambios de UNA posición los cubren `strength.spec.ts` y
    // `templates.spec.ts` con filas simétricas.
    const handles = dialog.getByRole("button", { name: /^Mover / });
    const order = () =>
      handles.evaluateAll((els) =>
        els.map((el) =>
          (el.getAttribute("aria-label") ?? "").replace(/^Mover /, ""),
        ),
      );
    expect(await order()).toEqual([
      "Press banca",
      "Remo con barra",
      "Sentadilla trasera",
      "Dominadas",
    ]);
    await settle(page);
    const from = await dialog
      .getByRole("button", { name: "Mover Press banca" })
      .boundingBox();
    const to = await dialog
      .getByText("Dominadas", { exact: true })
      .boundingBox();
    if (!from || !to) throw new Error("Sin caja para arrastrar");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    const after = await order();
    expect(after).not.toEqual([
      "Press banca",
      "Remo con barra",
      "Sentadilla trasera",
      "Dominadas",
    ]);
    expect(after[0]).toBe("Remo con barra");
    // El bloque se rehizo con las filas que siguen encadenadas.
    await expect(
      dialog.getByRole("list", {
        name: /^(Superserie|Triserie|Serie gigante)$/,
      }),
    ).toBeVisible();
  });
});
