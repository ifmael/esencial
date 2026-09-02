# Tasks — E7 auth

> Decision gate first: task 0 is the user confirming option A (design D1). Nothing below
> assumes B or C. Strict TDD: every RED task lands failing, the matching GREEN makes it pass.

## 0. Decisión (usuario)
- [x] 0.1 Confirmar opción A (password + cookie firmada en casa) o cambiar a B/C en design D1; marcar la decisión en este change antes de escribir código.

## 1. Crypto y sesión (TDD, api/src/auth.ts)
- [x] 1.1 RED: tests de `hashPassword`/`verifyPassword` (round-trip OK; contraseña distinta falla; formato `pbkdf2$iter$salt$hash`; verificación no compara en claro — se comprueba que el digest corrupto de un byte cambia el resultado)
- [x] 1.2 GREEN: PBKDF2-SHA256 ≥210k iter, salt aleatorio, constant-time compare sobre digests (Web Crypto, sin deps)
- [x] 1.3 RED: tests de sesión firmada: token válido → `{exp}`; token manipulado/expirado/garbage → null (fail closed)
- [x] 1.4 GREEN: helpers `createSessionToken(secret, exp)` / `readSessionToken(secret, raw)` sobre `setSignedCookie`/`getSignedCookie` de Hono
- [x] 1.5 RED+GREEN: `api/scripts/hash-password.ts` — CLI local que imprime el digest para `wrangler secret put` (smoke: hash → verify en el mismo script)

## 2. Endpoints de auth (TDD, api/src/routes/auth.ts)
- [x] 2.1 RED: `POST /api/auth/login` — 200 + `Set-Cookie` (HttpOnly; Secure; SameSite=Lax; Path=/) con password correcta; 401 `{error, field}` con incorrecta; 400 `{error, field}` con body inválido/falta password
- [x] 2.2 GREEN: handler de login contra `PASSWORD_HASH`, cookie 30 días vía helper de 1.4
- [x] 2.3 RED+GREEN: `POST /api/auth/logout` borra cookie (Max-Age=0); `GET /api/auth/status` → `{authenticated:true|false}` según cookie, 200 en ambos casos
- [x] 2.4 RED: rate-limit: 5 fallos desde la misma IP → 6º intento `429 {error:"Too many attempts"}` aunque la password sea correcta; éxito resetea; ventana 15 min (reloje inyectable en el helper para test determinista)
- [x] 2.5 GREEN: Map in-process con `ponytail:` comentario de ceiling + upgrade a DO

## 3. Middleware de protección (TDD)
- [x] 3.1 RED: contrato de gate — para CADA una de las 13 rutas E1/CM1 montadas: sin cookie → 401 envelope `{error:"Unauthorized"}`; con cookie → comportamiento previo intacto (reusable helper `authedFetch` en `api/tests/helpers.ts`)
- [x] 3.2 GREEN: `authGuard` en `/api/*` con allowlist exacta (`POST /api/auth/login`, `GET /api/health`)
- [x] 3.3 RED: `/api/health` sigue 200 sin sesión; `/api/nope` sin sesión → 401 (no 404: el gate manda); ruta `GET /` HTML sin sesión → `302` a `/login?next=%2F`; `/login` y assets → 200 sin sesión
- [x] 3.4 GREEN: guard de páginas + `run_worker_first = true` en `[assets]` de `wrangler.toml`; servir vía `env.ASSETS.fetch` lo permitido
- [x] 3.5 RED+GREEN: security headers en toda respuesta (API 200/401, assets): CSP `default-src 'self'…`, `nosniff`, `Referrer-Policy: same-origin`

## 4. SPA: login + guard de cliente (TDD, web/)
- [x] 4.1 RED+GREEN: `/login` renderiza card DESIGN.md (campo password, botón "Entrar"); submit → POST con `Content-Type: application/json`; 401 → error bajo el campo; 429 → mensaje de espera (testing-library, fetch mockeado)
- [x] 4.2 RED+GREEN: éxito → `navigate(next ?? "/")`; guard de arranque: `GET /api/auth/status` false → redirect a `/login?next=<ruta>`; true → render normal
- [x] 4.3 RED+GREEN: botón logout → `POST /api/auth/logout` → a `/login`
- [x] 4.4 Actualizar los tests existentes de `web/` que navegan routes: mock de `/api/auth/status` autenticado (los casos de shell/día no deben cambiar de comportamiento)

## 5. Configuración y docs
- [x] 5.1 `api/wrangler.test.toml`: `vars` de prueba (`AUTH_SECRET`, `PASSWORD_HASH` de `test-password-123`); `.dev.vars.example` + gitignore; tipos en `api/src/env.d.ts` y `api/src/db.ts` (`Env`)
- [x] 5.2 `DEPLOY.md`: checklist — `wrangler secret put AUTH_SECRET|PASSWORD_HASH`, script de hashing, verificación post-deploy (`curl /api/health` 200 sin sesión, `GET /` 302, login manual) y rollback (revert commit; secretos inertes)
- [x] 5.3 Spec-lectura-es.md revisado contra spec.md (paridad de escenarios)

## 6. Verify & close
- [x] 6.1 Suite completa verde (`pnpm test` api + web) sin tocar project-site/
- [x] 6.2 Smoke manual con `wrangler dev`: cerrar sesión → `curl -i localhost:8787/` 302; `curl localhost:8787/api/recipes` 401; login por UI → recipes 200; logout → 401 otra vez
- [x] 6.3 Marcar decisión D1 confirmada en design.md, archive del change, evaluación conjunta
