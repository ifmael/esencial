import { beforeAll, describe, expect, it } from "vitest";

import { freshDb, get } from "./helpers";

const WEB = "http://127.0.0.1:8788";

beforeAll(freshDb);

describe("puente de sesión API ↔ web", () => {
  it("vuelve a la web permitida", async () => {
    const to = `${WEB}/plan-fuerza?semana=2026-W36`;
    const res = await get(`/api/session/return?to=${encodeURIComponent(to)}`);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(to);
  });

  it("rechaza otro origen, credenciales o algo que no es una URL", async () => {
    const evil = await get(
      `/api/session/return?to=${encodeURIComponent("https://evil.example/")}`,
    );
    expect(evil.status).toBe(403);

    const credentials = await get(
      `/api/session/return?to=${encodeURIComponent(`http://u:p@127.0.0.1:8788/`)}`,
    );
    expect(credentials.status).toBe(403);

    const relative = await get(
      `/api/session/return?to=${encodeURIComponent("/plan-fuerza")}`,
    );
    expect(relative.status).toBe(400);
  });
});
