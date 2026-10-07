import { expect, test } from "@playwright/test";
import { apiRequest, finishSession, seededExercise } from "./helpers";

type ItemPayload = {
  exerciseId: number;
  targetSets?: number | null;
  targetRepsMin?: number | null;
};

/** Fechas propias del spec (las sesiones son UNIQUE por fecha): un rango de
 *  días que no usa ningún otro spec. */
function dayFrom(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function createSession(
  request: Parameters<typeof apiRequest>[0],
  date: string,
  items: ItemPayload[],
  name: string,
) {
  return apiRequest<{ id: number; exercises: { id: number }[] }>(
    request,
    "POST",
    "/api/plan-sessions",
    { date, name, items },
  );
}

test.describe("RESUMEN DE SESIÓN — la pantalla de bienvenida solo resume", () => {
  test("día planificado: cabecera con aro, «Empezar» y la lista inerte", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const date = dayFrom(500 + testInfo.retry * 7);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      "Resumen planificado",
    );

    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/sesion/${date}`);

      // La cabecera: el nombre de la sesión, el día y el aro con lo planificado.
      await expect(
        page.getByRole("heading", { name: "Resumen planificado" }),
      ).toBeVisible();
      const ring = page.getByRole("progressbar", { name: "Series hechas" });
      await expect(ring).toHaveAttribute("aria-valuenow", "0");
      await expect(ring).toHaveAttribute("aria-valuemax", "3");

      // La fila del día: nombre, enlace a su ficha y el contador «x/y».
      await expect(page.getByText("0/3")).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Press banca" }),
      ).toHaveAttribute("href", /\/ejercicios\/\d+$/);

      // Cero controles de registro: aquí no se registra nada.
      for (const role of [
        "checkbox",
        "radio",
        "switch",
        "spinbutton",
        "textbox",
        "toolbar",
      ] as const) {
        await expect(page.getByRole(role)).toHaveCount(0);
      }
      await expect(
        page.getByRole("button", { name: /series de /i }),
      ).toHaveCount(0);

      // Todo cabe: sin scroll horizontal ni en móvil.
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(viewport.width);
    }
  });

  test("lo marcado dentro del modo queda escrito en el resumen (móvil)", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const date = dayFrom(518 + testInfo.retry * 7);
    await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 3, targetRepsMin: 8 }],
      "Resumen a medias",
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/sesion/${date}`);
    await page.getByRole("button", { name: "Empezar", exact: true }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await mode
      .getByLabel("Reps · Press banca serie 1", { exact: true })
      .fill("10");
    await mode
      .getByLabel("Peso (kg) · Press banca serie 1", { exact: true })
      .fill("60");
    await expect(
      mode.getByRole("checkbox", { name: "Press banca serie 1" }),
    ).toBeChecked();

    // Salir sin registrar: el borrador se queda (y la sesión sigue planificada).
    await mode.getByRole("button", { name: "Salir del modo sesión" }).click();
    await page.getByRole("button", { name: "Salir", exact: true }).click();

    await expect(page.getByText("1/3")).toBeVisible();
    await expect(
      page.getByRole("progressbar", { name: "Series hechas" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByText("Registrado")).toHaveCount(0);
  });

  test("día registrado: el mismo resumen, y «Editar» corrige desde el modo", async ({
    page,
  }, testInfo) => {
    const press = await seededExercise(page.request, "Press banca");
    const date = dayFrom(536 + testInfo.retry * 7);
    const session = await createSession(
      page.request,
      date,
      [{ exerciseId: press.id, targetSets: 2, targetRepsMin: 8 }],
      "Resumen registrado",
    );
    const item = session.exercises[0];
    await apiRequest(page.request, "POST", `/api/workout-logs/${date}`, {
      effort: 4,
      note: "sensación buena",
      sets: [
        {
          planSessionExerciseId: item.id,
          setIndex: 0,
          weightKg: 62.5,
          reps: 5,
          done: true,
        },
        {
          planSessionExerciseId: item.id,
          setIndex: 1,
          weightKg: 60,
          reps: 8,
          done: true,
        },
      ],
    });

    await page.goto(`/sesion/${date}`);
    await expect(page.getByText("Registrado", { exact: true })).toBeVisible();
    // Lo anotado: las marcas, el contador y la nota. Sin controles.
    await expect(page.getByText("62.5×5 · 60×8")).toBeVisible();
    await expect(page.getByText("2/2")).toBeVisible();
    await expect(page.getByText("sensación buena")).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(0);
    await expect(
      page.getByRole("progressbar", { name: "Series hechas" }),
    ).toHaveAttribute("aria-valuenow", "2");

    // Corregir: el modo sale de lo registrado y guarda con PUT.
    await page.getByRole("button", { name: "Editar" }).click();
    const mode = page.getByRole("dialog", { name: "Modo sesión" });
    await expect(
      mode.getByLabel("Reps · Press banca serie 2", { exact: true }),
    ).toHaveValue("8");
    await mode
      .getByLabel("Reps · Press banca serie 2", { exact: true })
      .fill("9");
    await finishSession(mode, "Duro");

    await expect(page.getByText("Registrado", { exact: true })).toBeVisible();
    await expect(page.getByText("62.5×5 · 60×9")).toBeVisible();
    const log = await apiRequest<{ sets: { reps: number }[] }>(
      page.request,
      "GET",
      `/api/workout-logs/${date}`,
    );
    expect(log.sets.map((s) => s.reps)).toEqual([5, 9]);
  });
});
