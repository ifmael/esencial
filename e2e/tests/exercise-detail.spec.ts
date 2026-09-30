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

  test("al estrechar la ventana el visor encoge con ella, sin desplazar la página", async ({
    page,
  }) => {
    const press = await seededExercise(page.request, "Press banca");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/ejercicios/${press.id}`);
    // Con GPU el lienzo 3D; sin ella (el CI) el SVG de solo lectura, que ya
    // encogía: el test solo discrimina con GPU.
    await expect(page.locator('canvas, svg[role="img"]').first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      )
      .toBe(0);
  });
});
