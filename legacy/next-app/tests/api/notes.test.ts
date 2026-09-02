// 7.1 RED+GREEN: per-day notes — PUT upserts, GET reads, re-save replaces.
import { afterAll, describe, expect, it } from "vitest";
import { useTempDb, call, get, put } from "../helpers";
import * as notes from "@/app/api/notes/[date]/route";

const cleanup = useTempDb();
afterAll(cleanup);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

describe("/api/notes/[date]", () => {
  it("PUT then GET returns the text", async () => {
    const res = await call(notes.PUT, put("/api/notes/2026-09-02", { text: "dormí bien" }), {
      date: "2026-09-02",
    });
    expect(res.status).toBe(200);
    const got = await call(notes.GET, get("/api/notes/2026-09-02"), { date: "2026-09-02" });
    expect(got.status).toBe(200);
    expect(await got.json()).toEqual({ date: "2026-09-02", text: "dormí bien" });
  });

  it("re-saving replaces the text (one note per day)", async () => {
    await call(notes.PUT, put("/api/notes/2026-09-03", { text: "primera" }), { date: "2026-09-03" });
    await call(notes.PUT, put("/api/notes/2026-09-03", { text: "segunda" }), { date: "2026-09-03" });
    const got = await body(await call(notes.GET, get("/api/notes/2026-09-03"), { date: "2026-09-03" }));
    expect(got.text).toBe("segunda");
  });

  it("empty text clears the note body but stays readable", async () => {
    await call(notes.PUT, put("/api/notes/2026-09-04", { text: "" }), { date: "2026-09-04" });
    const got = await body(await call(notes.GET, get("/api/notes/2026-09-04"), { date: "2026-09-04" }));
    expect(got.text).toBe("");
  });

  it("GET unknown date → 200 with empty text", async () => {
    const res = await call(notes.GET, get("/api/notes/2019-05-05"), { date: "2019-05-05" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ date: "2019-05-05", text: "" });
  });

  it("400 on invalid date", async () => {
    const res = await call(notes.PUT, put("/api/notes/ayer", { text: "x" }), { date: "ayer" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("date");
  });

  it("400 when text missing", async () => {
    const res = await call(notes.PUT, put("/api/notes/2026-09-05", {}), { date: "2026-09-05" });
    expect(res.status).toBe(400);
    expect((await body(res)).field).toBe("text");
  });
});
