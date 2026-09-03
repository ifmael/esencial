# Proposal — E7 auth: single-user login + hardening

## Why

The app will live on a public Cloudflare Workers URL (workers.dev subdomain). Today every `/api/*` route and every SPA page is open to anyone who finds the URL — unacceptable for personal meal plans, workout logs and health notes. E0–E6 deliberately deferred auth ("auth (E7)" is a non-goal in every prior change). This is the last MVP epic: one gate, one user, no accounts.

The project-site roadmap originally decided "contraseña única con cookie de sesión (middleware)" on Next.js (decision 2026-09-02). CM1 moved the stack to a single Cloudflare Worker; the middleware idea survives, but the platform now offers two credible alternatives (Cloudflare Access, Turnstile). This change inventories all three, decides one, and specifies the screen, the route protection, security headers and a minimal login rate-limit.

## What Changes

- **Decision (this change's core)**: authenticate with a single password checked by the Worker, issuing a **stateless HMAC-signed session cookie** via Hono middleware (option A). Cloudflare Access (B) and Workers + Turnstile (C) are evaluated and rejected for MVP with rationale — see design D1. This remains an **open decision for the user**; option A is the recommendation, not a fait accompli.
- **Login screen** `/login` in the SPA (React): password field, submit, error state — DESIGN.md system (surface card, #15803D primary).
- **Auth API** on the existing Worker: `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/status` — same `{ error, field? }` envelope as the 13 existing routes.
- **Route protection**: every `/api/*` route except `POST /api/auth/login` and `GET /api/health` MUST return `401 { error: "Unauthorized" }` without a valid session cookie. Unauthenticated HTML page requests MUST be redirected to `/login`. `/api/health` stays open for the deploy checklist.
- **Security headers**: minimal CSP (`default-src 'self'`) plus `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin` on every response.
- **Login rate limit**: in-process per-IP counter (failed attempts → `429` after a small threshold). Deliberately minimal; ceiling documented.
- **Config**: two new Worker secrets (`AUTH_SECRET` cookie-signing key, `PASSWORD_HASH` PBKDF2 digest of the password) — no D1 schema change.

## Scope

- Non-goals: multi-user accounts, password reset / in-app password change (rotation = `wrangler secret put`, documented), OAuth/OIDC, TOTP, session revocation list, durable-objects rate limit, Turnstile integration (may be added later as a complement, not identity).

## Risks

- Medium: touches every request path (middleware in front of all routes). Mitigated: the existing API tests run through the same stack after provisioning test secrets in `wrangler.test.toml` (every request obtains a cookie via `POST /api/auth/login`), plus a dedicated contract test that the 401 gate covers every mounted route.
- Low: timing attacks on the password comparison — mitigated by constant-time compare over PBKDF2 digests (never compare plaintext).
- Low: in-memory rate limit resets per isolate and per cold start — accepted for MVP (single personal user; threshold is a nuisance brake, not a wall). Upgrade path (Durable Object) named in design D5.
- Rollback plan: auth is one middleware + one route module. Revert = remove `.use(...)` wiring + `web` guard (single commit, no schema/data migration, nothing to unwind in D1). Secrets can stay; unused bindings are inert.

## Decision

Approve the direction of this change (option A recommended — rationale per option in design D1).
