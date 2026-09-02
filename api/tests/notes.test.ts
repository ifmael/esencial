// E1 parity: per-day notes — PUT upserts, GET reads, re-save replaces.
import { beforeAll, describe, expect, it } from "vitest";
import { freshDb, get, put } from "./helpers";

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
    expect(await got.json()).toEqual({ date: "2026-09-02", text: "dormí bien" });
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
