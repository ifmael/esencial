// Multi-usuario (0019): resolución de identidad y GET /api/me. La identidad la
// prueba Cloudflare Access en el borde; aquí se fijan los dos seams (la de
// Access y la de dev) y, sobre todo, que sin el flag de dev la cabecera se
// ignora. La suite de aislamiento entre usuarios llega en el slice de tenancy.
import { env } from "cloudflare:test";
import { beforeEach, describe, expect, test } from "vitest";
import { identityEmail, normalizeEmail } from "../src/identity";
import app from "../src/index";
import { d1, devGet, devSend, freshDb } from "./helpers";

const ME = "http://localhost/api/me";

/** El mismo binding con el seam de dev apagado: así se prueba el camino de
 *  Access, que en tests y e2e no está delante. */
const noDev = { ...env, DEV_AUTH: "0" };

/** El ExecutionContext del Worker con la identidad que Access ya autenticó. */
function accessCtx(email: string | null): ExecutionContext {
  return {
    waitUntil: () => {},
    passThroughOnException: () => {},
    props: {},
    access: { getIdentity: async () => (email === null ? null : { email }) },
  } as unknown as ExecutionContext;
}

type Me = {
  id: number;
  email: string;
  role: string;
  familyId: number;
  name: string | null;
  access: boolean;
};

/** Cuerpo de /api/me: el `json()` de un Response llega sin tipo. */
async function meOf(res: Response): Promise<Me> {
  return (await res.json()) as Me;
}

beforeEach(freshDb);

describe("identidad", () => {
  test("sin DEV_AUTH=1 la cabecera de dev se ignora (fail closed)", async () => {
    expect(
      await identityEmail({ devAuth: undefined, devEmail: "pepe@example.com" }),
    ).toBeNull();
    expect(
      await identityEmail({ devAuth: "0", devEmail: "pepe@example.com" }),
    ).toBeNull();
    expect(
      await identityEmail({ devAuth: "true", devEmail: "pepe@example.com" }),
    ).toBeNull();
  });

  test("con DEV_AUTH=1 manda la cabecera", async () => {
    expect(
      await identityEmail({ devAuth: "1", devEmail: "pepe@example.com" }),
    ).toBe("pepe@example.com");
    expect(
      await identityEmail({ devAuth: "1", devEmail: undefined }),
    ).toBeNull();
  });

  test("lee la identidad que Access ya autenticó", async () => {
    const access = { getIdentity: async () => ({ email: "pepe@example.com" }) };
    expect(await identityEmail({ access })).toBe("pepe@example.com");
    expect(
      await identityEmail({ access: { getIdentity: async () => null } }),
    ).toBeNull();
    expect(await identityEmail({ access: {} })).toBeNull();
    expect(await identityEmail({})).toBeNull();
  });

  test("una identidad sin forma de email no vale", async () => {
    expect(
      await identityEmail({ devAuth: "1", devEmail: "no-arroba" }),
    ).toBeNull();
    expect(await identityEmail({ devAuth: "1", devEmail: "   " })).toBeNull();
    expect(
      await identityEmail({
        access: { getIdentity: async () => ({ email: "sin arroba" }) },
      }),
    ).toBeNull();
    expect(normalizeEmail("")).toBeNull();
  });
});

describe("GET /api/me", () => {
  test("sin identidad es 401", async () => {
    expect((await app.request(ME, {}, env)).status).toBe(401);
  });

  test("la cabecera de dev no vale si el Worker no la habilita", async () => {
    const res = await app.request(
      ME,
      { headers: { "X-Dev-Email": "pepe@example.com" } },
      noDev,
    );
    expect(res.status).toBe(401);
    expect(await d1.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 0 });
  });

  test("autoprovisión: el primero entra como admin y estrena familia", async () => {
    const res = await devGet("/api/me", "pepe@example.com");
    expect(res.status).toBe(200);
    expect(await meOf(res)).toEqual({
      id: expect.any(Number),
      email: "pepe@example.com",
      role: "admin",
      familyId: expect.any(Number),
      name: null,
      access: false,
    });
    expect(await d1.get("SELECT COUNT(*) AS n FROM families")).toEqual({
      n: 1,
    });
  });

  test("el segundo entra como member y con familia propia", async () => {
    const first = await meOf(await devGet("/api/me", "pepe@example.com"));
    const second = await meOf(await devGet("/api/me", "ana@example.com"));
    expect(second.role).toBe("member");
    expect(second.familyId).not.toBe(first.familyId);
  });

  test("ADMIN_EMAIL designa admin aunque no sea el primero", async () => {
    await devGet("/api/me", "pepe@example.com");
    const res = await devGet("/api/me", "admin@esencial.test");
    expect((await meOf(res)).role).toBe("admin");
  });

  test("es idempotente y normaliza el email", async () => {
    const first = await meOf(await devGet("/api/me", " Pepe@Example.com "));
    const again = await meOf(await devGet("/api/me", "pepe@example.com"));
    expect(again.id).toBe(first.id);
    expect(again.familyId).toBe(first.familyId);
    expect(await d1.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 1 });
    expect(await d1.get("SELECT COUNT(*) AS n FROM families")).toEqual({
      n: 1,
    });
  });

  test("lee la identidad de Access cuando el seam de dev está apagado", async () => {
    const res = await app.request(ME, {}, noDev, accessCtx("pepe@example.com"));
    expect(res.status).toBe(200);
    const yo = await meOf(res);
    expect(yo.email).toBe("pepe@example.com");
    // Con Access delante, /api/me lo dice: hay una sesión que cerrar.
    expect(yo.access).toBe(true);
  });

  test("Access sin identidad es 401 y no provisiona nada", async () => {
    const res = await app.request(ME, {}, noDev, accessCtx(null));
    expect(res.status).toBe(401);
    expect(await d1.get("SELECT COUNT(*) AS n FROM users")).toEqual({ n: 0 });
  });

  test("la exención del gate de cookie es exacta, no por prefijo", async () => {
    // middleware.ts exceptúa la ruta clavada: ni su barra final ni una hermana.
    expect(
      (await app.request("http://localhost/api/me/", {}, env)).status,
    ).toBe(401);
    expect(
      (await app.request("http://localhost/api/metoo", {}, env)).status,
    ).toBe(401);
  });
});

describe("PATCH /api/me", () => {
  const MAX = 60;

  test("guarda el nombre, lo normaliza y el GET lo devuelve", async () => {
    await devGet("/api/me", "pepe@example.com");
    const res = await devSend(
      "/api/me",
      "PATCH",
      { name: "  Ismael   R.  " },
      "pepe@example.com",
    );
    expect(res.status).toBe(200);
    expect((await meOf(res)).name).toBe("Ismael R.");

    // Persistido de verdad: el GET siguiente (y la fila) lo traen.
    expect((await meOf(await devGet("/api/me", "pepe@example.com"))).name).toBe(
      "Ismael R.",
    );
    expect(
      await d1.get(
        "SELECT name FROM users WHERE email = ?",
        "pepe@example.com",
      ),
    ).toEqual({ name: "Ismael R." });
  });

  test("colapsa cualquier espacio en blanco, no solo el de teclado", async () => {
    await devGet("/api/me", "pepe@example.com");
    const res = await devSend(
      "/api/me",
      "PATCH",
      { name: "A\t B\nC  D" },
      "pepe@example.com",
    );
    expect((await meOf(res)).name).toBe("A B C D");
  });

  test("vacío o solo espacios borra el nombre (null)", async () => {
    await devGet("/api/me", "pepe@example.com");
    await devSend("/api/me", "PATCH", { name: "Pepe" }, "pepe@example.com");
    const res = await devSend(
      "/api/me",
      "PATCH",
      { name: "   " },
      "pepe@example.com",
    );
    expect(res.status).toBe(200);
    expect((await meOf(res)).name).toBeNull();
    expect(
      await d1.get(
        "SELECT name FROM users WHERE email = ?",
        "pepe@example.com",
      ),
    ).toEqual({ name: null });
  });

  test(`admite justo el límite (${MAX}) y rechaza uno más con {field:'name'}`, async () => {
    await devGet("/api/me", "pepe@example.com");
    const ok = await devSend(
      "/api/me",
      "PATCH",
      { name: "x".repeat(MAX) },
      "pepe@example.com",
    );
    expect(ok.status).toBe(200);
    expect((await meOf(ok)).name).toBe("x".repeat(MAX));

    const res = await devSend(
      "/api/me",
      "PATCH",
      { name: "y".repeat(MAX + 1) },
      "pepe@example.com",
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "name" });
    // El nombre guardado no se toca.
    expect(
      await d1.get(
        "SELECT name FROM users WHERE email = ?",
        "pepe@example.com",
      ),
    ).toEqual({ name: "x".repeat(MAX) });
  });

  test("un body sin `name` (o de otro tipo) es 400 {field:'name'}", async () => {
    await devGet("/api/me", "pepe@example.com");
    for (const body of [{}, { name: 3 }, { name: null }]) {
      const res = await devSend("/api/me", "PATCH", body, "pepe@example.com");
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ field: "name" });
    }
    // Un cuerpo que ni es JSON: 400, pero el campo es el `body`.
    const malformed = await devSend(
      "/api/me",
      "PATCH",
      "nope",
      "pepe@example.com",
    );
    expect(malformed.status).toBe(400);
  });

  test("sin identidad es 401", async () => {
    const res = await app.request(
      ME,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "X" }),
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});
