import { expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

test.describe("RECIPES — loop end to end", () => {
  test("edit recipe from the detail page: page (not modal), saves and persists", async ({
    page,
  }) => {
    const name = uniqueName("Editar E2E");
    const renamed = uniqueName("Editada E2E");
    const { id } = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/recipes",
      {
        name,
        description: "e2e",
        servings: 2,
        ingredients: [{ food: "Sal", quantity: 1, unit: null }],
        steps: ["Paso uno"],
        materials: [],
        tags: [],
      },
    );

    await page.goto(`/recetario/${id}`);
    await page.getByRole("link", { name: "Editar receta" }).click();
    // Página propia: la ficha se desmonta y no queda detrás.
    await expect(page).toHaveURL(new RegExp(`/recetario/${id}/editar$`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Editar receta" }),
    ).toBeVisible();
    await expect(page.getByLabel("Nombre")).toHaveValue(name);
    await expect(page.getByLabel("Descripción")).toHaveValue("e2e");
    expect(await page.getByLabel("Comensales").inputValue()).toBe("2");

    await page.getByLabel("Nombre").fill(renamed);
    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    // Vuelve a la ficha con el nombre nuevo y lo guardado persiste.
    await expect(page).toHaveURL(new RegExp(`/recetario/${id}$`));
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();
  });

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
    await page
      .getByRole("button", { name: "Nueva receta", exact: true })
      .click();
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
    await page
      .getByRole("button", { name: "Guardar receta", exact: true })
      .click();

    // Listed in the book
    await page.getByLabel("Buscar recetas").fill(name);
    const card = page.locator("a", { hasText: name });
    await expect(card).toHaveCount(1);

    // Detail shows name and ingredients
    await card.click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    await expect(page.getByText(food, { exact: false }).first()).toBeVisible();

    // Y la foto se sirve de verdad: la API la autoriza (es una receta que el
    // usuario puede leer) y el <img> va con credenciales — sin
    // crossOrigin="use-credentials" el navegador no manda la cookie cross-origin
    // y esto daría 404.
    const foto = page.locator('img[src*="/api/uploads/"]').first();
    await expect(foto).toBeVisible();
    await expect
      .poll(() => foto.evaluate((el) => (el as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  });

  test("empty name shows validation error and does not navigate", async ({
    page,
  }) => {
    await page.goto("/recetario");
    await page
      .getByRole("button", { name: "Nueva receta", exact: true })
      .click();
    await expect(page).toHaveURL(/\/recetario\/nueva$/);

    await page
      .getByRole("button", { name: "Guardar receta", exact: true })
      .click();
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

  test("la cifra de coincidencias sigue a la búsqueda y cuadra con las tarjetas", async ({
    page,
  }) => {
    const name = uniqueName("Cifra E2E");
    // La semilla 0012 no trae etiquetas: la nuestra es única y buscable.
    const tag = uniqueName("etiqueta");
    await apiRequest(page.request, "POST", "/api/recipes", {
      name,
      description: "e2e",
      ingredients: [],
      steps: [],
      materials: [],
      tags: [tag],
    });

    // El total se mueve (otras pruebas crean recetas), así que sale de la API.
    const all = await apiRequest<{ name: string }[]>(
      page.request,
      "GET",
      "/api/recipes",
    );
    const total = all.length;
    const totalText = total === 1 ? "1 receta" : `${total} recetas`;

    await page.goto("/recetario");
    const cards = page.locator('ul.stagger a[href^="/recetario/"]');
    const line = page.locator('header p[aria-live="polite"]');
    await expect(cards.first()).toBeVisible();
    await expect(line).toHaveText(totalText);
    expect(await cards.count()).toBe(total);

    const search = page.getByLabel("Buscar recetas");

    // Etiqueta: casa por etiqueta y la cifra cuadra con las tarjetas.
    await search.fill(tag);
    await expect(line).toHaveText(`1 de ${total}`);
    expect(await cards.count()).toBe(1);
    await expect(page.locator("a", { hasText: name })).toHaveCount(1);

    // Tildes: la consulta sin acento casa los nombres acentuados de la semilla.
    await search.fill("basico");
    const accented = await cards.count();
    expect(accented).toBeGreaterThanOrEqual(2);
    await expect(line).toHaveText(`${accented} de ${total}`);
    await expect(
      page.locator("a", { hasText: "Poke bowl básico" }),
    ).toHaveCount(1);

    // Sin búsqueda vuelve la forma corta con el total.
    await search.fill("");
    await expect(line).toHaveText(totalText);
    expect(await cards.count()).toBe(total);
  });

  test("el selector de receta anuncia la cifra y filtra con el mismo predicado", async ({
    page,
  }) => {
    const name = uniqueName("Picker Cifra E2E");
    const tag = uniqueName("etiqueta");
    await apiRequest(page.request, "POST", "/api/recipes", {
      name,
      description: "e2e",
      ingredients: [],
      steps: [],
      materials: [],
      tags: [tag],
    });
    const all = await apiRequest<{ name: string }[]>(
      page.request,
      "GET",
      "/api/recipes",
    );
    const total = all.length;

    await page.goto("/plan-recetas");
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    const dialog = page.getByRole("dialog");
    const line = dialog.locator('p[aria-live="polite"]');
    const rows = dialog.locator("ul li:has(> button)");
    await expect(dialog.getByText(name)).toBeVisible();
    await expect(line).toHaveText(
      total === 1 ? "1 receta" : `${total} recetas`,
    );
    expect(await rows.count()).toBe(total);

    const search = dialog.getByLabel("Buscar receta");
    await expect(search).toHaveAttribute(
      "placeholder",
      "Buscar por nombre o etiqueta…",
    );

    // Por etiqueta (antes el selector solo miraba el nombre).
    await search.fill(tag);
    await expect(line).toHaveText(`1 de ${total}`);
    expect(await rows.count()).toBe(1);

    // Por nombre, sin tilde, sobre la semilla.
    await search.fill("basico");
    const shown = await rows.count();
    expect(shown).toBeGreaterThanOrEqual(2);
    await expect(line).toHaveText(`${shown} de ${total}`);
    await expect(dialog.getByText("Caldo básico de verduras")).toBeVisible();
  });
});
