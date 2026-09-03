# Spec — E7 auth

## ADDED Requirements

### Requirement: Password login endpoint
`POST /api/auth/login` MUST accept `{ password }` as a JSON body and MUST verify it against
the `PASSWORD_HASH` secret using PBKDF2-SHA256 with a constant-time comparison — the plaintext
password MUST NOT be stored or compared in the clear. On success it MUST respond `200` and set a
signed session cookie. On wrong password it MUST respond `401` with the envelope
`{ error: "Invalid credentials", field: "password" }` (Spanish copy is UI-side, per DESIGN.md voice).
On an unparseable or schema-invalid body it MUST respond `400` with `{ error, field? }`.

#### Scenarios
- Given the configured password is correct, When `POST /api/auth/login` sends it, Then the response is 200 and carries `Set-Cookie` with `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Given the password is wrong, When logging in, Then the response is 401 with the `{ error, field }` envelope and no cookie is set.
- Given the request body is not valid JSON or has no `password`, When logging in, Then the response is 400 with `{ error, field }` and the hash function is never called.

### Requirement: Signed stateless session
The session MUST be a stateless token signed with HMAC-SHA256 using the `AUTH_SECRET` secret,
carrying an expiry of 30 days. A request MUST be considered authenticated only when the cookie
verifies against the signature and the expiry is in the future. A malformed, tampered, or expired
token MUST be treated as no session (fail closed). Logout MUST clear the cookie (`Max-Age=0`).
No D1 table for users or sessions MAY be introduced.

#### Scenarios
- Given a valid session cookie, When any protected request is made, Then the request proceeds normally.
- Given a cookie whose payload was edited by one byte, When a protected request is made, Then the response is 401.
- Given a cookie past its expiry, When a protected request is made, Then the response is 401.
- Given an authenticated user, When `POST /api/auth/logout` is called, Then the response is 200 and the cookie is expired.

### Requirement: Auth status endpoint
`GET /api/auth/status` MUST respond `200` with `{ authenticated: true }` when a valid session
cookie is present and `{ authenticated: false }` when it is not. It MUST NOT return 401 — the SPA
uses it to decide where to render.

#### Scenarios
- Given no cookie, When `GET /api/auth/status`, Then 200 `{ authenticated: false }`.
- Given a valid cookie, When `GET /api/auth/status`, Then 200 `{ authenticated: true }`.

### Requirement: Protected API routes
Every route currently mounted under `/api/*` MUST require a valid session, with exactly two
allowlisted exceptions: `POST /api/auth/login` and `GET /api/health`. An unauthenticated request
to a protected route MUST return `401 { error: "Unauthorized" }`. An unauthenticated request to a
nonexistent path under `/api` MUST return `401` (the gate runs before the 404). Authenticated
behavior of all existing routes MUST be unchanged.

#### Scenarios
- Given no session, When `GET /api/recipes`, Then 401 with the JSON envelope and zero rows returned.
- Given no session, When each of the 13 existing endpoints is called with a valid method, Then all return 401 (contract test enumerates every mounted route).
- Given a valid session, When `GET /api/recipes` is called, Then 200 and the same payload shape as before E7.
- Given no session, When `GET /api/health`, Then 200 `{ ok: true }` (deploy probe stays open).
- Given no session, When `GET /api/does-not-exist`, Then 401 (not 404).

### Requirement: SPA page protection
Requests for HTML pages that are not `/login`, made without a valid session, MUST be answered
with `302` to `/login` carrying the original path as a `next` query parameter. `/login` and the
static assets needed to render it MUST be served without a session. The Worker MUST observe these
requests (static-asset bypass disabled via `run_worker_first`), and asset responses MUST pass
through unchanged.

#### Scenarios
- Given no session, When `GET /` (Accept: text/html), Then 302 to `/login?next=%2F`.
- Given no session, When `GET /plan-recetas`, Then 302 to `/login?next=%2Fplan-recetas`.
- Given no session, When `GET /login`, Then 200 and the SPA shell is served.
- Given a valid session, When `GET /`, Then 200 (no redirect loop).

### Requirement: Login screen
The SPA MUST provide `/login`: a centered card (DESIGN.md system) with the title "Esencial", a
required password input, and a primary button labeled "Entrar". Submitting MUST `POST` JSON to
`/api/auth/login` with a pending button state. `401` MUST show "Contraseña incorrecta" tied to the
password field; `429` MUST show a wait message; success MUST navigate to `next` (or `/`).

#### Scenarios
- Given the user types the correct password and submits, Then the app lands on `/` and the data screens load.
- Given a wrong password, Then an inline error appears under the field and the user stays on `/login` with no other navigation.
- Given a submit while the request is pending, Then the button is disabled and no second request is sent.

### Requirement: Client-side session guard
On startup the SPA MUST consult `GET /api/auth/status`; when it reports unauthenticated, the app
MUST redirect to `/login?next=<current path>`. This guard is UX defense-in-depth and MUST NOT be
the only protection — the server-side 401 gate remains authoritative.

#### Scenarios
- Given an unauthenticated visitor lands on `/plan-fuerza`, Then they are redirected to `/login?next=%2Fplan-fuerza` and no recipe data is fetched or rendered.
- Given a returning authenticated user, Then `/` renders directly with no login flash.

### Requirement: Login rate limit
Failed login attempts MUST be counted per client IP (from `CF-Connecting-IP`, fallback `"unknown"`)
in an in-process window of 15 minutes. From the 6th attempt inside the window the endpoint MUST
return `429 { error: "Too many attempts", field: "login" }` even when the password is correct. A
successful login MUST reset that IP's counter. The limit is per isolate; its ceiling and the
Durable Object upgrade path MUST be documented in code.

#### Scenarios
- Given 5 consecutive failures from one IP, When a 6th login is attempted with the correct password, Then 429 and no cookie is set.
- Given a successful login from an IP that previously failed, When the window is still open, Then the counter is reset for that IP.
- Given 4 failures followed by a correct attempt, Then login succeeds (threshold is exceeded failures, not total).

### Requirement: Security headers
Every Worker response (API and asset) MUST include: `Content-Security-Policy` starting with
`default-src 'self'` (with `img-src 'self' data: blob:` and `style-src 'self' 'unsafe-inline'`),
`X-Content-Type-Options: nosniff`, and `Referrer-Policy: same-origin`. The SPA MUST NOT load any
third-party script origin.

#### Scenarios
- Given `GET /` (asset response), Then the three headers are present.
- Given an authenticated `GET /api/recipes`, Then the three headers are present alongside the JSON body.
- Given a 401 gate response, Then the headers are present too.

### Requirement: Credential provisioning
`AUTH_SECRET` and `PASSWORD_HASH` MUST be provided as Worker secrets (`wrangler secret put`) in
production and as `.dev.vars` locally; they MUST NOT be committed nor placed in `wrangler.toml`
vars. A local script MUST generate the `PASSWORD_HASH` value. Changing the password MUST be a
documented two-command rotation (regenerate digest, `secret put`). Missing secrets MUST fail
requests closed (500/401, never an open route).

#### Scenarios
- Given `AUTH_SECRET` unset, When a login is attempted, Then the endpoint fails (no unsigned/insecure cookie is ever issued).
- Given the repository checked out, Then no committed file contains a password, digest, or signing key (`.dev.vars` is gitignored; only `.dev.vars.example` is tracked).
