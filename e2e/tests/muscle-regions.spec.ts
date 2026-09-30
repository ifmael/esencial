import { expect, type Locator, type Page, test } from "@playwright/test";
import { MUSCLE_REGION_GROUPS } from "../../api/src/muscle-regions";
import { apiRequest } from "./helpers";

/** Pulsa un músculo del mapa por su forma pintada. Dos motivos: Playwright
 *  apunta al centro de la caja, que en músculos con dos alas (pectoral, dorsal)
 *  cae en el hueco entre ellas; y el clic verificado falla cuando el punto está
 *  a un píxel del borde (lo intercepta el músculo vecino). Se busca el punto más
 *  interior de la forma y se pulsa ahí con el ratón, sin más verificación. */
async function clickMuscle(page: Page, muscle: Locator) {
  await muscle.scrollIntoViewIfNeeded();
  const point = await muscle.evaluate((el) => {
    const box = el.getBoundingClientRect();
    const inside = (dx: number, dy: number) => {
      const hit = document.elementFromPoint(box.x + dx, box.y + dy);
      return hit !== null && el.contains(hit);
    };
    let best: { score: number; x: number; y: number } | null = null;
    for (let dy = 1; dy < box.height - 1; dy += 2) {
      for (let dx = 1; dx < box.width - 1; dx += 2) {
        if (!inside(dx, dy)) continue;
        const score = [
          inside(dx + 2, dy),
          inside(dx - 2, dy),
          inside(dx, dy + 2),
          inside(dx, dy - 2),
        ].filter(Boolean).length;
        if (score === 4) return { x: box.x + dx, y: box.y + dy };
        if (!best || score > best.score) best = { score, x: dx, y: dy };
      }
    }
    if (!best)
      throw new Error(`Sin punto interior en ${el.getAttribute("aria-label")}`);
    return { x: box.x + best.x, y: box.y + best.y };
  });
  await page.mouse.click(point.x, point.y);
}

/** Busca en el lienzo 3D un punto donde el ratón nombra `label` (el visor
 *  pone el músculo de debajo en el `title`) y lo devuelve. Recorre una
 *  rejilla sobre el lienzo: la cámara puede cambiar sin tocar el test. */
async function findOnModel(page: Page, model: Locator, label: string) {
  const box = await model.boundingBox();
  if (!box) throw new Error("El modelo 3D no tiene caja");
  for (let fy = 0.05; fy < 1; fy += 0.025)
    for (let fx = 0.2; fx < 0.8; fx += 0.025) {
      const x = box.x + box.width * fx,
        y = box.y + box.height * fy;
      await page.mouse.move(x, y);
      if ((await model.getAttribute("title")) === label) return { x, y };
    }
  throw new Error(`«${label}» no aparece en el modelo 3D`);
}

/** Sub-regiones musculares: el modelo filtra por el músculo concreto y las
 *  fichas de grupo devuelven todas las sub-regiones de ese grupo. */
test.describe("SUB-REGIONES — el mapa filtra fino", () => {
  test.use({ storageState: ".auth/state.json" });

  test("el modelo 3D filtra por el músculo que se pulsa, también los fabricados", async ({
    page,
  }) => {
    await page.goto("/plantillas/nueva");
    const picker = page.getByRole("region", { name: "Añadir ejercicio" });
    const model = picker.getByRole("img", { name: /^Mapa muscular 3D/ });
    await expect(model.locator("canvas")).toBeVisible();
    await model.scrollIntoViewIfNeeded();

    // Frontal: pecho superior es una sub-región del pecho, no el grupo entero.
    const chest = await findOnModel(page, model, "Pecho superior (clavicular)");
    await page.mouse.click(chest.x, chest.y);
    await expect(
      picker.getByText("Músculo: Pecho superior (clavicular)"),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", {
        name: "Press banca inclinado",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", {
        name: "Press banca declinado",
        exact: true,
      }),
    ).toHaveCount(0);

    // El recto abdominal no existe en el atlas: sale de la aponeurosis del
    // oblicuo. Pulsarlo filtra como cualquier otro músculo.
    const abs = await findOnModel(page, model, "Recto abdominal superior");
    await page.mouse.click(abs.x, abs.y);
    await expect(
      picker.getByRole("button", { name: "Crunch abdominal", exact: true }),
    ).toBeVisible();

    // Trasera: el dorsal también es fabricado (lámina calcada de la piel).
    await picker.getByRole("button", { name: "Trasera", exact: true }).click();
    const lats = await findOnModel(page, model, "Dorsal ancho medio");
    await page.mouse.click(lats.x, lats.y);
    await expect(picker.getByText("Músculo: Dorsal ancho medio")).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Remo con barra", exact: true }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Curl con barra", exact: true }),
    ).toHaveCount(0);

    // Arrastrar gira el modelo y no filtra.
    await page.mouse.move(lats.x, lats.y);
    await page.mouse.down();
    await page.mouse.move(lats.x + 80, lats.y, { steps: 5 });
    await page.mouse.up();
    await expect(picker.getByText("Músculo: Dorsal ancho medio")).toBeVisible();
  });

  test("con el modelo 3D, el teclado elige el músculo con las fichas de su grupo", async ({
    page,
  }) => {
    await page.goto("/plantillas/nueva");
    const picker = page.getByRole("region", { name: "Añadir ejercicio" });
    await expect(
      picker.getByRole("img", { name: /^Mapa muscular 3D/ }).locator("canvas"),
    ).toBeVisible();
    const grupos = picker.getByRole("group", { name: "Grupo:" });
    await grupos.getByRole("button", { name: "Pecho", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(picker.getByText("Grupo: Pecho")).toBeVisible();
    const musculos = picker.getByRole("group", { name: "Músculo:" });
    await musculos
      .getByRole("button", { name: "Pecho superior (clavicular)" })
      .focus();
    await page.keyboard.press("Enter");
    await expect(
      picker.getByText("Músculo: Pecho superior (clavicular)"),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", {
        name: "Press banca declinado",
        exact: true,
      }),
    ).toHaveCount(0);

    // Todos limpia los dos niveles.
    await grupos.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(picker.getByText("Grupo: Todos")).toBeVisible();
    await expect(picker.getByText("Músculo: ", { exact: false })).toHaveCount(
      0,
    );
  });

  test("sin WebGL vuelve el mapa SVG, que filtra igual", async ({ page }) => {
    await page.addInitScript(() => {
      Reflect.deleteProperty(window, "WebGL2RenderingContext");
    });
    await page.goto("/plantillas/nueva");
    const picker = page.getByRole("region", { name: "Añadir ejercicio" });
    await expect(picker.locator("canvas")).toHaveCount(0);

    const front = picker.locator('svg[aria-label="Vista frontal"]');
    await clickMuscle(
      page,
      front.getByRole("button", {
        name: "Pecho superior (clavicular)",
        exact: true,
      }),
    );
    await expect(
      picker.getByText("Músculo: Pecho superior (clavicular)"),
    ).toBeVisible();
    // El ratón no deja foco en el músculo: si lo dejara, el navegador pintaría
    // su anillo de foco (un recuadro redondeado) y taparía la señal de color.
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.tagName))
      .not.toBe("g");
    await expect(
      picker.getByRole("button", {
        name: "Press banca declinado",
        exact: true,
      }),
    ).toHaveCount(0);
  });

  test("la ficha pinta el ejercicio en 3D y nombra cada músculo con su grado", async ({
    page,
    request,
  }) => {
    const list = await apiRequest<{ id: number; name: string }[]>(
      request,
      "GET",
      "/api/exercises",
    );
    const press = list.find((e) => e.name === "Press banca");
    await page.goto(`/ejercicios/${press?.id}`);
    const model = page.getByRole("img", {
      name: "Músculos: Pecho inferior (esternal), principal; Pecho superior (clavicular), secundario; Hombro anterior (deltoides frontal), secundario; Tríceps (cabeza lateral), secundario; Tríceps (cabeza larga), secundario",
    });
    await expect(model.locator("canvas")).toBeVisible();
    await expect(page.getByRole("list", { name: "Leyenda" })).toHaveText(
      /Principal.*Secundario/,
    );
  });

  test("el catálogo sembrado cuelga de sub-regiones del vocabulario", async ({
    request,
  }) => {
    type Ex = {
      name: string;
      tags: string[];
      regions: { region: string; role: string }[];
    };
    const list = await apiRequest<Ex[]>(request, "GET", "/api/exercises");
    const byName = new Map(list.map((e) => [e.name, e]));

    // Los 91 sembrados traen sub-regiones (los que crean otros tests pueden no traerlas).
    expect(
      list.filter((e) => e.regions.length > 0).length,
    ).toBeGreaterThanOrEqual(91);

    // Anclas del sembrado: cada ejercicio con sus músculos y su grado (0015).
    const P = "primary",
      S = "secondary",
      E = "stabilizer";
    const roles = (name: string) =>
      byName.get(name)?.regions.map((r) => [r.region, r.role]);
    expect(roles("Press banca")).toEqual([
      ["chest-lower", P],
      ["chest-upper", S],
      ["shoulder-front", S],
      ["triceps-lateral", S],
      ["triceps-long", S],
    ]);
    expect(roles("Sentadilla trasera")).toEqual([
      ["abs-lower", E],
      ["adductors", S],
      ["gluteus-maximus", P],
      ["hamstrings-medial", E],
      ["quads", P],
    ]);
    expect(roles("Elevación de gemelos de pie")).toEqual([
      ["calves-gastroc-lateral", P],
      ["calves-gastroc-medial", P],
      ["calves-soleus", S],
    ]);
    // Corregida en `0011`: la prensa no bloquea la rodilla, así que el sóleo
    // también entra, como en las otras dos variantes de pie.
    expect(roles("Elevación de gemelos en prensa")).toEqual([
      ["calves-gastroc-lateral", P],
      ["calves-gastroc-medial", P],
      ["calves-soleus", S],
    ]);

    // Toda sub-región está en el vocabulario y cuelga de un grupo que el
    // ejercicio ya tiene como tag: los dos niveles no se contradicen. Y todo
    // ejercicio sembrado tiene al menos un músculo principal.
    for (const e of list) {
      for (const { region } of e.regions) {
        const group = MUSCLE_REGION_GROUPS[region];
        expect(group, `${e.name} → ${region}`).toBeDefined();
        expect(e.tags, `${e.name} → ${region}`).toContain(group);
      }
      if (e.regions.length > 0)
        expect(
          e.regions.some((r) => r.role === P),
          e.name,
        ).toBe(true);
    }
  });
});
