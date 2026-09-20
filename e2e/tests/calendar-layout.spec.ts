import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest } from "./helpers";

// El calendario semanal es el protagonista de /plan-fuerza y /plan-recetas: en
// escritorio la página ocupa la ventana entera (sin scroll de página, con un
// hueco reservado abajo) y en móvil los enlaces de la sección quedan como fila
// fina sobre el calendario. El proyecto `authed` ya inyecta la sesión; se repite
// por claridad.
test.use({ storageState: ".auth/state.json" });

const ROUTES = ["/plan-fuerza", "/plan-recetas"] as const;

/** Lunes de la semana que cae a `daysAhead` días de hoy, con su etiqueta ISO
 *  "YYYY-Www" (misma convención que la app). 105 días cae fuera de todas las
 *  semanas que usan los demás specs (días 14 + n·7, hasta 91): `date` es UNIQUE
 *  y dos tests no pueden compartir día. */
function farMonday(daysAhead = 105): { date: string; week: string } {
  const day = new Date();
  day.setUTCDate(day.getUTCDate() + daysAhead);
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  const date = day.toISOString().slice(0, 10);
  const thursday = new Date(`${date}T12:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const jan4 = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4, 12));
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
  const week =
    1 + Math.round((thursday.getTime() - jan4.getTime()) / (7 * 86_400_000));
  return {
    date,
    week: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
  };
}

/** Un reintento del mismo test reencuentra su sesión: la quita antes de crear. */
async function resetPlanned(request: APIRequestContext, date: string) {
  const sessions = await apiRequest<
    { id: number; date: string; status: string }[]
  >(request, "GET", "/api/plan-sessions");
  for (const s of sessions.filter(
    (s) => s.date === date && s.status === "planned",
  )) {
    await request.delete(`/api/plan-sessions/${s.id}`);
  }
}

test.describe("CALENDARIO — alto de ventana", () => {
  test("escritorio: llena la ventana sin scroll de página", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const route of ROUTES) {
      await page.goto(route);
      // El calendario cargó (su navegación de semana está a la vista).
      await expect(
        page.getByRole("button", { name: "Semana siguiente" }),
      ).toBeVisible();

      const overflow = await page.evaluate(() => {
        const el = document.scrollingElement ?? document.documentElement;
        return el.scrollHeight - window.innerHeight;
      });
      expect(overflow, `${route} no debe hacer scroll de página`).toBeLessThan(
        1,
      );

      // La fila fina es solo de móvil: en escritorio los mismos enlaces viven
      // en el menú lateral.
      await expect(
        page.getByRole("navigation", { name: /Deporte|Nutrición/ }),
      ).toHaveCount(0);
    }
  });

  test("escritorio: el menú lateral conserva los enlaces de la sección", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const sidebar = page.locator("aside");

    await page.goto("/plan-fuerza");
    await expect(
      sidebar.getByRole("link", { name: "Ejercicios" }),
    ).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Plantillas" }),
    ).toBeVisible();

    await page.goto("/plan-recetas");
    await expect(sidebar.getByRole("link", { name: "Recetas" })).toBeVisible();
  });

  test("escritorio: con un día cargado, el desborde queda dentro del calendario", async ({
    page,
  }) => {
    // Veinte filas en un día no caben en la ventana: el scroll tiene que
    // quedarse dentro del calendario, no en la página.
    const catalog = await apiRequest<{ id: number }[]>(
      page.request,
      "GET",
      "/api/exercises",
    );
    const { date, week } = farMonday();
    await resetPlanned(page.request, date);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date,
      name: "Día cargado E2E",
      items: catalog
        .slice(0, 20)
        .map((e) => ({ exerciseId: e.id, targetSets: 4, targetRepsMin: 8 })),
    });

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/plan-fuerza?week=${week}`);
    await expect(
      page.getByRole("list", { name: `Ejercicios del ${date}` }),
    ).toBeVisible();

    const geom = await page.evaluate(() => {
      const el = document.scrollingElement ?? document.documentElement;
      // Primer contenedor con scroll propio por encima de la lista del día.
      let node: Element | null = document.querySelector(
        'ol[aria-label^="Ejercicios del"]',
      );
      let scroller: Element | null = null;
      while (node && node !== document.body) {
        if (getComputedStyle(node).overflowY === "auto") {
          scroller = node;
          break;
        }
        node = node.parentElement;
      }
      return {
        pageOverflow: el.scrollHeight - window.innerHeight,
        insideOverflow: scroller
          ? scroller.scrollHeight - scroller.clientHeight
          : -1,
      };
    });
    expect(geom.pageOverflow, "la página no debe desbordar").toBeLessThan(1);
    expect(
      geom.insideOverflow,
      "el desborde se queda dentro del calendario",
    ).toBeGreaterThan(0);
  });

  test("móvil: fila fina con los enlaces de la sección", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    await page.goto("/plan-fuerza");
    const deporte = page.getByRole("navigation", { name: "Deporte" });
    await expect(
      deporte.getByRole("link", { name: "Ejercicios" }),
    ).toBeVisible();
    await expect(
      deporte.getByRole("link", { name: "Plantillas" }),
    ).toBeVisible();
    // Sin título de página sobre la fila.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);

    await page.goto("/plan-recetas");
    await expect(
      page
        .getByRole("navigation", { name: "Nutrición" })
        .getByRole("link", { name: "Recetas" }),
    ).toBeVisible();
  });
});
