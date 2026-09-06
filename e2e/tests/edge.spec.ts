import { expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

// EDGE (journey 4): week navigation in /plan-recetas, debounced autosave of
// Hoy notes (flushed when leaving the field/date), visible rendering of API
// 400/409 {error, field} envelopes, and deep-link redirect through
// /login?next=... back to the destination.
test.describe("EDGE — week nav, autosave, envelope errors, deep link", () => {
  test.use({ storageState: ".auth/state.json" });

  test("week navigation changes the shown week and reloads its plan", async ({
    page,
  }) => {
    await page.goto("/plan-recetas");

    const weekHeading = page.getByRole("heading", { level: 1 });
    const baseWeek = await weekHeading.textContent();
    expect(baseWeek).toMatch(/^\d{4}-W\d{2}$/);

    // Forward: heading shifts; going forward then back returns to the base week
    // (a real reload of the plan for the neighbouring ISO week).
    await page.getByRole("button", { name: "Semana siguiente" }).click();
    await expect(weekHeading).not.toHaveText(baseWeek!);
    await page.getByRole("button", { name: "Semana anterior" }).click();
    await expect(weekHeading).toHaveText(baseWeek!);
  });

  test("week nav renders a planned recipe from the other week (plan reloads per week)", async ({
    page,
  }) => {
    const name = uniqueName("Nav E2E");
    const food = uniqueName("NavFoodE2E");
    const created = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/recipes",
      {
        name,
        description: "e2e",
        ingredients: [{ food, quantity: 1, unit: null }],
        steps: [],
        materials: [],
        tags: [],
      },
    );
    expect(created.id).toBeGreaterThan(0);

    await page.goto("/plan-recetas");
    const baseWeek = await page
      .getByRole("heading", { level: 1 })
      .textContent();

    // Shift the base ISO week +1 client-side; same math as web/src/lib/iso-week.ts.
    const nextWeek = await page.evaluate((week) => {
      const WEEK_MS = 7 * 86_400_000;
      const jan4Of = (isoYear: number) => {
        const jan4 = new Date(Date.UTC(isoYear, 0, 4));
        return new Date(
          jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * WEEK_MS,
        );
      };
      const isoWeekOf = (date: Date) => {
        const thu = new Date(date.getTime());
        thu.setUTCDate(thu.getUTCDate() - ((thu.getUTCDay() + 6) % 7) + 3);
        const year = thu.getUTCFullYear();
        const week =
          Math.floor((thu.getTime() - jan4Of(year).getTime()) / WEEK_MS) + 1;
        return `${year}-W${String(week).padStart(2, "0")}`;
      };
      const [year, weekNum] = (week as string).split("-W").map(Number);
      return isoWeekOf(new Date(jan4Of(year).getTime() + weekNum * WEEK_MS));
    }, baseWeek);

    const put = await page.request.put(`/api/meal-plan/${nextWeek}`, {
      data: {
        slots: [{ day: 0, meal: "desayuno", recipeId: created.id }],
      },
    });
    expect(put.ok()).toBeTruthy();

    await page.goto(`/plan-recetas?week=${nextWeek}`);
    await expect(page.locator("a", { hasText: name })).toHaveCount(1);

    // Navigating back reloads the base week's plan: the other week's slot is gone.
    await page.getByRole("button", { name: "Semana anterior" }).click();
    await expect(page.locator("a", { hasText: name })).toHaveCount(0);
  });

  test("note autosaves after debounce and shows Guardado", async ({ page }) => {
    const text = uniqueName("Nota autosave");
    await page.goto("/");

    const notes = page.getByPlaceholder("Escribe algo sobre hoy");
    await notes.fill(text);
    // Debounce is 800ms; the save can complete before we observe Guardando…,
    // so assert the final state (Guardado) — the debounce window itself is
    // exercised by the flush-on-unmount test below.
    await expect(page.getByText("Guardado")).toBeVisible({ timeout: 5_000 });

    // Persisted server-side
    await page.reload();
    await expect(notes).toHaveValue(text);
  });

  test("note typed and flushed on immediate date switch saves against the old date", async ({
    page,
  }) => {
    const text = uniqueName("Nota flush");
    await page.goto("/");

    // Cualquiera de las dos rutas es correcta: el debounce (800 ms) dispara si
    // el runner es lento, o el desmontaje fuerza el flush si se sale antes.
    // Esperamos el PUT a la fecha de HOY en vez de apostar a ganar la carrera.
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const noteSaved = page.waitForRequest(
      (req) =>
        req.method() === "PUT" && req.url().endsWith(`/api/notes/${iso}`),
    );

    const notes = page.getByPlaceholder("Escribe algo sobre hoy");
    await notes.fill(text);
    await page.getByRole("button", { name: "Día siguiente" }).click();
    await page.getByRole("button", { name: "Día anterior" }).click();

    await noteSaved;
    const saved = await page.evaluate(async (date) => {
      const res = await fetch(`/api/notes/${date}`);
      return res.json();
    }, iso);
    expect((saved as { text?: string }).text).toBe(text);
  });

  test("duplicate-slot PUT 400 does not corrupt the week; picker add still lands", async ({
    page,
  }) => {
    const name = uniqueName("Dup Slot E2E");
    const created = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/recipes",
      {
        name,
        description: "e2e",
        ingredients: [],
        steps: [],
        materials: [],
        tags: [],
      },
    );

    await page.goto("/plan-recetas");
    const week = await page.getByRole("heading", { level: 1 }).textContent();

    // API-level 400: two slots with the same day|meal → {error, field:"slots"}.
    const res = await page.request.put(`/api/meal-plan/${week}`, {
      data: {
        slots: [
          { day: 0, meal: "desayuno", recipeId: created.id },
          { day: 0, meal: "desayuno", recipeId: created.id },
        ],
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).field).toBe("slots");

    // The rejected PUT must not corrupt the week: a valid add still lands.
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    await page.getByLabel("Buscar receta").fill(name);
    await page.getByRole("button", { name }).click();
    await expect(page.locator("a", { hasText: name })).toHaveCount(1);
  });

  test("API 400 envelope renders as visible UI error in /plan-recetas", async ({
    page,
  }) => {
    // Loading an invalid week returns the 400 {error, field:"week"} envelope;
    // the page MUST render a visible error message, not a blank grid.
    await page.goto("/plan-recetas?week=9999-W99");
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(/No se pudo|week/);
  });

  test("deep link /plan-recetas without session → /login?next=... → lands back on /plan-recetas", async ({
    page,
  }) => {
    // Unauthenticated project: clear storageState for this test only.
    await page.context().clearCookies();

    await page.goto("/plan-recetas");
    await expect(page).toHaveURL(/\/login\?next=%2Fplan-recetas$/);

    await page.getByLabel("Contraseña").fill("hola");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL(/\/plan-recetas$/);
    await expect(
      page.getByRole("heading", { name: /^\d{4}-W\d{2}$/ }),
    ).toBeVisible();
  });
});
