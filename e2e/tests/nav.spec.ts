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

    // En las rutas de calendario el submenú de la sección vive también sobre la
    // rejilla (el raíl plegado no lo despliega; ver calendar-layout.spec.ts).
    await page.goto("/plan-fuerza");
    await expect(
      page
        .getByRole("navigation", { name: "Deporte" })
        .getByRole("link", { name: "Ejercicios" }),
    ).toBeVisible();
    // Y la página ya no lista plantillas.
    await expect(
      page.getByRole("button", { name: "+ Nueva plantilla" }),
    ).toHaveCount(0);
  });

  test("la sección activa pinta texto e icono con on-accent-container", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ejercicios");
    const aside = page.locator("aside");
    const link = aside.getByRole("link", { name: "Deporte" });
    const chevron = aside.getByRole("button", { name: "Contraer Deporte" });
    await expect(chevron).toBeVisible();
    // Lo calculado, no las clases: el bug era un choque de utilidades que
    // resolvía el orden del CSS generado, no el del className.
    const style = (el: Element) => {
      const s = getComputedStyle(el);
      return { color: s.color, weight: s.fontWeight };
    };
    const onContainer = (await chevron.evaluate(style)).color;
    expect(await link.evaluate(style)).toEqual({
      color: onContainer,
      weight: "800",
    });
    expect(
      await link.locator("svg").evaluate((el) => getComputedStyle(el).color),
    ).toBe(onContainer);
  });

  test("plegar/desplegar el menú lateral y recordar la elección", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const aside = page.locator("aside");
    const width = () =>
      aside.evaluate((el) => el.getBoundingClientRect().width);

    await expect(aside.getByRole("link", { name: "Hoy" })).toBeVisible();
    await expect.poll(width).toBeGreaterThan(200); // menú completo

    await aside.getByRole("button", { name: "Ocultar menú" }).click();
    // Raíl M3E colapsado: 96 px fuera del calendario (80 en él, ver
    // calendar-layout.spec.ts).
    await expect.poll(width).toBeLessThanOrEqual(96);
    await expect(aside.getByRole("link", { name: "Hoy" })).toBeVisible();

    // Recargar conserva la preferencia (localStorage), no solo el estado vivo.
    await page.reload();
    await expect.poll(width).toBeLessThanOrEqual(96);
    await expect(aside.getByRole("link", { name: "Hoy" })).toBeVisible();

    await aside.getByRole("button", { name: "Mostrar menú" }).click();
    await expect.poll(width).toBeGreaterThan(200);

    // La elección manda también en las rutas de calendario.
    await page.goto("/plan-fuerza");
    await expect(
      page.getByRole("button", { name: "Semana siguiente" }),
    ).toBeVisible();
    await expect.poll(width).toBeGreaterThan(200);
  });

  test("pulsar Deporte o Nutrición con el menú desplegado no lo pliega", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const aside = page.locator("aside");
    const width = () =>
      aside.evaluate((el) => el.getBoundingClientRect().width);
    await expect.poll(width).toBeGreaterThan(200);

    for (const [name, url] of [
      ["Deporte", /\/plan-fuerza$/],
      ["Nutrición", /\/plan-recetas$/],
    ] as const) {
      await aside.getByRole("link", { name }).click();
      await expect(page).toHaveURL(url);
      await expect(
        aside.getByRole("button", { name: "Ocultar menú" }),
      ).toBeVisible();
      await expect.poll(width).toBeGreaterThan(200);
    }
  });

  test("con una página larga, el menú lateral se queda a la vista", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/ejercicios");
    const aside = page.locator("aside");
    const search = aside.getByRole("button", { name: /Buscar/ });
    await expect(search).toBeVisible();
    // La lista del catálogo es más alta que la ventana: sin eso no hay bug.
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollHeight - window.innerHeight,
        ),
      )
      .toBeGreaterThan(200);

    // El raíl mide la ventana, no la página: la búsqueda queda dentro de ella,
    // arriba y después de bajar hasta el final.
    expect(await aside.evaluate((el) => el.clientHeight)).toBe(800);
    await expect(search).toBeInViewport({ ratio: 1 });
    await page.evaluate(() =>
      scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(search).toBeInViewport({ ratio: 1 });
    await expect(aside.getByRole("link", { name: "Hoy" })).toBeInViewport();
  });

  test("el menú de crear no se recorta en el raíl compacto", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() =>
      localStorage.setItem("esencial.sidebar", "collapsed"),
    );
    await page.goto("/plan-fuerza");
    const aside = page.locator("aside");
    await expect.poll(() => aside.evaluate((el) => el.clientWidth)).toBe(80);
    await aside.getByRole("button", { name: "Crear" }).click();
    const items = page.getByRole("menuitem");
    await expect(items).toHaveCount(3);
    // Las píldoras son más anchas que el raíl: su borde derecho tiene que
    // quedar encima del calendario, no recortado por el `overflow` del raíl.
    for (const item of await items.all()) {
      await expect
        .poll(() =>
          item.evaluate((el) => {
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(
              r.right - 4,
              r.top + r.height / 2,
            );
            return r.right > 80 && el.contains(hit);
          }),
        )
        .toBe(true);
    }
  });
});
