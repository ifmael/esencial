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
    const scheduled = await apiRequest<{ status: string }>(
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

test.describe("PLANIFICADOR SEMANAL", () => {
  test.use({ storageState: ".auth/state.json" });

  // Dates unique per run, weeks far from the first describe's range.
  const RUN_OFFSET = 400 + (Date.now() % 300);
  const dateAt = (offsetDays: number) =>
    new Date(Date.now() + (RUN_OFFSET + offsetDays) * 86_400_000);

  /** ISO week "YYYY-Www" of a UTC-noon date (same convention as the app). */
  function isoWeekOf(d: Date): string {
    const t = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12),
    );
    t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3); // Thursday
    const jan4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4, 12));
    jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() + 6) % 7) + 3);
    const week =
      1 + Math.round((t.getTime() - jan4.getTime()) / (7 * 86_400_000));
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }

  /** Monday of ISO week, mirroring week-grid.tsx dayOf. */
  function mondayOf(week: string): string {
    const [year, w] = week.split("-W").map(Number);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const monday = new Date(
      jan4.getTime() - ((jan4.getUTCDay() + 6) % 7) * 86_400_000,
    );
    monday.setUTCDate(monday.getUTCDate() + (w - 1) * 7);
    return monday.toISOString().slice(0, 10);
  }

  const weekOf = (n: number) => isoWeekOf(dateAt(n));
  const weekAfter = (week: string) =>
    isoWeekOf(
      new Date(Date.parse(`${mondayOf(week)}T12:00:00Z`) + 86_400_000 * 7),
    );

  /** Template seeded via API; name unique so the picker search hits one row. */
  async function seedTemplate(
    request: APIRequestContext,
    prefix: string,
  ): Promise<{ id: number; name: string }> {
    const name = uniqueName(prefix);
    const exercises = await apiRequest<{ id: number }[]>(
      request,
      "GET",
      "/api/exercises",
    );
    const [a, b] = exercises.slice(0, 2);
    const tpl = await apiRequest<{ id: number }>(
      request,
      "POST",
      "/api/templates",
      {
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
      },
    );
    return { id: tpl.id, name };
  }

  /** DELETE any leftover session on `date` (planned rows only; logged 409s). */
  async function clearDate(request: APIRequestContext, date: string) {
    const sessions = await apiRequest<
      { id: number; status: string; date: string }[]
    >(request, "GET", "/api/plan-sessions");
    for (const s of sessions.filter(
      (s) => s.date === date && s.status === "planned",
    )) {
      await request.delete(`/api/plan-sessions/${s.id}`);
    }
  }

  test("añadir plantilla a un día desde la rejilla", async ({ page }) => {
    const tpl = await seedTemplate(page.request, "Rejilla E2E");
    const week = weekOf(0);
    const lunes = mondayOf(week);
    await page.goto(`/plan-fuerza?week=${week}`);

    // First empty cell = lunes (week is empty; dates are far in the future).
    await page.getByRole("button", { name: "+ añadir" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Elegir plantilla" });
    await dialog.getByLabel("Buscar plantilla").fill(tpl.name);
    await dialog.getByRole("button", { name: tpl.name }).click();

    // Planned cell replaces the empty one: template + Pendiente + ✕.
    await expect(page.getByText(tpl.name).first()).toBeVisible();
    await expect(page.getByText("Pendiente").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Desprogramar sesión del ${lunes}` }),
    ).toBeAttached();
  });

  test("desprogramar con la ✕ (confirmación inline)", async ({ page }) => {
    const tpl = await seedTemplate(page.request, "Desprog E2E");
    const week = weekOf(1);
    const lunes = mondayOf(week);
    await clearDate(page.request, lunes);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: lunes,
      templateId: tpl.id,
    });
    await page.goto(`/plan-fuerza?week=${week}`);

    const desprogramar = page.getByRole("button", {
      name: `Desprogramar sesión del ${lunes}`,
    });
    await expect(desprogramar).toBeVisible();

    // Inline confirmation, two clicks.
    await desprogramar.click();
    const confirmar = page.getByRole("button", {
      name: "Confirmar desprogramar",
    });
    await expect(confirmar).toBeVisible();
    await confirmar.click();

    // Back to empty: the lunes cell (first day) shows "+ añadir" again, no ✕.
    await expect(desprogramar).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "+ añadir" }).first(),
    ).toBeVisible();
  });

  test("error 409 visible al ocupar un día ocupado", async ({ page }) => {
    const tpl = await seedTemplate(page.request, "409 E2E");
    const week = weekOf(2);
    const martes = mondayOf(week);
    await clearDate(page.request, martes);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: martes,
      templateId: tpl.id,
    });
    await page.goto(`/plan-fuerza?week=${week}`);

    // UI can only select empty days; the 409 path is exercised by
    // intercepting the create POST with the API's real duplicate-day envelope.
    await page.route("**/api/plan-sessions", (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: "Ya hay una sesión ese día" }),
      });
    });

    await page.getByRole("button", { name: "+ añadir" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Elegir plantilla" });
    await dialog.getByLabel("Buscar plantilla").fill(tpl.name);
    await dialog.getByRole("button", { name: tpl.name }).click();

    // Hook re-renders the grid error as role="alert".
    await expect(
      page.getByRole("alert").filter({ hasText: "Ya hay una sesión ese día" }),
    ).toBeVisible();
    // And the occupied cell is untouched.
    await expect(
      page.getByRole("button", {
        name: `Desprogramar sesión del ${martes}`,
      }),
    ).toBeAttached();
  });

  test("badge Hecho tras registrar una sesión", async ({ page }) => {
    const tpl = await seedTemplate(page.request, "Hecho E2E");
    const week = weekOf(3);
    const lunes = mondayOf(week);
    await clearDate(page.request, lunes);
    await apiRequest(page.request, "POST", "/api/plan-sessions", {
      date: lunes,
      templateId: tpl.id,
    });

    // Register the session through the existing session-page flow.
    await page.goto(`/sesion/${lunes}`);
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

    // Grid shows the logged badge for that week/day.
    await page.goto(`/plan-fuerza?week=${week}`);
    await expect(page.getByText("Hecho", { exact: true })).toBeVisible();
    await expect(page.getByText(tpl.name).first()).toBeVisible();
    // Logged cells have no ✕.
    await expect(
      page.getByRole("button", {
        name: `Desprogramar sesión del ${lunes}`,
      }),
    ).toHaveCount(0);
  });

  test("navegación de semanas", async ({ page }) => {
    const cur = weekOf(4);
    await page.goto(`/plan-fuerza?week=${cur}`);
    await expect(
      page.getByRole("heading", { name: cur, exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Semana siguiente" }).click();
    const next = weekAfter(cur);
    await expect(
      page.getByRole("heading", { name: next, exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get("week")).toBe(next);

    await page.getByRole("button", { name: "Semana anterior" }).click();
    await expect(
      page.getByRole("heading", { name: cur, exact: true }),
    ).toBeVisible();
  });
});
