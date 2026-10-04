// Catálogo del banco de ejercicios: nombres españoles canónicos + alias de
// búsqueda (0022) y los ejercicios de «Barra Libre» que faltaban (0023). Todo
// esto viaja de la migración a la API y a la pantalla, así que se prueba en el
// navegador contra el catálogo sembrado de verdad.
import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest, apiUrl, seededExercise } from "./helpers";

type Ex = {
  id: number;
  name: string;
  aliases: string[];
  tags: string[];
  regions: { region: string; role: string }[];
};

// --- Fechas (mismas convenciones que la app) --------------------------------

function isoWeekOf(date: string): string {
  const t = new Date(`${date}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // jueves
  const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const week =
    1 + Math.round((t.getTime() - jan4.getTime()) / (7 * 86_400_000));
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function mondayOf(week: string): string {
  const [year, w] = week.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(
    jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
  );
  monday.setUTCDate(monday.getUTCDate() + (w - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

/** Weeks lejos de las que usan otros specs (0..98). */
const WEEK = isoWeekOf(
  new Date(Date.now() + 140 * 86_400_000).toISOString().slice(0, 10),
);

async function resetPlanned(request: APIRequestContext, date: string) {
  const sessions = await apiRequest<
    { id: number; date: string; status: string }[]
  >(request, "GET", "/api/plan-sessions");
  for (const s of sessions.filter(
    (s) => s.date === date && s.status === "planned",
  )) {
    await request.delete(apiUrl(`/api/plan-sessions/${s.id}`));
  }
}

test.describe("CATÁLOGO — español canónico y alias", () => {
  test("el alias encuentra el ejercicio (renombrado o conservado)", async ({
    page,
    request,
  }) => {
    const list = await apiRequest<Ex[]>(request, "GET", "/api/exercises");
    const granjero = list.find((e) => e.name === "Paseo del granjero");
    expect(granjero, "Paseo del granjero en el catálogo").toBeTruthy();
    expect(granjero?.aliases).toContain("farmer carry");
    expect(list.some((e) => e.name === "Farmer carry")).toBe(false);

    await page.goto("/ejercicios");
    const search = page.getByPlaceholder("Buscar por nombre, alias o tag");

    // El nombre español y el alias inglés llegan al mismo ejercicio.
    await search.fill("paseo del granjero");
    await expect(
      page.getByRole("link", { name: /^Paseo del granjero/ }),
    ).toBeVisible();
    await search.fill("farmer carry");
    await expect(
      page.getByRole("link", { name: /^Paseo del granjero/ }),
    ).toBeVisible();

    // Un ejercicio ya en español que se conoce por su nombre inglés.
    await search.fill("face pull");
    await expect(
      page.getByRole("link", { name: /^Tirón a la cara/ }),
    ).toBeVisible();

    // «Hip thrust» conserva su nombre (se conoce por él) y su alias es la
    // traducción: la búsqueda en español también lo encuentra.
    expect(list.some((e) => e.name === "Hip thrust")).toBe(true);
    await search.fill("empuje de cadera");
    await expect(page.getByRole("link", { name: /^Hip thrust/ })).toBeVisible();
  });
});

test.describe("CATÁLOGO — ejercicios de Barra Libre", () => {
  test("el ejercicio nuevo aparece, filtra por músculo y tiene su ficha", async ({
    page,
    request,
  }) => {
    const list = await apiRequest<Ex[]>(request, "GET", "/api/exercises");
    const cargada = list.find((e) => e.name === "Cargada");
    expect(cargada, "Cargada en el catálogo").toBeTruthy();
    expect(cargada?.tags).toContain("pierna");
    expect(cargada?.aliases).toContain("power clean");
    expect(cargada?.regions.some((r) => r.role === "primary")).toBe(true);

    await page.goto("/ejercicios");
    // Se encuentra por su alias inglés, no solo por el nombre.
    await page
      .getByPlaceholder("Buscar por nombre, alias o tag")
      .fill("power clean");
    const card = page.getByRole("link", { name: /^Cargada(?! y)/ });
    await expect(card).toBeVisible();

    // La ficha lista sus músculos por grado (el mismo nivel que filtra el mapa).
    await card.click();
    await expect(page.getByRole("heading", { name: "Cargada" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Principal" })).toContainText(
      "Cuádriceps",
    );
  });

  test("un ejercicio nuevo se puede añadir a un día del plan", async ({
    page,
    request,
  }) => {
    const cargada = await seededExercise(request, "Cargada");
    expect(cargada.id).toBeGreaterThan(0);

    const date = mondayOf(WEEK);
    await resetPlanned(request, date);
    await page.goto(`/plan-fuerza?week=${WEEK}`);
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    const dialog = page.getByRole("dialog", {
      name: new RegExp(`Nueva sesión · ${date}`),
    });
    await dialog.getByLabel("Buscar plantilla o ejercicio").fill("Cargada");
    await dialog.getByRole("button", { name: "Cargada", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Quitar Cargada" }),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Guardar", exact: true }).click();

    const dayList = page.getByRole("list", { name: `Ejercicios del ${date}` });
    await expect(dayList.getByText("Cargada")).toBeVisible();
  });
});
