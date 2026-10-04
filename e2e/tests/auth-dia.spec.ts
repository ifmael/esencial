// DÍA — estados vacíos de la pantalla de inicio. La identidad la pone la
// config (X-Dev-Email): ya no hay login propio que probar.
import { expect, test } from "@playwright/test";

test.describe("DÍA empty states", () => {
  test("/ renders RECETA, FUERZA and NOTAS cards with empty-state content", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "RECETA" })).toBeVisible();
    await expect(
      page.getByText("Aún no has planificado comidas para este día"),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "FUERZA" })).toBeVisible();
    await expect(page.getByText("Sin sesión asignada")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "NOTAS DEL DÍA" }),
    ).toBeVisible();
    await expect(page.getByLabel("Escribe algo sobre hoy")).toBeVisible();
  });

  test("móvil: cabecera compacta — sin título visible, sin progreso y fecha protagonista", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const header = page.locator("header").first();
    const height = async (l: typeof header) => (await l.boundingBox())?.height;
    const width = async (l: typeof header) => (await l.boundingBox())?.width;

    // Esperar a /api/day: el progreso solo se pinta con los datos cargados.
    await expect(page.getByRole("heading", { name: "RECETA" })).toBeVisible();
    // Sigue en la página para el lector (sr-only, 1×1 px), pero no se ve.
    const title = page.getByRole("heading", { level: 1 });
    await expect.poll(() => height(title)).toBeLessThanOrEqual(1);
    // Móvil sin progreso: ni barra ni anillo.
    await expect(header.getByRole("progressbar")).toBeHidden();
    await expect(
      header.getByRole("link", { name: "Plan recetas" }),
    ).toBeHidden();
    await expect(
      header.getByRole("link", { name: "Plan fuerza" }),
    ).toBeHidden();
    // Sin título, «Hoy» pulsado es lo que dice que el día elegido es hoy.
    await expect(
      header.getByRole("button", { name: "Ir a hoy" }),
    ).toHaveAttribute("aria-pressed", "true");
    // La fecha se lleva el hueco libre de la fila (‹, Hoy y › ocupan ~172 de
    // 318 px, así que su techo es ~46 %); la cabecera queda en la fila sola.
    const row = header.getByRole("group", { name: "Cambiar de día" });
    const date = header.getByLabel("Ir a una fecha");
    await expect
      .poll(async () => (await width(date))! / (await width(row))!)
      .toBeGreaterThan(0.4);
    // El saludo añade una línea (el día es hoy) encima de la fila de controles:
    // la cabecera sigue siendo compacta, pero ya no mide una sola fila. Medido
    // a 390 px sin nombre (el admin de e2e no tiene): 148 px.
    await expect(
      header.getByText(/estos son los planes que tienes para HOY/),
    ).toBeVisible();
    await expect.poll(() => height(header)).toBeLessThan(200);

    // Escritorio conserva título, anillo de 96 px y enlaces.
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect.poll(() => height(title)).toBeGreaterThan(40);
    await expect(header.getByText("Pasos del día")).toBeVisible();
    await expect(header.getByRole("progressbar")).toHaveCount(1);
    await expect.poll(() => height(header.getByRole("progressbar"))).toBe(96);
    await expect(
      header.getByRole("link", { name: "Plan recetas" }),
    ).toBeVisible();
  });
});
