# Design — E7 auth

## D1: Opciones evaluadas y decisión (ABIERTA al usuario)

Un solo usuario, una app personal, deploy en Workers. Tres opciones inventariadas:

### Opción A (RECOMENDADA): password + cookie de sesión firmada, hecha en casa

El Worker verifica una contraseña única contra un digest PBKDF2 (env secret) y emite una
cookie de sesión firmada con HMAC usando Hono's `setSignedCookie`/`getSignedCookie`
(viene en `hono`, ya instalado — cero dependencias nuevas). Middleware Hono rechaza con
401 toda ruta `/api/*` sin cookie válida.

- (+) Control total, cero dependencia de plan de Cloudflare, funciona igual en `wrangler dev` local.
- (+) Reutiliza lo que ya existe: Hono middleware + Web Crypto (`crypto.subtle.deriveBits` PBKDF2, `HMAC-SHA256`).
- (+) Preserva la decisión histórica del roadmap ("contraseña única con cookie de sesión (middleware)"), solo trasladada de Next a Workers.
- (−) El código de sesión es nuestro: hay que acertar con hashing, constant-time compare, flags de cookie. Riesgo acotado por tests de contrato (este spec los exige).
- (−) Sin defensa anti-credential-stuffing más allá del rate-limit propio (mitigable añadiendo Turnstile después sin cambiar la identidad — las opciones no son excluyentes en ese punto).

### Opción B: Cloudflare Access (Zero Trust) como capa externa

Redirect OIDC al login de Cloudflare delante del dominio; el Worker ni ve credenciales
(valida el header `Cf-Access-Jwt-Assertion` si quiere).

- (+) Autenticación fuerte, mTLS, dispositivos gestionados; literalmente cero código de login.
- (−) Acopla la app a un dominio/custom hostname y a la consola de Zero Trust: hoy el deploy es un subdominio workers.dev, donde Access no se antepone sin configurar el dominio. CM1 difirió explícitamente el custom domain.
- (−) La sesión vive fuera de la app: no hay logout ni expiración controlables desde la UI; el "pantalla de login" del spec quedaría vacío (lo renderiza Cloudflare).
- (−) Peor desarrollo local: `wrangler dev` no simula Access; todo test de la app real exige saltarse la capa o un túnel.
- Veredicto: excelente para uso diario estable con dominio propio; la decisión A no la cierra (migrar a B o combinar A+B es un cambio pequeño cuando haya dominio). Para el MVP workers.dev, A.

### Opción C: Turnstile (anti-bot) + workers_auth (librería de sesiones firmadas)

Turnstile resuelve el "¿eres humano?" en el POST de login; `workers_auth` (paquete de terceros)
gestiona la cookie firmada.

- (+) Turnstile gratis y mata el credential-stuffing automatizado — pero no es identidad: sigue haciendo falta A.
- (−) `workers_auth` es una dependencia externa que hace lo que `setSignedCookie` de Hono ya hace (ladder: no añadir un paquete para lo que el framework resuelve). Rechazada la librería; **Turnstile se acepta como mejora futura opcional** (complemento, no alternativa).
- Veredicto: se absorbe lo útil (Turnstile puede añadirse después delante del login) y se rechaza lo redundante.

**Decisión: A.** Sesión hecha en casa sobre primitives ya instaladas, porque el MVP corre en
workers.dev sin dominio, el desarrollo local debe funcionar con `wrangler dev`, y la UI necesita
login/logout propios. Rationale completo contra B y C arriba. **Presentada como decisión abierta:
el usuario puede cambiar a B cuando compre dominio** (migración: antepone Access, desactiva el
middleware con un flag de env; el código de sesión no estorba).

## D2: Credenciales = dos secretos de env, cero tablas

- `PASSWORD_HASH`: digest PBKDF2-SHA256 (≥ 210 000 iteraciones, salt aleatorio embebido, formato `pbkdf2$<iter>$<salt_b64>$<hash_b64>`). Se genera una vez con un script local `api/scripts/hash-password.ts` (Node 24 tiene `crypto.webcrypto`) y se sube con `wrangler secret put PASSWORD_HASH`.
- `AUTH_SECRET`: clave HMAC-SHA256 para firmar la cookie (`wrangler secret put AUTH_SECRET`, 32 bytes aleatorios).
- La contraseña **nunca** se almacena ni se compara en claro: se deriva PBKDF2(password, salt) y se compara en constante de tiempo (`crypto.subtle.verify` de un HMAC sobre los digests, o `timingSafeEqual` manual sobre bytes) contra `PASSWORD_HASH`.
- Cambiar contraseña = regenerating digest + `secret put`. Sin reset por email (non-goal; personal y LAN→CF de un usuario).
- **Sin cambio de esquema D1**: nada de tablas de usuarios/sesiones. La sesión es stateless (D3), el rate-limit es volatile (D5). Migration notes: N/A — ninguna.

## D3: Sesión = cookie firmada stateless

- Valor: `<exp_epoch>.<hmac_sha256(AUTH_SECRET, exp_epoch)>` (hex/base64url). `getSignedCookie` de Hono hace el verify + constant-time internamente — no se reimplementa.
- Flags: `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`. Sin `__Host-` prefix: workers.dev sirve en subdominio y el prefix exigiría omitir `Domain` — se usa `Path=/` sin `Domain` (equivalente funcional, documento el porqué en tests).
- Expiración: 30 días (app personal de un usuario; renovar es trivial). Token inválido → treat as no session (fail closed: malformed ≠ anonymous-but-allowed).
- Logout: `POST /api/auth/logout` borra la cookie (Max-Age=0). Sin lista de revocación (non-goal MVP: robar la cookie = tener el navegador del usuario; ceiling documentado, upgrade → tabla de sesiones o `jti` en KV si algún día importa).
- CSRF: SameSite=Lax + endpoints JSON con `Content-Type: application/json` obligatorios (el preflight CORS del cross-site no existe en este origen) → superficie mínima aceptable para single-user. Documentado como riesgo residual.

## D4: Middlewares — orden, alcance y assets

Orden en `api/src/index.ts` (app raíz, antes del `notFound` actual):

1. `securityHeaders` (on every response): `Content-Security-Policy: default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`. (`'unsafe-inline'` en style es necesario hoy: Tailwind v4 inyecta `<style>` en dev y el build puede emitir assets inline; se revisa al quitar.)
2. `authGuard` en `/api/*` salvo `POST /api/auth/login` y `GET /api/health` → 401 `json({ error: "Unauthorized" })` (mismo envelope `fail()` que el resto).
3. Página-HTML guard: `run_worker_first = true` en la sección `[assets]` de `wrangler.toml` — sin él, las peticiones que casan con un asset NUNCA llegan al Worker y no se puede proteger la SPA. Con él, el Worker ve todo: paths no-API sin sesión → `302` a `/login?next=<path>` (excepto `/login` y sus assets: se sirven directo vía `env.ASSETS.fetch`).

**Aclaración honesta de seguridad**: proteger el HTML es UX, no seguridad — el bundle JS es
público una vez servido. La frontera real es el gate 401 en `/api/*` (los datos viven en D1,
solo accesibles vía API). El redirect a `/login` existe para que el usuario no vea una shell
rota. Especificado así en el spec para que el test lo exija donde aplica (HTML, no assets).

- `/api/health` se deja abierto para el checklist de deploy (`curl /api/health` post-deploy sin sesión). Sin datos, solo `{ ok: true }`.
- Dev local: `.dev.vars` (gitignored) con `PASSWORD_HASH`/`AUTH_SECRET` de prueba documentados en `DEPLOY.md`; `vite dev` proxy `/api` no cambia (la cookie viaja same-origin vía el proxy, `credentials: "same-origin"` por defecto).

## D5: Rate-limit de login — in-memory deliberado

`Map<string, { count: number; resetAt: number }>` a nivel de módulo (por isolate): `ip` (primera
entrada de `CF-Connecting-IP`, fallback `no-ip`) + clave `login`; +1 por intento fallido; a los
`5` en ventana de `15min` → `429 json({ error: "Too many attempts", field: "login" })`. Éxito
reinicia el contador de esa IP. Entradas > 1 000 se podan por antigüedad en el acceso (O(1) amortizado).

**Ceiling (comentario `ponytail:` en el código)**: por isolate, se pierde en cold start; un
atacante distribuido por IP lo esquiva. Para un usuario personal con contraseña PBKDF2 es freno
de molestia, no muro. Upgrade path cuando duela: Durable Object singleton (mismo módulo, ~30 líneas).
No se hace hoy: DO añade bindings, config y tests que el MVP no paga.

## D6: SPA — pantalla de login y guard de cliente

- `/login` (route en `web/src/app.tsx`): card centrada (DESIGN.md: Surface, radius 12px, padding 16px), título "Esencial", input password, botón primario verde "Entrar". Submit → `POST /api/auth/login { password }`. 401 → error bajo el campo ("Contraseña incorrecta"), 429 → "Demasiados intentos, espera un momento". Éxito → `navigate(next ?? "/")`.
- Guard de sesión en cliente: al arrancar la app (`Shell` o wrapper), `GET /api/auth/status` (devuelve `{ authenticated: boolean }` leyendo su propia cookie, 200 siempre) → si `false`, `navigate("/login?next=…")`. Evita pantallas vacías y duplica el servidor (defense-in-depth de UX, no seguridad — D4).
- Logout: botón en el pie del sidebar (desktop) / esquina de la pantalla Día (mobile) → `POST /api/auth/logout` → `navigate("/login")`.

## Migration notes

Sin cambios de esquema (D2). Config: `wrangler.toml` gana `run_worker_first = true` bajo
`[assets]`; dos secretos por `wrangler secret put` (remoto) y `.dev.vars` (local). El script de
test (`api/wrangler.test.toml`) define `vars` de prueba con el digest de `test-password-123` y
`AUTH_SECRET` fijo — los tests de contrato de auth y de las 13 rutas existentes corran con la
cookie correcta obtenida vía `POST /api/auth/login`.
