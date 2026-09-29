import { expect, test } from "@playwright/test";
import { seededExercise } from "./helpers";

test.describe("DETALLE DE EJERCICIO", () => {
  test.use({ storageState: ".auth/state.json" });

  test("cabecera compacta de una fila con volver, título y editar (móvil y escritorio)", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/ejercicios/${press.id}`);

    const title = page.getByRole("heading", { level: 1, name: "Press banca" });
    await expect(title).toBeVisible();
    const header = page.locator("header").filter({ has: title });
    // Volver va dentro de la cabecera (barra superior M3), no en su propia fila.
    await expect(
      header.getByRole("link", { name: "Volver al catálogo" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Editar ejercicio" }),
    ).toBeVisible();
    const height = async () => (await header.boundingBox())?.height;
    await expect.poll(height).toBeLessThan(100);

    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(height).toBeLessThan(100);
  });
});
