import { expect, test } from "@playwright/test";
import { apiRequest, finishSession, seededExercise } from "./helpers";

/** Fecha futura propia del spec (las sesiones son UNIQUE por fecha): un offset
 *  grande para no chocar con las semanas que usan strength.spec.ts. */
function futureDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

test.describe("MÉTRICA — los ejercicios por tiempo se registran en segundos", () => {
  test("la plancha pide segundos (ni kilos ni reps) y el historial los guarda", async ({
    page,
  }) => {
    const plancha = await seededExercise(page.request, "Plancha");
    const date = futureDate(240);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date,
      name: "Core métrica",
      items: [{ exerciseId: plancha.id, targetSets: 2 }],
    });

    await page.goto(`/sesion/${date}`);
    await expect(page.getByText("Core métrica").first()).toBeVisible();
    // El resumen solo resume: se registra dentro del modo sesión.
    await expect(page.getByLabel("Segundos · Plancha serie 1")).toHaveCount(0);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });

    await expect(
      mode.getByLabel("Segundos · Plancha serie 1", { exact: true }),
    ).toBeVisible();
    await expect(
      mode.getByLabel("Peso (kg) · Plancha serie 1", { exact: true }),
    ).toHaveCount(0);
    await expect(
      mode.getByLabel("Reps · Plancha serie 1", { exact: true }),
    ).toHaveCount(0);
    // Sin kg no hay conmutador «Sin peso» en un ejercicio por tiempo.
    await expect(
      mode.getByRole("switch", { name: "Sin peso · Plancha" }),
    ).toHaveCount(0);

    // Escribir los segundos marca la serie sola y el registro la guarda.
    await mode
      .getByLabel("Segundos · Plancha serie 1", { exact: true })
      .fill("45");
    await expect(
      mode.getByRole("checkbox", { name: "Plancha serie 1" }),
    ).toBeChecked();

    await finishSession(mode);
    await expect(page.getByText("Registrado")).toBeVisible();
    await expect(page.getByText("45 s")).toBeVisible();
  });

  test("el editor de ejercicios declara la métrica del catálogo", async ({
    page,
  }) => {
    const plancha = await seededExercise(page.request, "Plancha");
    await page.goto(`/ejercicios/${plancha.id}`);
    await page.getByRole("button", { name: /editar/i }).click();
    await expect(
      page.getByRole("button", { name: "Segundos", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
