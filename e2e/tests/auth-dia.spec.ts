import { expect, test } from "@playwright/test";

test.describe("AUTH-DIA", () => {
  // Unauthenticated project: explicitly clear storageState.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("wrong password shows visible error and stays on /login", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Contraseña").fill("no-es-la-clave");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByRole("alert")).toContainText(
      "Contraseña incorrecta",
    );
    expect(new URL(page.url()).pathname).toBe("/login");
  });

  test("correct password enters the app and session survives reload", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Contraseña").fill("hola");
    await page.getByRole("button", { name: "Entrar" }).click();

    await page.waitForURL("/");
    // Session survives reload
    await page.reload();
    await page.waitForURL("/");
    await expect(
      page.getByRole("heading", { name: /Hoy|RECETA/ }).first(),
    ).toBeVisible();
  });
});

test.describe("DÍA empty states (authenticated)", () => {
  test.use({ storageState: ".auth/state.json" });

  test("/ renders RECETA, FUERZA and NOTAS cards with empty-state content", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "RECETA" })).toBeVisible();
    await expect(
      page.getByText("Aún no has planificado comidas para este día"),
    ).toBeVisible();

    await expect(page.getByRole("heading", { name: "FUERZA" })).toBeVisible();
    await expect(page.getByText("Sin sesión asignada")).toBeVisible();

    await expect(
      page.getByRole("heading", { name: "NOTAS DEL DÍA" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Escribe algo sobre hoy")).toBeVisible();
  });
});
