import { expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

test.describe("RECIPES — loop end to end", () => {
  test.use({ storageState: ".auth/state.json" });

  test("create recipe via page with photo → listed → detail shows ingredient", async ({
    page,
  }) => {
    const name = uniqueName("Receta E2E");
    const food = uniqueName("IngredienteE2E");
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );

    await page.goto("/recetario");
    await page.getByRole("button", { name: "+ Nueva receta" }).click();
    await expect(page).toHaveURL(/\/recetario\/nueva$/);

    await page.getByLabel("Nombre").fill(name);
    await page.locator('input[type="file"]').setInputFiles({
      name: "foto.png",
      mimeType: "image/png",
      buffer: png,
    });
    await expect(page.getByAltText("Vista previa de la foto")).toBeVisible();

    await page.getByLabel("Ingrediente 1 alimento").fill(food);
    await page.getByLabel("Ingrediente 1 cantidad").fill("2");
    await page.getByLabel("Ingrediente 1 unidad").selectOption("ud");
    await page.getByRole("button", { name: "Guardar" }).click();

    // Listed in the book
    await page.getByLabel("Buscar recetas").fill(name);
    const card = page.locator("a", { hasText: name });
    await expect(card).toHaveCount(1);

    // Detail shows name and ingredients
    await card.click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(food, { exact: false }).first()).toBeVisible();
  });

  test("empty name shows validation error and does not navigate", async ({
    page,
  }) => {
    await page.goto("/recetario");
    await page.getByRole("button", { name: "+ Nueva receta" }).click();
    await expect(page).toHaveURL(/\/recetario\/nueva$/);

    await page.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("El nombre es obligatorio")).toBeVisible();
    await expect(page).toHaveURL(/\/recetario\/nueva$/);
  });

  test("plan week + shopping sheet opens with recipe ingredients", async ({
    page,
  }) => {
    const name = uniqueName("Plan E2E");
    const food = uniqueName("CompraE2E");

    // Self-contained data via API (same shape the UI posts)
    const created = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/recipes",
      {
        name,
        description: "e2e",
        ingredients: [{ food, quantity: 3, unit: "ud" }],
        steps: [],
        materials: [],
        tags: [],
      },
    );
    expect(created.id, "recipe created via API").toBeGreaterThan(0);

    await page.goto("/plan-recetas");
    // Monday desayuno slot: first "+ añadir" button on the page
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await page.getByLabel("Buscar receta").fill(name);
    await page.getByRole("button", { name }).click();

    // Picker closes; slot shows the recipe
    await expect(page.locator("a", { hasText: name })).toHaveCount(1);

    // Shopping sheet opens with the ingredient
    await page.getByRole("button", { name: "Lista de la compra" }).click();
    await expect(
      page.getByRole("heading", { name: "Lista de la compra" }),
    ).toBeVisible();
    await expect(page.getByText(food, { exact: false })).toBeVisible();
  });

  test("mark item done and add manual item; both persist after reload", async ({
    page,
  }) => {
    const name = uniqueName("Sheet E2E");
    const food = uniqueName("HechoE2E");

    await apiRequest(page.request, "POST", "/api/recipes", {
      name,
      description: "e2e",
      ingredients: [{ food, quantity: 1, unit: null }],
      steps: [],
      materials: [],
      tags: [],
    });
    await page.goto("/plan-recetas");
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await page.getByLabel("Buscar receta").fill(name);
    await page.getByRole("button", { name }).click();
    await expect(page.locator("a", { hasText: name })).toHaveCount(1);

    await page.getByRole("button", { name: "Lista de la compra" }).click();

    // Recipe lines have no checkbox; manual items do. Add a manual one first.
    const manual = uniqueName("ManualE2E");
    await page
      .getByLabel(/Añadir artículo en/)
      .first()
      .fill(manual);
    await page
      .getByLabel(/Añadir artículo en/)
      .first()
      .press("Enter");

    // Mark manual item done
    const checkbox = page.getByRole("checkbox", { name: manual });
    await expect(checkbox).toBeVisible();
    await checkbox.click();
    await expect(checkbox).toBeChecked();
    await expect(page.locator("span", { hasText: manual })).toHaveClass(
      /line-through/,
    );

    // Recipe ingredient line present (no checkbox for recipe lines)
    const foodBox = page.getByRole("checkbox", { name: food });
    await expect(foodBox).toHaveCount(0);
    await expect(page.getByText(food, { exact: false })).toBeVisible();

    // Both persist after reload
    await page.reload();
    await page.getByRole("button", { name: "Lista de la compra" }).click();
    await expect(page.getByRole("checkbox", { name: manual })).toBeChecked();
    await expect(page.getByText(food, { exact: false })).toBeVisible();
  });
});
