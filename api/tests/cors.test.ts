// B' (dos despliegues): la web vive en otro origen que la API, así que la API
// tiene que autorizar explícitamente el origen del Worker de la web, con
// credenciales (la cookie de sesión viaja en una petición cross-origin).
import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import app from "../src/index";

// Debe coincidir con WEB_ORIGIN de wrangler.test.toml: el contrato se fija
// aquí para que un cambio de config se note.
const WEB = "http://127.0.0.1:8788";

describe("CORS hacia el Worker de la web", () => {
  it("el preflight del origen permitido responde 204 con credenciales", async () => {
    const res = await app.request(
      "https://api.test/api/recipes",
      {
        method: "OPTIONS",
        headers: {
          origin: WEB,
          "access-control-request-method": "POST",
          "access-control-request-headers": "content-type",
        },
      },
      env,
    );

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("la respuesta real refleja el origen permitido y varía por Origin", async () => {
    const res = await app.request(
      "https://api.test/api/health",
      { headers: { origin: WEB } },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(WEB);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
    expect(res.headers.get("vary")?.toLowerCase()).toContain("origin");
  });

  it("un origen desconocido no recibe permiso", async () => {
    const res = await app.request(
      "https://api.test/api/health",
      { headers: { origin: "https://evil.test" } },
      env,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  // La cabecera de identidad de dev solo se anuncia cuando el Worker la honra
  // (DEV_AUTH=1): es lo que deja al navegador de e2e actuar como otro usuario.
  // En producción no aparece, ni en el preflight ni en la respuesta.
  it("con DEV_AUTH=1 se permite la cabecera de identidad de dev", async () => {
    const res = await app.request(
      "https://api.test/api/recipes",
      {
        method: "OPTIONS",
        headers: { origin: WEB, "access-control-request-method": "POST" },
      },
      { ...env, DEV_AUTH: "1" },
    );

    expect(res.headers.get("access-control-allow-headers")).toContain(
      "x-dev-email",
    );
  });

  it("sin DEV_AUTH la cabecera de dev no se anuncia", async () => {
    const res = await app.request(
      "https://api.test/api/recipes",
      {
        method: "OPTIONS",
        headers: { origin: WEB, "access-control-request-method": "POST" },
      },
      { ...env, DEV_AUTH: undefined },
    );

    expect(res.headers.get("access-control-allow-headers")).toBe(
      "content-type",
    );
  });
});
