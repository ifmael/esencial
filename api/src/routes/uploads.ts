// E8 BFF de subida R2: POST /api/uploads multipart campo "file"
// (png|jpeg|webp, ≤ 5_000_000 bytes) → 200 {photo_path}; GET /api/uploads/:key →
// bytes + Content-Type almacenado + Cache-Control immutable, 404 {error}.
// El 401 lo pone el authGuard global (middleware.ts); aquí no se repite.
import { Hono } from "hono";
import type { Env } from "../db";
import { fail } from "../http";

const MAX_BYTES = 5_000_000;
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const uploads = new Hono<{ Bindings: Env }>()

  .post("/", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = await c.req.parseBody();
    } catch {
      return fail("Invalid multipart body", "file");
    }
    const file = body["file"];
    if (!(file instanceof File)) return fail("Missing file", "file");
    const ext = MIME_TO_EXT[file.type];
    if (!ext) return fail("Tipo no permitido (png, jpeg o webp)", "file");
    if (file.size > MAX_BYTES) return fail("El archivo supera los 5 MB", "file", 413);

    const key = `recipe-${crypto.randomUUID()}.${ext}`;
    const bytes = await file.arrayBuffer();
    await c.env.PHOTOS.put(key, bytes, {
      httpMetadata: { contentType: file.type },
    });
    return c.json({ photo_path: key });
  })

  .get("/:key", async (c) => {
    const key = c.req.param("key");
    const obj = await c.env.PHOTOS.get(key);
    if (!obj) return fail("Not found", undefined, 404);
    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set(
      "Cache-Control",
      "private, max-age=31536000, immutable",
    );
    headers.set("etag", obj.httpEtag);
    return new Response(obj.body, { headers });
  });
