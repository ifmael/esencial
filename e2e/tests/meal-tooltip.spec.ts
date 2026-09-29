import { expect, test } from "@playwright/test";
import { apiRequest, apiUrl, uniqueName } from "./helpers";

// El nombre de una comida se recorta en la columna de /plan-recetas: al dejar el
// cursor encima aparece un tooltip con el nombre completo, y se va al salir.
test.use({ storageState: ".auth/state.json" });

/** Semana ISO a 133 días de hoy: ningún otro spec planifica comidas tan lejos
 *  (un PUT de la semana reemplaza todos sus huecos). */
function farWeek(daysAhead = 133): string {
  const thu = new Date();
  thu.setUTCDate(thu.getUTCDate() + daysAhead);
  thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
  const year = thu.getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((thu.getTime() - jan1) / 86_400_000) + 1;
  const week = Math.ceil(dayOfYear / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

test("TOOLTIP — la comida muestra su nombre completo al pasar el cursor", async ({
  page,
}) => {
  const name = uniqueName(
    "Lentejas estofadas con chorizo y verduras de temporada",
  );
  const recipe = await apiRequest<{ id: number }>(
    page.request,
    "POST",
    "/api/recipes",
    {
      name,
      description: "e2e",
      ingredients: [{ food: uniqueName("Lenteja"), quantity: 1, unit: null }],
      steps: [],
      materials: [],
      tags: [],
    },
  );
  const week = farWeek();
  const put = await page.request.put(apiUrl(`/api/meal-plan/${week}`), {
    data: { slots: [{ day: 2, meal: "almuerzo", recipeId: recipe.id }] },
  });
  expect(put.ok()).toBeTruthy();

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/plan-recetas?week=${week}`);
  const link = page.getByRole("link", { name });
  await expect(link).toBeVisible();

  const tooltip = page.getByRole("tooltip");
  await link.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText(name);
  // Va por encima de la rejilla, no recortado por la columna del día.
  const box = await tooltip.boundingBox();
  expect(box?.width).toBeGreaterThan(200);

  await page.mouse.move(0, 0);
  await expect(tooltip).toHaveCount(0);
});
