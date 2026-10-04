// E1 parity: per-day notes — PUT upserts, GET reads, re-save replaces.
import { beforeAll, describe, expect, it } from "vitest";
import { devGet, devSend, freshDb, get, put } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("/api/notes/:date", () => {
  it("PUT then GET returns the text", async () => {
    const res = await put("/api/notes/2026-09-02", { text: "dormí bien" });
    expect(res.status).toBe(200);
    const got = await get("/api/notes/2026-09-02");
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({
      date: "2026-09-02",
      text: "dormí bien",
    });
  });

  it("re-saving replaces the text (one note per day)", async () => {
    await put("/api/notes/2026-09-03", { text: "primera" });
    await put("/api/notes/2026-09-03", { text: "segunda" });
    const got = await body(await get("/api/notes/2026-09-03"));
    expect(got.text).toBe("segunda");
  });

  it("empty text clears the note body but stays readable", async () => {
    await put("/api/notes/2026-09-04", { text: "" });
    const got = await body(await get("/api/notes/2026-09-04"));
    expect(got.text).toBe("");
  });

  it("GET unknown date → 200 with empty text", async () => {
    const res = await get("/api/notes/2019-05-05");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ date: "2019-05-05", text: "" });
  });

  it("400 on invalid date", async () => {
    const res = await put("/api/notes/ayer", { text: "x" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("date");
  });

  it("400 when text missing", async () => {
    const res = await put("/api/notes/2026-09-05", {});
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("text");
  });
});

// La nota del día es privada del usuario: dos personas pueden tener la suya el
// mismo día (PK (user_id, date)) y la de una no pisa ni contamina la de la otra.
const B = "bea@esencial.test";

describe("notas privadas por usuario", () => {
  it("la nota de B no aparece en la de A ni la pisa", async () => {
    // A (cookie) provisiona el admin; B entra como member.
    expect((await put("/api/notes/2026-09-10", { text: "de A" })).status).toBe(
      200,
    );
    expect(
      (await devSend("/api/notes/2026-09-10", "PUT", { text: "de B" }, B))
        .status,
    ).toBe(200);

    expect((await body(await get("/api/notes/2026-09-10"))).text).toBe("de A");
    expect((await body(await devGet("/api/notes/2026-09-10", B))).text).toBe(
      "de B",
    );

    // Un día que solo tiene A sale vacío para B (no se mezclan): 200 sin texto.
    await put("/api/notes/2026-09-11", { text: "solo A" });
    expect((await body(await devGet("/api/notes/2026-09-11", B))).text).toBe(
      "",
    );
  });
});
