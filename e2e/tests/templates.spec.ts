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

test.describe("PLANTILLAS — crear y editar en una modal con URL", () => {
  test.use({ storageState: ".auth/state.json" });

  test("crear: modal con URL, selector embebido, reordenar y guardar", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    const remo = await seededExercise(page.request, "Remo con barra");
    const name = uniqueName("Modal A");

    await page.goto("/plantillas");
    await page.getByRole("button", { name: "+ Nueva plantilla" }).click();
    await expect(page).toHaveURL(/\/plantillas\/nueva$/);

    const dialog = page.getByRole("dialog");
    await expect(dialog).toHaveCount(1);
    await expect(
      dialog.getByRole("heading", { name: "Nueva plantilla" }),
    ).toBeVisible();

    await dialog.getByLabel("Nombre").fill(name);

    // El selector vive DENTRO de la modal: sigue habiendo un solo diálogo.
    const search = dialog.getByPlaceholder("Buscar ejercicio");
    await search.fill(press.name);
    await dialog.getByRole("button", { name: press.name, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await search.fill(remo.name);
    await dialog.getByRole("button", { name: remo.name, exact: true }).click();

    const list = dialog.getByRole("list", {
      name: "Ejercicios de la plantilla",
    });
    expect(await rowOrder(list)).toEqual([press.name, remo.name]);

    // Reordenar con el asa: Remo sube por encima de Press.
    const from = await dialog
      .getByRole("button", { name: `Mover ${remo.name}` })
      .boundingBox();
    const to = await list.getByText(press.name).boundingBox();
    if (!from || !to) throw new Error("Sin caja para arrastrar");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y - 10, { steps: 5 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {
      steps: 10,
    });
    await page.mouse.up();
    expect(await rowOrder(list)).toEqual([remo.name, press.name]);

    await page.waitForTimeout(100); // el filtro de click de dnd-kit expira
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page).toHaveURL(/\/plantillas$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const card = page.locator("section").filter({ hasText: name }).first();
    await expect(card).toBeVisible();

    // Recargar la URL de edición reabre la modal: el orden viajó en el payload.
    await card.getByRole("button", { name: "Editar" }).click();
    await expect(page).toHaveURL(/\/plantillas\/\d+\/editar$/);
    await page.reload();
    const reopened = page.getByRole("dialog");
    await expect(reopened).toHaveCount(1);
    expect(await rowOrder(reopened)).toEqual([remo.name, press.name]);
    await expect(reopened.getByLabel("Nombre")).toHaveValue(name);
  });

  test("atrás, Escape y Cancelar cierran la modal sin crear nada", async ({
    page,
  }) => {
    await page.goto("/plantillas");
    const nueva = page.getByRole("button", { name: "+ Nueva plantilla" });

    await nueva.click();
    await expect(page).toHaveURL(/\/plantillas\/nueva$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/plantillas$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await nueva.click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/plantillas$/);
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await nueva.click();
    await page.getByRole("dialog").getByLabel("Nombre").fill("No debería");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cancelar" })
      .click();
    await expect(page).toHaveURL(/\/plantillas$/);
    await expect(page.getByText("No debería")).toHaveCount(0);
  });
});
