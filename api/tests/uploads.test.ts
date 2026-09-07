// E8 RED tests: POST /api/uploads contract, written BEFORE any implementation.
// Black-box HTTP only (helpers app.request + real-login cookie + freshDb):
// no R2 binding needed — if /api/uploads doesn't exist these fail on 404/gate
// responses, which is the RED state.
// Contract:
// - POST /api/uploads multipart/form-data, campo "file":
//   401 sin sesión (authGuard global); 400 {error, field:"file"} si falta
//   archivo o el tipo no está permitido; 413 {error, field:"file"} si el
//   tamaño supera 5_000_000 bytes; 200 {photo_path:"recipe-<uuid>.<png|jpg|webp>"}
//   (la key R2) con bytes guardados con httpMetadata.contentType.
// - GET /api/uploads/:key → 200 bytes + Content-Type almacenado +
//   Cache-Control private, max-age=31536000, immutable; 404 {error} si no existe.
import { beforeAll, describe, expect, it } from "vitest";
import { anonPostForm, freshDb, get, post, postForm } from "./helpers";

beforeAll(freshDb);

async function body(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// 1x1 PNG real (firma válida) — 8 bytes de datos suficientes para el contrato.
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

function pngForm(): FormData {
  const form = new FormData();
  form.append("file", new File([PNG], "foto.png", { type: "image/png" }));
  return form;
}

function formWith(name: string, file: File): FormData {
  const form = new FormData();
  form.append(name, file);
  return form;
}

describe("POST /api/uploads", () => {
  it("401 sin sesión (authGuard global)", async () => {
    const res = await anonPostForm("/api/uploads", pngForm());
    expect(res.status).toBe(401);
  });

  it("200 con PNG válido: photo_path recipe-<uuid>.png", async () => {
    const res = await postForm("/api/uploads", pngForm());
    expect(res.status).toBe(200);
    const r = await body(res);
    const m =
      /^recipe-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/.exec(
        String(r.photo_path),
      );
    expect(m).not.toBeNull();
  });

  it("400 {error, field:'file'} sin campo file", async () => {
    const form = new FormData();
    form.append("otro", "valor");
    const res = await postForm("/api/uploads", form);
    expect(res.status).toBe(400);
    const r = await body(res);
    expect(r.error).toBeTruthy();
    expect(r.field).toBe("file");
  });

  it("400 {error, field:'file'} con tipo no permitido (texto)", async () => {
    const form = formWith(
      "file",
      new File(["hola"], "nota.txt", { type: "text/plain" }),
    );
    const res = await postForm("/api/uploads", form);
    expect(res.status).toBe(400);
    const r = await body(res);
    expect(r.field).toBe("file");
  });

  it("413 {error, field:'file'} con tamaño > 5_000_000 bytes", async () => {
    const big = new File([new Uint8Array(5_000_001)], "grande.png", {
      type: "image/png",
    });
    const res = await postForm("/api/uploads", formWith("file", big));
    expect(res.status).toBe(413);
    const r = await body(res);
    expect(r.field).toBe("file");
  });
});

describe("GET /api/uploads/:key", () => {
  it("200 bytes + Content-Type almacenado + Cache-Control immutable", async () => {
    const up = await postForm("/api/uploads", pngForm());
    expect(up.status).toBe(200);
    const { photo_path } = (await up.json()) as { photo_path: string };
    const res = await get(`/api/uploads/${photo_path}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(
      "private, max-age=31536000, immutable",
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(PNG);
  });

  it("404 {error, field:'key'} para clave inexistente", async () => {
    const res = await get(
      "/api/uploads/recipe-00000000-0000-4000-8000-000000000000.png",
    );
    expect(res.status).toBe(404);
    const r = await body(res);
    expect(r.error).toBeTruthy();
    expect(r.field).toBe("key");
  });
});

// Round-trip E8: subir foto → crear receta con photo_path = path devuelto →
// leerla de vuelta en GET /api/recipes/:id.
describe("E8 round-trip upload → recipe", () => {
  it("crear receta con photo_path del upload y leerla en GET /api/recipes/:id", async () => {
    const up = await postForm("/api/uploads", pngForm());
    expect(up.status).toBe(200);
    const { photo_path } = (await up.json()) as { photo_path: string };

    const createdRes = await post("/api/recipes", {
      name: "Tortilla",
      photo_path,
    });
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as Record<string, unknown>;
    const id = Number(created.id);

    const got = await body(await get(`/api/recipes/${id}`));
    expect(got.photo_path).toBe(photo_path);
  });
});
