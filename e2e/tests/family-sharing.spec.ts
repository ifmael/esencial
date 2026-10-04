// Multi-usuario de verdad, en el navegador: dos personas de la misma familia
// comparten menú y recetas, y el vecino no ve nada de eso. El navegador se
// identifica con X-Dev-Email (que e2e honra con DEV_AUTH=1 y el mismo seam que
// usa vitest), así que se puede actuar como varios usuarios en la misma corrida
// sin tocar la cookie de sesión.
import { expect, test } from "@playwright/test";
import { apiRequest, apiUrl, login, uniqueName } from "./helpers";

/** El estado de sesión del proyecto `authed`: la cookie del admin. */
const STATE = ".auth/state.json";

/** Semana ISO de hoy: el calendario de comidas abre en la actual. */
function currentIsoWeek(): string {
  const today = new Date();
  const d = new Date(
    Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

test("la familia comparte menú y recetas; el vecino no ve nada", async ({
  browser,
  request,
}) => {
  const suffix = Date.now();
  const vecina = `vecina-${suffix}@example.com`;
  const vecino = `vecino-${suffix}@example.com`;

  // El contexto de peticiones es el admin de la instalación (cookie de sesión).
  expect((await login(request, "hola")).status()).toBe(200);
  const yo = await apiRequest<{ familyId: number }>(request, "GET", "/api/me");

  // Los dos vecinos tienen que existir (autoprovisión) antes de poder meterlos.
  for (const email of [vecina, vecino])
    await request.fetch(apiUrl("/api/me"), {
      headers: { "X-Dev-Email": email },
    });

  // Lo que comparte la familia lo crea el admin: una receta y una comida de
  // esta semana.
  const nombre = uniqueName("Receta de familia");
  const receta = await apiRequest<{ id: number }>(
    request,
    "POST",
    "/api/recipes",
    { name: nombre, tags: [] },
  );
  await apiRequest(request, "PUT", `/api/meal-plan/${currentIsoWeek()}`, {
    slots: [{ day: 0, meal: "almuerzo", recipeId: receta.id }],
  });

  // La vecina entra en la familia; el vecino se queda fuera.
  await apiRequest(request, "POST", `/api/families/${yo.familyId}/members`, {
    email: vecina,
  });

  const ctxVecina = await browser.newContext({
    storageState: STATE,
    extraHTTPHeaders: { "X-Dev-Email": vecina },
  });
  const pageVecina = await ctxVecina.newPage();
  const ctxVecino = await browser.newContext({
    storageState: STATE,
    extraHTTPHeaders: { "X-Dev-Email": vecino },
  });
  const pageVecino = await ctxVecino.newPage();

  // La vecina ve la receta del admin y su comida en el calendario.
  await pageVecina.goto("/recetario");
  await expect(pageVecina.locator("a", { hasText: nombre })).toHaveCount(1);
  await pageVecina.goto("/plan-recetas");
  await expect(pageVecina.getByText(nombre).first()).toBeVisible();

  // El vecino no: ni la receta ni la comida de la familia.
  await pageVecino.goto("/recetario");
  await expect(pageVecino.locator("a", { hasText: nombre })).toHaveCount(0);
  await pageVecino.goto("/plan-recetas");
  await expect(pageVecino.getByText(nombre)).toHaveCount(0);

  await ctxVecina.close();
  await ctxVecino.close();
});
