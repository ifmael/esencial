# Design: Nueva receta (página dedicada + subida R2)

## Technical Approach

Add a dedicated create page `/recetario/nueva` that reuses the form extracted from the RecipeEditor modal (the modal becomes edit-only). Photos upload through a new Hono routes file `api/src/routes/uploads.ts`: `POST /api/uploads` accepts multipart field `file` (`image/png|jpeg|webp`, ≤ 5 MB), validates via zod, stores bytes in R2 bucket `esencial-photos` (binding `PHOTOS`) under a flat key `recipe-<uuid>.<ext>`, and returns `{ photo_path }`; `GET /api/uploads/:key` serves the object behind the existing `authGuard` with `Cache-Control: immutable`. Recipe creation reuses the existing `POST /api/recipes` zod path; the handler additionally rejects a `photo_path` that is not a valid upload key present in R2 (fail closed). `photo_path TEXT` already exists in the schema — no DDL change. All failures reuse the existing `{ error, field }` envelope (`fail()` helper, `zBody` pattern). Orphan objects from a failed create are accepted (orphan cleanup is out of scope); re-submission uploads a new key.

## Architecture Decisions

### Decision: R2 binding `PHOTOS` → `esencial-photos` (not D1 blob, not public bucket URL)

**Choice**: `[[r2_buckets]]` binding `PHOTOS` → bucket `esencial-photos` in `wrangler.toml`; `Env` gains `PHOTOS?: R2Bucket`; bytes are served only through authenticated `GET /api/uploads/:key`.

**Alternatives considered**: D1 `BLOB` column — D1 is a row store, not an object store; binaries bloat the DB and bypass CDN caching. Public bucket URL — every photo would be browsable by anyone with the URL and bypasses the app's auth boundary.

**Rationale**: R2 is the platform-native object store for a Cloudflare Worker, so no new dependency or infra. Public URLs break photo access control (personal wellness data); serving through one authenticated endpoint keeps a single access path.

### Decision: Flat keys `recipe-<uuid>.<ext>`

**Choice**: `recipe-${crypto.randomUUID()}.${ext}` where ext maps from the validated mime (`png` | `jpg` | `webp`).

**Alternatives considered**: per-user folder `users/<id>/...` — requires a session/user lookup at upload time and adds nesting for no access-control gain (the GET gate, not the key, enforces auth). Content-hash keys — dedup buys nothing here (no quota/orphan management in scope) and adds hashing cost.

**Rationale**: Flat namespace is collision-free with a stdlib one-liner and keeps `photo_path` a simple opaque string. Access control lives at the GET, so key shape carries no security weight.

### Decision: Single `POST /api/uploads` (multipart, field `file`) + `GET /api/uploads/:key`

**Choice**: `.route("/uploads", uploads)` in `api/src/index.ts`; `POST /` parses multipart with `c.req.parseBody()`, `PUT`s to R2, returns `{ photo_path }`; `GET /:key` serves bytes.

**Alternatives considered**: presigned R2 direct upload — AWS-style signature plumbing, more client logic, and bytes land in the bucket before any server-side validation (breaks the fail-closed spec); base64 in JSON — 33% overhead, memory spike, and the JSON `zBody` path cannot stream; nested multipart on `POST /api/recipes` — muddies recipe validation and forces a photo on every create.

**Rationale**: Multipart through our own Worker keeps validation in one zod step before `PHOTOS.put` — fail closed by construction. A separate upload endpoint lets the page upload first, then create, and lets a recipe exist without a photo.

### Decision: `photo_path` = returned key, reusing the existing `TEXT` column (no migration)

**Choice**: `photo_path` stores the R2 key (`recipe-<uuid>.<ext>`); column stays `TEXT` as-is. The web renders `<img src={"/api/uploads/" + photo_path}>`.

**Alternatives considered**: storing a full URL — the key is the stable identifier; URL derivation is a client concern. New `photo_key` column — redundant with the existing nullable `photo_path`.

**Rationale**: No data-model change → migration notes: none needed, `photo_path TEXT` already exists. Storing the key keeps the DB host/origin-agnostic; the authenticated GET maps key → bytes.

### Decision: `Cache-Control: immutable` on `GET /api/uploads/:key`

**Choice**: `new Response(object.body, { headers: { "content-type": storedMime, "cache-control": "private, max-age=31536000, immutable" } })`.

**Alternatives considered**: no-cache — forces a full re-download every render; `max-age` without `immutable` — revalidation round trips; `public` — shared caches could store authenticated content.

**Rationale**: Keys are immutable by design (uuid, never overwritten), so `immutable` is the exact cache contract and re-uploads produce new keys — staleness is impossible. `private` keeps bytes in the browser cache only.

### Decision: Error envelope `{ error, field }` on all upload failures

**Choice**: reuse `fail(error, field, status)` from `api/src/http.ts`: missing file → 400 `field: "file"`; disallowed type → 400 `field: "file"`; malformed multipart → 400 `field: "file"`; size > 5 MB → 413 `field: "file"`; unknown key → 404 `field: "key"`; invalid `photo_path` on create → 400 `field: "photo_path"`.

**Alternatives considered**: plain 400 text — the form already renders per-field `FieldError`s; a second error shape for uploads — two contracts to maintain.

**Rationale**: Matches the existing zod envelope byte-for-byte, so the extracted form and `uploadPhoto` helper can render field errors with the existing `FieldError` type.

### Decision: Dedicated page `/recetario/nueva` with extracted reusable form; modal edit-only

**Choice**: new route `/recetario/nueva` (registered before `/recetario/:id`) renders a full-page form (name, description, servings, ingredients, steps, materials, tags, photo file input). The modal's draft/field markup is extracted into a shared `RecipeForm` component; `RecipeEditor` becomes an edit-only wrapper (no blank draft, no create path); the "Nueva receta" action navigates to the page.

**Alternatives considered**: keep modal create and add a photo field — spec requires the modal MUST NOT create; a second duplicate form — the two forms drift.

**Rationale**: One form, two containers; the modal's create branch is deleted rather than gated, satisfying the spec by construction.

### Decision: `photo_path` validated at recipe create (fail closed)

**Choice**: in `POST /api/recipes`, when `photo_path` is present: match `^recipe-[0-9a-f-]{36}\.(png|jpe?g|webp)$` and require `env.PHOTOS.head(key)` to exist; otherwise 400 `{ error, field: "photo_path" }` and nothing persisted. A missing `PHOTOS` binding fails closed.

**Alternatives considered**: trusting the client string — spec REQUIRES rejecting paths not returned by an upload; format-only check — an arbitrary key renders a broken image.

**Rationale**: Spec `RECIPE_CREATE` demands fail closed; `head` is a cheap existence probe and the format guard blocks non-image keys.

## Data Flow

```
Browser (form submit)
   │  file input (png/jpeg/webp)
   ▼
POST /api/uploads  (multipart, field "file")
   │  zod: mime + size ≤ 5MB ── fail → 400/413 { error, field: "file" }
   ▼
env.PHOTOS.put("recipe-<uuid>.<ext>", bytes, { httpMetadata: { contentType } })
   │
   ▼
200 { photo_path: "recipe-<uuid>.<ext>" }
   │
   ▼
POST /api/recipes { name, ..., photo_path }
   │  zod body + photo_path regex + env.PHOTOS.head(key) ── fail → 400 { error, field: "photo_path" }
   ▼
D1 INSERT (photo_path TEXT) → 201 recipe → navigate /recetario/:id

GET /api/uploads/:key
   │  authGuard (existing /api/* gate; 401 without session)
   ▼
env.PHOTOS.get(key) ── missing → 404 { error, field: "key" }
   ▼
200 bytes + Content-Type + Cache-Control: immutable → <img>
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `api/src/routes/uploads.ts` | Create | POST multipart → R2 put (fail closed); GET key → bytes + immutable (404 envelope) |
| `api/src/index.ts` | Modify | `.route("/uploads", uploads)` under `/api` |
| `api/src/db.ts` | Modify | `Env` adds `PHOTOS?: R2Bucket` |
| `api/src/api-validation.ts` | Modify | `uploadFileSchema` (png/jpeg/webp, ≤ 5 MB) |
| `api/src/routes/recipes.ts` | Modify | POST validates `photo_path` (regex + `PHOTOS.head`) fail closed |
| `wrangler.toml` | Modify | `[[r2_buckets]]` binding `PHOTOS` → `esencial-photos` |
| `web/src/app.tsx` | Modify | Route `/recetario/nueva` (before `/recetario/:id`) |
| `web/src/routes/nueva-receta.tsx` | Create | Create page: form, upload-then-create, navigate |
| `web/src/components/recipes/recipe-editor.tsx` | Modify | Extract `RecipeForm`; modal edit-only; photo file input/preview |
| `web/src/routes/recetario.tsx` | Modify | "Nueva receta" navigates; `Thumb`/detail `img` src `/api/uploads/${photo_path}` |
| `web/src/components/recipes/use-recipes.ts` | Modify | `uploadPhoto(file)` helper (FormData → `/api/uploads`) |
| `api/tests/uploads.test.ts` | Create | Vitest/miniflare upload + serve boundary tests |
| `e2e/tests/nueva-receta.spec.ts` | Create | Playwright create-with-photo + upload-failure |

## Interfaces / Contracts

```ts
// api/src/db.ts
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  PHOTOS?: R2Bucket; // R2 esencial-photos; optional so a missing binding fails closed
  AUTH_SECRET?: string;
  PASSWORD_HASH?: string;
};
```

```ts
// api/src/api-validation.ts
export const uploadFileSchema = z
  .instanceof(File)
  .refine((f) => ["image/png", "image/jpeg", "image/webp"].includes(f.type), {
    message: "Only png, jpeg or webp images are allowed",
  })
  .refine((f) => f.size <= 5 * 1024 * 1024, { message: "Image exceeds 5 MB" });
```

```ts
// Contracts (envelope identical to the existing zod path)
// 200 POST /api/uploads          → { photo_path: string }            // recipe-<uuid>.<ext>
// 400/413 POST /api/uploads      → { error: string; field: string }
// 200 GET /api/uploads/:key      → bytes; headers: content-type, cache-control: immutable
// 404 GET /api/uploads/:key      → { error: string; field: "key" }
// 401 GET/POST /api/uploads/*    → { error: "Unauthorized" }         // existing authGuard
```

```ts
// web/src/components/recipes/use-recipes.ts
export async function uploadPhoto(file: File): Promise<{ photo_path: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads", { method: "POST", body: fd });
  if (!res.ok) throw new Error((await res.json()).error ?? "Upload failed");
  return res.json();
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit (api) | Upload boundaries: happy path, missing file, gif → 400, > 5 MB → 413, malformed → 400, nothing stored on failure; GET serve (bytes + immutable, 404 unknown, 401 anon); recipes rejects invalid `photo_path` | Vitest + miniflare helpers (`api/tests/uploads.test.ts`, extends `recipes.test.ts`) |
| Unit (web) | `uploadPhoto` helper (FormData shape, error envelope); `RecipeForm` submit → upload then create; modal edit-only (no create call) | Vitest (existing web test setup) |
| E2E | Create-with-photo on `/recetario/nueva` (`setInputFiles` → photo renders); upload-failure banner; "Nueva receta" navigation; modal edit-only | Playwright `e2e/tests/nueva-receta.spec.ts` (webServer `pnpm dev`, password `hola`) |

## Threat Matrix

`N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.`

The change only adds ordinary HTTP/SPA routes and a Worker binding; it touches no git/PR/shell/documentation-path boundary, so no threat-matrix row applies.

## Migration / Rollout

No migration required — `photo_path TEXT` already exists; no DDL change. Pre-deploy: create bucket `esencial-photos` (production) and add the `[[r2_buckets]]` binding; `wrangler dev` exercises R2 locally through the binding. Rollback: revert the feature commits — remove `[[r2_buckets]]`, delete the uploads route and create page; `photo_path` stays NULL and recipes render as today; orphan objects deletable out of band.

## Open Questions

None.
