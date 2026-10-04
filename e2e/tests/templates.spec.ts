import { expect, type Locator, test } from "@playwright/test";
import { seededExercise, uniqueName } from "./helpers";

/** Orden actual de las filas del borrador, leído de las asas «Mover <nombre>». */
function rowOrder(list: Locator) {
  return list
    .getByRole("button", { name: /^Mover / })
    .evaluateAll((els) =>
      els.map((el) =>
        (el.getAttribute("aria-label") ?? "").replace(/^Mover /, ""),
      ),
    );
}

test.describe("PLANTILLAS — crear y editar en una página con URL", () => {
  test("crear: página con URL, selector embebido, reordenar y guardar", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const name = uniqueName("Página A");

    await page.goto("/plantillas");
    await page.getByRole("button", { name: "+ Nueva plantilla" }).click();
    await expect(page).toHaveURL(/\/plantillas\/nueva$/);

    // Página propia: sin modal y sin la lista de plantillas por debajo.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Nueva plantilla" }),
    ).toBeVisible();

    await page.getByLabel("Nombre").fill(name);

    const search = page.getByPlaceholder("Buscar ejercicio");
    await search.fill(press.name);
    await page.getByRole("button", { name: press.name, exact: true }).click();
    await search.fill(remo.name);
    await page.getByRole("button", { name: remo.name, exact: true }).click();

    const list = page.getByRole("list", {
      name: "Ejercicios de la plantilla",
    });
    await expect.poll(() => rowOrder(list)).toEqual([press.name, remo.name]);

    // Reordenar con el asa: Remo sube por encima de Press.
    const handle = page.getByRole("button", { name: `Mover ${remo.name}` });
    await handle.scrollIntoViewIfNeeded();
    const from = await handle.boundingBox();
    const to = await list.getByText(press.name).boundingBox();
    if (!from || !to) throw new Error("Sin caja para arrastrar");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    await expect.poll(() => rowOrder(list)).toEqual([remo.name, press.name]);

    await page.waitForTimeout(100); // el filtro de click de dnd-kit expira
    await page.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(/\/plantillas$/);

    const card = page.locator("section").filter({ hasText: name }).first();
    await expect(card).toBeVisible();

    // Recargar la URL de edición reabre la página: el orden viajó en el payload.
    await card.getByRole("button", { name: "Editar" }).click();
    await expect(page).toHaveURL(/\/plantillas\/\d+\/editar$/);
    await page.reload();
    await expect(page.getByLabel("Nombre")).toHaveValue(name);
    const reopened = page.getByRole("list", {
      name: "Ejercicios de la plantilla",
    });
    await expect
      .poll(() => rowOrder(reopened))
      .toEqual([remo.name, press.name]);
  });

  test("atrás, Escape y Cancelar vuelven a la lista sin crear nada", async ({
    page,
  }) => {
    await page.goto("/plantillas");
    const nueva = page.getByRole("button", { name: "+ Nueva plantilla" });

    await nueva.click();
    await expect(page).toHaveURL(/\/plantillas\/nueva$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plantillas$/);

    await nueva.click();
    await expect(
      page.getByRole("heading", { name: "Nueva plantilla" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/plantillas$/);

    await nueva.click();
    await page.getByLabel("Nombre").fill("No debería");
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page).toHaveURL(/\/plantillas$/);
    await expect(page.getByText("No debería")).toHaveCount(0);
  });
});
