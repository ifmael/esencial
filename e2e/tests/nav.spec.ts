import { expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

// Menú lateral: 3 secciones (Hoy, Deporte, Nutrición), submenús colapsables y
// navegación.
test.describe("MENÚ — secciones colapsables", () => {
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

  test("el subitem activo toma el contenedor suave de su sección", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const aside = page.locator("aside");
    // Lo calculado contra el token de marca: Nutrición no hereda el menta de
    // secondary (el bug), Deporte lo conserva.
    const bgOf = (name: string) =>
      aside
        .getByRole("link", { name, exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    const token = (name: string) =>
      page.evaluate((n) => {
        const probe = document.createElement("div");
        probe.style.background = `var(${n})`;
        document.body.append(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
      }, name);

    await page.goto("/recetario");
    expect(await bgOf("Recetas")).toBe(await token("--color-tertiary-soft"));
    await page.goto("/ejercicios");
    expect(await bgOf("Ejercicios")).toBe(
      await token("--color-secondary-container"),
    );

    // Lo tonal de la pantalla también: el calendario de comidas es naranja.
    await page.goto("/plan-recetas");
    const soft = await token("--color-tertiary-soft");
    for (const name of ["Lista de la compra", "Semana anterior"])
      expect(
        await page
          .getByRole("button", { name })
          .evaluate((el) => getComputedStyle(el).backgroundColor),
        name,
      ).toBe(soft);

    // Y en el editor de recetas: los tonales y el chip elegido.
    await page.goto("/recetario/nueva");
    const bg = (name: string) =>
      page
        .getByRole("button", { name, exact: true })
        .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(await bg("Elegir foto")).toBe(soft);
    const chip = page.getByRole("button", { name: "Desayuno", exact: true });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    // El fondo entra con transición (motion-effects): se espera al final.
    await expect
      .poll(() => chip.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(soft);

    // Y en el editor de una receta existente: el chip elegido toma el acento.
    const material = uniqueName("Sartén");
    const tag = uniqueName("batch");
    const { id } = await apiRequest<{ id: number }>(
      page.request,
      "POST",
      "/api/recipes",
      {
        name: uniqueName("Color E2E"),
        description: "e2e",
        ingredients: [{ food: "Sal", quantity: 1, unit: null }],
        steps: [],
        materials: [material],
        tags: [tag],
      },
    );
    await page.goto(`/recetario/${id}`);
    // En la ficha, la lista de materiales.
    await expect(
      page.locator("main li", { hasText: material }).first(),
    ).toHaveCSS("background-color", soft);
    // El lápiz lleva a la página de edición (ya no hay modal).
    await page.getByRole("link", { name: "Editar receta" }).click();
    await expect(page).toHaveURL(new RegExp(`/recetario/${id}/editar$`));
    await expect(
      page.getByRole("button", { name: `Quitar material ${material}` }),
    ).toBeVisible();
    const chosen = page.getByRole("button", { name: tag, exact: true });
    await expect(chosen).toHaveAttribute("aria-pressed", "true");
    // El color entra con transición (motion-effects): se espera al final.
    await expect
      .poll(() => chosen.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe(soft);
  });

  test("la pieza elegida de un grupo conectado toma el acento", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    // Lo calculado contra `--accent` de la propia pieza: el bug era que las
    // utilidades de reposo (capa `utilities`) ganaban a la regla de `pressed`.
    // El reposo tampoco puede pisar la piel de un botón dentro del grupo.
    const paint = (el: Element) => {
      const probe = document.createElement("div");
      probe.style.background = "var(--accent)";
      probe.style.color = "var(--on-accent)";
      el.parentElement?.append(probe);
      const want = getComputedStyle(probe);
      const got = getComputedStyle(el);
      const out = {
        bg: got.backgroundColor === want.backgroundColor,
        fg: got.color === want.color,
      };
      probe.remove();
      return out;
    };
    const accented = { bg: true, fg: true };
    const connected = (group: string, name: string) =>
      page
        .getByRole("group", { name: group })
        .getByRole("button", { name, exact: true });

    // El color entra con transición (motion-effects): se espera al final.
    await page.goto("/ejercicios");
    await page.getByRole("button", { name: "Nuevo ejercicio" }).click();
    const bici = connected("Tipo", "Bici");
    await bici.click();
    await expect(bici).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => bici.evaluate(paint)).toEqual(accented);
    // «Fuerza» sale del acento con transición: se espera a que termine.
    await expect
      .poll(() => connected("Tipo", "Fuerza").evaluate(paint))
      .toEqual({ bg: false, fg: false });

    await page.goto("/plantillas/nueva");
    const frontal = connected("Vista", "Frontal");
    await expect(frontal).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => frontal.evaluate(paint)).toEqual(accented);

    // Y el reposo tampoco pisa la piel de un botón propio dentro del grupo: el
    // SplitButton del catálogo (Guardar + su menú) conserva `--accent`.
    await page.goto("/ui");
    const guardar = page
      .locator(".connected")
      .getByRole("button", { name: "Guardar", exact: true });
    expect(await guardar.evaluate(paint)).toEqual(accented);
  });

  test("el foco de los campos toma el color de su sección", async ({
    page,
  }) => {
    // Contra el token de marca (en la raíz, fuera de toda sección), no contra
    // `--accent`: si Nutrición dejara de reescribirlo, el test lo vería.
    const brand = (name: string) =>
      page.evaluate((n) => {
        const probe = document.createElement("div");
        probe.style.color = `var(${n})`;
        document.documentElement.append(probe);
        const c = getComputedStyle(probe).color;
        probe.remove();
        return c;
      }, name);
    await page.goto("/recetario/nueva");
    const tertiary = await brand("--color-tertiary");
    expect(tertiary).not.toBe(await brand("--color-primary"));
    const nombre = page.getByLabel("Nombre");
    await nombre.focus();
    await expect(nombre).toHaveCSS("border-top-color", tertiary);
    await expect(
      page.locator(".field", { has: nombre }).locator(".field-label"),
    ).toHaveCSS("color", tertiary);
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
    // Raíl M3E colapsado: 96 px en todas las rutas.
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

  test("el menú de crear no se recorta en el raíl plegado", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() =>
      localStorage.setItem("esencial.sidebar", "collapsed"),
    );
    await page.goto("/plan-fuerza");
    const aside = page.locator("aside");
    await expect.poll(() => aside.evaluate((el) => el.clientWidth)).toBe(96);
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
