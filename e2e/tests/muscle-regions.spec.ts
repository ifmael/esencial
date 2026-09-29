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

/** Sub-regiones musculares: el dibujo filtra por el músculo concreto y las
 *  fichas de grupo devuelven todas las sub-regiones de ese grupo. */
test.describe("SUB-REGIONES — el mapa filtra fino", () => {
  test.use({ storageState: ".auth/state.json" });

  test("el mapa filtra por sub-región y el grupo padre las agrupa", async ({
    page,
  }) => {
    await page.goto("/plantillas/nueva");
    const picker = page.getByRole("region", { name: "Añadir ejercicio" });
    await expect(picker).toBeVisible();
    const grupos = picker.getByRole("group", { name: "Grupo:" });

    // Frontal: pecho superior es una sub-región del pecho, no el grupo entero.
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

    // La ficha del grupo padre devuelve las dos sub-regiones del pecho.
    await grupos.getByRole("button", { name: "Pecho", exact: true }).click();
    await expect(picker.getByText("Grupo: Pecho")).toBeVisible();
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
    ).toBeVisible();
    await expect(
      picker.getByRole("button", { name: "Curl con barra", exact: true }),
    ).toHaveCount(0);

    // Trasera: los flexores del antebrazo son otra sub-región del antebrazo.
    await picker.getByRole("button", { name: "Trasera", exact: true }).click();
    const back = picker.locator('svg[aria-label="Vista trasera"]');
    await clickMuscle(
      page,
      back.getByRole("button", {
        name: "Flexores del antebrazo",
        exact: true,
      }),
    );
    await expect(
      picker.getByRole("button", { name: "Curl con barra", exact: true }),
    ).toBeVisible();
    await expect(
      picker.getByRole("button", {
        name: "Curl de muñeca inverso",
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

  test("el catálogo sembrado cuelga de sub-regiones del vocabulario", async ({
    request,
  }) => {
    type Ex = { name: string; tags: string[]; regions: string[] };
    const list = await apiRequest<Ex[]>(request, "GET", "/api/exercises");
    const byName = new Map(list.map((e) => [e.name, e]));

    // Los 91 sembrados traen sub-regiones (los que crean otros tests pueden no traerlas).
    expect(
      list.filter((e) => e.regions.length > 0).length,
    ).toBeGreaterThanOrEqual(91);

    // Anclas del sembrado: cada ejercicio con sus músculos, ordenados.
    expect(byName.get("Press banca")?.regions).toEqual([
      "chest-lower",
      "chest-upper",
      "shoulder-front",
      "triceps-lateral",
      "triceps-long",
    ]);
    expect(byName.get("Sentadilla trasera")?.regions).toEqual([
      "abs-lower",
      "adductors",
      "gluteus-maximus",
      "hamstrings-medial",
      "quads",
    ]);
    expect(byName.get("Elevación de gemelos de pie")?.regions).toEqual([
      "calves-gastroc-lateral",
      "calves-gastroc-medial",
      "calves-soleus",
    ]);
    // Corregida en `0011`: la prensa no bloquea la rodilla, así que el sóleo
    // también entra, como en las otras dos variantes de pie.
    expect(byName.get("Elevación de gemelos en prensa")?.regions).toEqual([
      "calves-gastroc-lateral",
      "calves-gastroc-medial",
      "calves-soleus",
    ]);

    // Toda sub-región está en el vocabulario y cuelga de un grupo que el
    // ejercicio ya tiene como tag: los dos niveles no se contradicen.
    for (const e of list) {
      for (const region of e.regions) {
        const group = MUSCLE_REGION_GROUPS[region];
        expect(group, `${e.name} → ${region}`).toBeDefined();
        expect(e.tags, `${e.name} → ${region}`).toContain(group);
      }
    }
  });
});
