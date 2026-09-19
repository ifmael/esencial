import { expect, test } from "@playwright/test";

// Menú lateral: 3 secciones (Hoy, Deporte, Nutrición), submenús colapsables y
// navegación. El proyecto `authed` ya inyecta la sesión; se repite por claridad.
test.describe("MENÚ — secciones colapsables", () => {
  test.use({ storageState: ".auth/state.json" });

  test("colapsa/expande los submenús y navega a sus páginas", async ({
    page,
  }) => {
    await page.goto("/");
    const sidebar = page.locator("aside");
    await expect(sidebar.getByRole("link", { name: "Hoy" })).toBeVisible();
    await expect(sidebar.getByRole("link", { name: "Deporte" })).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Nutrición" }),
    ).toBeVisible();
    // Colapsados por defecto: los subitems no están.
    await expect(sidebar.getByRole("link", { name: "Ejercicios" })).toHaveCount(
      0,
    );
    await expect(sidebar.getByRole("link", { name: "Plantillas" })).toHaveCount(
      0,
    );

    await sidebar.getByRole("button", { name: "Expandir Deporte" }).click();
    await sidebar.getByRole("link", { name: "Plantillas" }).click();
    await expect(page).toHaveURL(/\/plantillas$/);
    await expect(
      page.getByRole("heading", { name: "Plantillas", exact: true }),
    ).toBeVisible();

    // La sección de la ruta activa se auto-expande.
    await page.goto("/plan-fuerza");
    await expect(
      sidebar.getByRole("link", { name: "Ejercicios" }),
    ).toBeVisible();
    // Y la página ya no lista plantillas.
    await expect(
      page.getByRole("button", { name: "+ Nueva plantilla" }),
    ).toHaveCount(0);
  });
});
