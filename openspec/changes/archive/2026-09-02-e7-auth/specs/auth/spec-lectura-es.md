# Spec — E7 auth (traducción de lectura)

> Versión legible del spec oficial (spec.md, en inglés, es el documento válido).

## 1. Login con contraseña
`POST /api/auth/login` recibe `{ password }`. La Worker la verifica contra un digest PBKDF2
(contraseña en claro NUNCA se guarda ni se compara). Correcta → 200 + cookie de sesión con
`HttpOnly`, `Secure`, `SameSite=Lax`. Incorrecta → 401 con envelope `{ error, field }`.
Body inválido o falta password → 400, y el hash ni se ejecuta.

- Password correcta → 200 y la cookie llega bien configurada.
- Password incorrecta → 401 y NO se setea cookie.
- Body basura → 400 `{ error, field }`.

## 2. Sesión firmada, sin base de datos
La sesión es un token firmado con HMAC (`AUTH_SECRET`) que lleva caducidad de 30 días. Solo
cuenta como sesión si la firma verifica y la fecha no pasó. Token manipulado, roto o caducado =
sin sesión (fail closed). Logout borra la cookie. No hay tabla de usuarios ni de sesiones en D1.

- Cookie con un byte editado → 401.
- Cookie caducada → 401.
- Logout → 200 y la cookie queda expirada.

## 3. Estado de sesión para la SPA
`GET /api/auth/status` siempre responde 200: `{ authenticated: true|false }`. La SPA lo usa para
decidir si redirigir a login.

## 4. Todas las rutas API protegidas
Las 13 rutas existentes exigen sesión válida. Solo dos excepciones: `POST /api/auth/login` y
`GET /api/health` (probe de deploy). Sin sesión → 401 `{ error: "Unauthorized" }`. Ruta
inexistente bajo `/api` sin sesión → 401 (el gate va antes del 404). Con sesión, el
comportamiento de siempre, idéntico.

- Sin sesión, `GET /api/recipes` → 401 y cero datos.
- Test de contrato: las 13 rutas, todas 401 sin cookie.
- `/api/health` sin sesión → 200 `{ ok: true }`.

## 5. Páginas de la app
Pedir una página HTML sin sesión → redirección 302 a `/login?next=<ruta>`. `/login` y lo que
necesita para renderizar se sirven sin sesión. La Worker ve estas peticiones porque se desactiva
el atajo de assets estáticos (`run_worker_first`). Ojo: esto es UX (que no aparezca una shell
rota); la seguridad real es el 401 de la API.

- `/` sin sesión → 302 a `/login?next=%2F`.
- `/login` sin sesión → 200.
- Con sesión → 200 directo (sin bucle de redirects).

## 6. Pantalla de login
Card centrada (sistema DESIGN.md): título "Esencial", campo de contraseña y botón verde
"Entrar". Mientras vuela la petición, el botón se deshabilita (doble clic → una sola llamada).
401 → "Contraseña incorrecta" bajo el campo; 429 → mensaje de esperar; éxito → se va a `next`
o a `/`.

## 7. Guard en el cliente
Al arrancar la SPA se consulta `/api/auth/status`; si dice que no hay sesión, redirect a
`/login?next=<ruta actual>` sin fetchear datos. Es capa de comodidad — el servidor manda.

- Usuario deslogado cae en `/plan-fuerza` → termina en `/login?next=%2Fplan-fuerza`.
- Usuario con sesión → `/` directo, sin parpadeo.

## 8. Rate-limit del login
Intentos fallidos contados por IP en ventana de 15 minutos (contador en memoria de la Worker).
Al sexto intento dentro de la ventana → 429 `{ error: "Too many attempts" }` incluso con
password correcta. Un login exitoso resetea el contador de esa IP. Límite por isolate (se pierde
en frío): freno de molestia, no muro; upgrade a Durable Object documentado en el código.

- 5 fallos seguidos → el 6º intenta con la password buena y aun así es 429.
- 4 fallos + acierto → entra, y el contador vuelve a cero.

## 9. Headers de seguridad
Toda respuesta (API y assets) lleva: CSP empezando por `default-src 'self'`,
`X-Content-Type-Options: nosniff` y `Referrer-Policy: same-origin`. La SPA no carga scripts de
ningún origen tercero.

## 10. Provisioning de credenciales
`AUTH_SECRET` y `PASSWORD_HASH` son secretos (`wrangler secret put` en prod; `.dev.vars` en
local). Nunca commiteados ni en `wrangler.toml`. Un script local genera el digest; cambiar la
contraseña = regenerar + `secret put` (dos comandos, documentados). Sin secretos, todo falla
cerrado — jamás se emite una cookie sin firmar.
