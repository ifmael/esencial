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

      // El submenú de la sección vive sobre el calendario, también en escritorio
      // (la barra lateral va en raíl y no lo despliega).
      await expect(
        page.getByRole("navigation", { name: /Deporte|Nutrición/ }),
      ).toBeVisible();
    }
  });

  test("escritorio: cada columna de día mide ≥150px a 1280×800", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    for (const route of ROUTES) {
      await page.goto(route);
      // La rejilla está montada (los siete encabezados de día a la vista).
      await expect(page.locator("main section h3")).toHaveCount(7);

      const geom = await page.evaluate(() => {
        const panel = document.querySelector("main section");
        const grid = panel
          ? [...panel.querySelectorAll("div")]
              .reverse()
              .find((d) => d.children.length === 7)
          : undefined;
        const cols = grid
          ? [...grid.children].map((c) => c.getBoundingClientRect().width)
          : [];
        const el = document.scrollingElement ?? document.documentElement;
        return {
          count: cols.length,
          width: Math.min(...cols),
          pageOverflowX: el.scrollWidth - window.innerWidth,
          pageOverflowY: el.scrollHeight - window.innerHeight,
        };
      });
      expect(geom.count, `${route}: siete columnas de día`).toBe(7);
      expect(
        geom.width,
        `${route}: ancho de la columna más estrecha`,
      ).toBeGreaterThanOrEqual(150);
      expect(
        geom.pageOverflowX,
        `${route}: sin scroll horizontal`,
      ).toBeLessThan(1);
      expect(geom.pageOverflowY, `${route}: sin scroll de página`).toBeLessThan(
        1,
      );
    }
  });

  test("escritorio: la semana entera vive en un único contenedor en ambas rutas", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(
        page.getByRole("button", { name: "Semana siguiente" }),
      ).toBeVisible();
      // Fuerza y comidas convergen en el contenedor grande: un solo panel con
      // las siete columnas de día dentro.
      const grid = page.locator("main .card");
      await expect(grid).toHaveCount(1);
      await expect(grid.locator("h3")).toHaveCount(7);
    }
  });

  test("escritorio: el raíl conserva las secciones y el submenú vive sobre el calendario", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const rail = page.locator("aside");

    for (const route of ["/plan-fuerza", "/plan-recetas"] as const) {
      await page.goto(route);
      // Raíl: ancho de icono, con los destinos accesibles por su nombre.
      const width = await rail.evaluate(
        (el) => el.getBoundingClientRect().width,
      );
      expect(width, `${route}: ancho del raíl`).toBeLessThanOrEqual(80);
      for (const name of ["Hoy", "Deporte", "Nutrición"]) {
        await expect(
          rail.getByRole("link", { name }),
          `${route}: ${name}`,
        ).toBeVisible();
      }
      // Raíl de 80 px: el catálogo y «Cerrar sesión» ceden su sitio (siguen en
      // la búsqueda ⌘K y al desplegar el menú); búsqueda y tema se quedan.
      await expect(rail.getByRole("button", { name: /Buscar/ })).toBeVisible();
      // Sin desplegables de sección: el submenú está sobre el calendario. (El
      // menú FAB de crear sí es un desplegable.)
      await expect(rail.locator("button[aria-controls^='nav-']")).toHaveCount(
        0,
      );
    }

    const chips = page.getByRole("navigation", { name: "Deporte" });
    await page.goto("/plan-fuerza");
    await expect(chips.getByRole("link", { name: "Ejercicios" })).toBeVisible();
    await expect(chips.getByRole("link", { name: "Plantillas" })).toBeVisible();

    await page.goto("/plan-recetas");
    await expect(
      page
        .getByRole("navigation", { name: "Nutrición" })
        .getByRole("link", { name: "Recetas" }),
    ).toBeVisible();
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
    // La misma cabecera de rejilla que Deporte: sin título de página.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
  });

  test("escritorio: el calendario se estira con un tope amplio de 1760px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(
        page.getByRole("button", { name: "Semana siguiente" }),
      ).toBeVisible();
      // La rejilla está montada: sin esto se mediría el «Cargando…».
      await expect(page.locator("main section h3")).toHaveCount(7);

      const geom = await page.evaluate(() => {
        const main = document.querySelector("main") as HTMLElement;
        const panel = document.querySelector("main section");
        const grid = panel
          ? [...panel.querySelectorAll("div")]
              .reverse()
              .find((d) => d.children.length === 7)
          : undefined;
        const cols = grid
          ? [...grid.children].map((c) => c.getBoundingClientRect().width)
          : [];
        const el = document.scrollingElement ?? document.documentElement;
        return {
          maxWidth: getComputedStyle(main).maxWidth,
          width: main.getBoundingClientRect().width,
          column: cols.length ? Math.min(...cols) : 0,
          overflowX: el.scrollWidth - window.innerWidth,
        };
      });
      expect(geom.maxWidth, `${route}: tope del contenedor`).toBe("1760px");
      expect(geom.width, `${route}: ancho usado`).toBe(1760);
      expect(geom.column, `${route}: columna más estrecha`).toBeGreaterThan(
        200,
      );
      expect(geom.overflowX, `${route}: sin scroll horizontal`).toBeLessThan(1);

      // Ultrapanorámica: el tope muerde y el calendario no se estira sin fin.
      await page.setViewportSize({ width: 2560, height: 1440 });
      const wide = await page.evaluate(() => {
        const main = document.querySelector("main") as HTMLElement;
        return main.getBoundingClientRect().width;
      });
      expect(wide, `${route}: tope en ultrapanorámica`).toBe(1760);
      await page.setViewportSize({ width: 1920, height: 1080 });
    }
  });
});
