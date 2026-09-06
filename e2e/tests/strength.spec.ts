import { type APIRequestContext, expect, test } from "@playwright/test";
import { apiRequest, uniqueName } from "./helpers";

test.describe("STRENGTH — template, schedule and session loop", () => {
  test.use({ storageState: ".auth/state.json" });

  // Self-contained: dates unique per run (day offset encodes the run), so a
  // rerun never collides with a session left by an earlier failed attempt.
  const RUN_OFFSET = 30 + (Date.now() % 300);
  const iso = (offsetDays: number) => {
    const d = new Date();
    d.setDate(d.getDate() + RUN_OFFSET + offsetDays);
    return d.toISOString().slice(0, 10);
  };

  async function createTemplateViaApi(
    request: APIRequestContext,
    name: string,
  ): Promise<{ id: number }> {
    // Two seeded exercises (D1 has 91); pick by id via the list endpoint.
    const exercises = await apiRequest<{ id: number }[]>(
      request,
      "GET",
      "/api/exercises",
    );
    const [a, b] = exercises.slice(0, 2);
    return apiRequest(request, "POST", "/api/templates", {
      name,
      rotationIndex: 0,
      exercises: [
        {
          exerciseId: a.id,
          targetSets: 3,
          targetRepsMin: 8,
          targetRepsMax: 10,
        },
        {
          exerciseId: b.id,
          targetSets: 3,
          targetRepsMin: 10,
          targetRepsMax: 12,
        },
      ],
    });
  }

  test("template created with two exercises shows them", async ({ page }) => {
    const name = uniqueName("Plantilla E2E");
    await page.goto("/plan-fuerza");
    await page.getByRole("button", { name: "+ Nueva plantilla" }).click();

    await page.locator("#tpl-name").fill(name);
    await page.getByRole("button", { name: "+ Añadir ejercicio" }).click();
    await page.getByPlaceholder("Buscar ejercicio").fill("press banca");
    const dialog = page.getByRole("dialog", { name: "Añadir ejercicio" });
    const exerciseButtons = dialog
      .getByRole("button")
      .filter({ hasText: /press/i });
    await exerciseButtons.first().click();
    await exerciseButtons.nth(1).click();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Guardar", exact: true }).click();

    // Saved: editor closed; the card auto-expands and lists its two exercises
    await expect(
      page.getByRole("button", { name: "Guardar", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name, exact: true }).first(),
    ).toBeVisible();
    await expect(
      page
        .getByRole("listitem")
        .filter({ has: page.getByRole("button", { name: "Press banca" }) })
        .first(),
    ).toBeVisible();
  });

  test("Programar → FUERZA card at / shows template name and numbered exercises", async ({
    page,
  }) => {
    const name = uniqueName("Prog E2E");
    const date = iso(1);
    const tpl = await createTemplateViaApi(page.request, name);
    expect(tpl.id).toBeGreaterThan(0);

    // Schedule via API (UI for scheduling lives on the Día/session flow)
    const scheduled = await apiRequest(
      page.request,
      "POST",
      "/api/plan-sessions",
      { date, templateId: tpl.id },
    );
    expect(scheduled.status).toBe("planned");

    // FUERZA card at / (tomorrow) shows the template
    await page.goto("/");
    await page.getByLabel("Ir a una fecha").fill(iso(1));
    await expect(page.getByRole("heading", { name: "FUERZA" })).toBeVisible();
    await expect(page.getByText(name)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Registrar sesión" }),
    ).toBeVisible();
  });

  test("Registrar sesión → logged summary on FUERZA card in Hoy", async ({
    page,
  }) => {
    const name = uniqueName("Log E2E");
    const date = iso(2);
    const tpl = await createTemplateViaApi(page.request, name);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date,
      templateId: tpl.id,
    });

    await page.goto(`/sesion/${date}`);
    await expect(page.getByText(name).first()).toBeVisible();

    // Expand first exercise and check a set, set effort 3
    await page
      .getByRole("button", { name: /Series de / })
      .first()
      .click();
    await page
      .getByRole("checkbox", { name: / serie 1$/ })
      .first()
      .check();
    await page.getByText("Moderado", { exact: true }).click();

    await page
      .getByRole("main")
      .getByRole("button", { name: "Cerrar sesión" })
      .click();
    await expect(page.getByText("Registrado")).toBeVisible();

    // FUERZA card in Hoy shows the logged summary
    await page.goto("/");
    await page.getByLabel("Ir a una fecha").fill(iso(2));
    await expect(page.getByText(/Sesión completada/)).toBeVisible();
    await expect(page.getByText(/ejercicios · .* series/)).toBeVisible();
  });

  test("second session same date → visible 'Ya hay una sesión ese día' and no duplicate", async ({
    page,
  }) => {
    const name = uniqueName("Dup E2E");
    const date = iso(3);
    const tpl = await createTemplateViaApi(page.request, name);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date,
      templateId: tpl.id,
    });

    // First registration through the UI (state A → B)
    await page.goto(`/sesion/${date}`);
    await page
      .getByRole("button", { name: /Series de / })
      .first()
      .click();
    await page
      .getByRole("checkbox", { name: / serie 1$/ })
      .first()
      .check();
    await page.getByText("Fácil", { exact: true }).click();
    await page
      .getByRole("main")
      .getByRole("button", { name: "Cerrar sesión" })
      .click();
    await expect(page.getByText("Registrado")).toBeVisible();

    // Second attempt: schedule again via API → 409 with the exact envelope text
    const res = await page.request.post("/api/plan-sessions", {
      data: { date, templateId: tpl.id },
    });
    expect(res.status()).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Ya hay una sesión ese día");

    // And the UI path: re-open the session page → read-only logged, not a draft
    await page.goto(`/sesion/${date}`);
    await expect(page.getByText("Registrado")).toBeVisible();
    await expect(
      page.getByRole("main").getByRole("button", { name: "Cerrar sesión" }),
    ).toHaveCount(0);
  });
});
