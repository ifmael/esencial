# AGENTS.md — Esencial

Contrato operativo para agentes. No documenta el producto ni repite el sistema de
diseño: dice qué leer, cómo trabajar, qué no tocar y dónde está cada verdad.

Si una regla de este documento choca con el código o con una prueba, mandan el
código y la prueba; actualiza el documento en el mismo cambio.

## Leer primero

- Comportamiento y reglas de producto: [`docs/comportamiento.md`](docs/comportamiento.md).
- Diseño y piezas visuales: [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md) y
  [`web/src/globals.css`](web/src/globals.css).
- Despliegue, migraciones y secretos: [`DEPLOY.md`](DEPLOY.md).
- Flujo de agentes, ramas y aprobaciones: [`docs/flujo.md`](docs/flujo.md),
  [`docs/adr/`](docs/adr/) y [`TODO-flujo-agentes.md`](TODO-flujo-agentes.md).

## Stack y mapa

- `api/`: Hono sobre Cloudflare Workers, base de datos D1 y almacenamiento R2.
- `web/`: React 19, Vite, react-router 7 y Tailwind; lo sirve el Worker del
  frontal, que también gatea el documento.
- Dos Workers: `esencial` sirve los assets y `esencial-api` expone las rutas
  `/api/*`. El navegador habla con los dos por separado, así que los orígenes
  permitidos por el servicio y por la política de seguridad tienen que cuadrar.
- La identidad la prueba Cloudflare Access en el borde; no hay inicio de sesión
  propio.
- Monorepo pnpm. La interfaz y los datos van en español.

## Comandos

| Comando                  | Para qué                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `pnpm dev`               | Arranca frontal en 8787 y servicio en 8789. Para el móvil: `ESENCIAL_HOST=<ip> pnpm dev`. |
| `pnpm typecheck`         | Tipos de todos los paquetes.                                                              |
| `pnpm test`              | Pruebas unitarias del servicio y de la web.                                               |
| `pnpm test:coverage`     | Unitarias con umbrales; es lo que exige la integración continua.                          |
| `pnpm lint`              | Biome y comprobación de tokens del sistema de diseño.                                     |
| `pnpm e2e`               | Playwright con su propia base de datos y su propio servidor.                              |
| `pnpm e2e:check`         | Comprueba que la suite no cambia la base de desarrollo.                                   |
| `pnpm db:migrate:local`  | Aplica migraciones a `.wrangler/state`.                                                   |
| `pnpm db:migrate:remote` | Aplica migraciones a la base remota.                                                      |
| `pnpm run deploy`        | Construye y publica los dos Workers.                                                      |
| `pnpm orquestator`       | Entra en la herramienta de agentes; ver `docs/flujo.md`.                                  |

No uses `pnpm deploy` a secas: es un comando interno de pnpm y falla.

## Cómo trabajar

- **Pruebas primero**: primero una prueba que falle, después el cambio, después la
  prueba en verde. Si no se puede, dilo y explica qué comprobación manual hiciste.
- **Conventional commits** y sin `Co-Authored-By` ni atribución de IA.
- **Verifica antes de afirmar**: no des por hecho un comportamiento sin leer el
  código, la prueba o ejecutarlo.
- **No inventes alcance**: si una decisión de diseño tiene alternativas reales,
  expón el cruce y sus consecuencias antes de elegir.
- **Nada de secretos** en el repositorio, en un commit o en el chat.
- **No toques** archivos generados a mano: `web/src/tokens.css`,
  `web/src/components/icons.tsx` y `web/src/components/body-map/data.ts` se
  regeneran con sus scripts.

Antes de dar algo por terminado:

1. `pnpm typecheck` y `pnpm lint`.
2. `pnpm test` de los paquetes tocados; `pnpm test:coverage` si el cambio es
   grande.
3. `pnpm e2e` si toca interfaz, sesión, calendario o autenticación.
4. Actualiza `docs/comportamiento.md` si cambia una regla observable.
5. Actualiza `DEPLOY.md` si cambia el despliegue, una migración o una variable.

## Interfaz

- La fuente única es `web/src/globals.css`; los tokens viven en
  `web/src/tokens.css`, generado con `node web/scripts/gen-tokens.ts`. No edites
  `tokens.css` a mano.
- Reutiliza las primitivas de `web/src/components/ui.tsx`,
  `expressive.tsx` y `overlay.tsx`. Una pantalla no escribe piel ni usa la escala
  cruda de Tailwind; `pnpm lint` lo rechaza.
- El catálogo de piezas está en `/ui`. Para una pieza nueva, primero el token y
  después la primitiva.
- Las fotos de receta se piden con credenciales entre orígenes; sin eso el color
  dinámico no puede leerlas.
- Respeta el foco visible, la reducción de movimiento y los tamaños táctiles
  documentados en `DESIGN-SYSTEM.md`.

## Rutas protegidas y migraciones

La lista exacta está en
[`orquestator-cli/protected-paths.txt`](orquestator-cli/protected-paths.txt). Se
lee de `main`, no de la rama. Incluye, entre otras: `AGENTS.md`, `DEPLOY.md`,
`docs/flujo.md`, los archivos de configuración de pnpm, Biome, Vitest, Vite y
Playwright, los ayudantes de pruebas, los `wrangler.toml`, `orquestator-cli/` y
los flujos de integración.

- `.github/workflows/` **no es aprobable**: un cambio de integración continua va
  en una PR humana aparte.
- Un cambio en una ruta protegida necesita `approve` con terminal y motivo; el
  hash caduca si el diff cambia después.
- Las migraciones son **aditivas y compatibles hacia atrás**. Una migración ya
  aplicada es inmutable: cualquier corrección va en un número nuevo.
- Si una columna nace obligatoria sobre filas existentes, usa el patrón de tres
  pasos: columna que admite vacíos, despliegue del código que la rellena,
  rellenar y hacerla obligatoria.
- Una tabla nueva en el bootstrap de pruebas se añade a `TABLES` en
  `api/tests/helpers.ts`. La base de las pruebas de extremo a extremo se deriva
  de `api/migrations/`.
- Una migración aplicada en remoto no se toca. Para el orden y los casos
  destructivos, lee `DEPLOY.md` §4.

## Pruebas de extremo a extremo

`pnpm e2e` **nunca** toca `.wrangler/state`: arranca su propio servicio y su
propio frontal, con base de datos y almacenamiento en `e2e/.state`. La
configuración vive en `e2e/playwright.config.ts`.

- Un solo trabajador: la base y el servidor son estado compartido. No subas el
  paralelismo sin dar a cada trabajador su propia base.
- Fechas reales, no desplazamientos inventados.
- Las peticiones directas usan `apiUrl()` o `API_BASE` de
  `e2e/tests/helpers.ts`; un `fetch("/api/...")` relativo iría al frontal.
- No crees con una petición un ejercicio que ya esté sembrado: el nombre es
  único y responde 400. Resuelve el identificador con una consulta a
  `/api/exercises`.
- Si un test pulsa justo después de abrir un diálogo, espera a que acabe la
  animación (`settle`).

## Agentes y ramas

`orquestator-cli/` es la herramienta; `docs/flujo.md` es el contrato y
`docs/adr/` guarda las decisiones. No implementes el flujo a mano ni cambies el
comportamiento de los comandos sin actualizar su documentación y sus pruebas.

- Hay un solo `AGENTS.md` de proyecto, no uno por fase. Las diferencias de rol
  viven en `orquestator-cli/perfiles/` (perfil, SOUL y habilidades).
- La revisión de especificación y el revisor final leen el `AGENTS.md` de `main`;
  el implementador lee el de su rama. El revisor de código también recibe el de
  `main` montado en solo lectura.
- El estado de una tarea vive en `~/.orquestator/`; no lo escribas desde el
  repositorio.
- `approve` es humano y con terminal. No lo automatices.
- No toques `.github/workflows/` ni `orquestator-cli/` en una tarea normal.
- Si cambias una regla de comportamiento, actualiza la regla con su identificador
  en `docs/comportamiento.md`; no renumeres las existentes.

## Dónde está cada cosa

| Tema                          | Fuente                                                    |
| ----------------------------- | --------------------------------------------------------- |
| Comportamiento de producto    | `docs/comportamiento.md`                                  |
| Diseño, tokens y primitivas   | `DESIGN-SYSTEM.md`, `web/src/globals.css`, catálogo `/ui` |
| Despliegue y migraciones      | `DEPLOY.md`                                               |
| Esquema final y deltas        | `api/schema.sql`, `api/migrations/`                       |
| Flujo de agentes y decisiones | `docs/flujo.md`, `docs/adr/`, `TODO-flujo-agentes.md`     |
| Pruebas de extremo a extremo  | `e2e/playwright.config.ts`, `e2e/tests/helpers.ts`        |

## Trampas conocidas

- `pnpm e2e` reescribe `web/dist` con la dirección del servicio de pruebas. Si
  tienes `pnpm dev` abierto, reinícialo después de la suite.
- `wrangler d1 migrations apply` se queda esperando si hay terminal interactivo.
  En scripts, añade `< /dev/null`.
- No endurezcas las cabeceras de seguridad del Worker: el vídeo de YouTube
  necesita `frame-src https://www.youtube.com` y
  `Referrer-Policy: strict-origin-when-cross-origin`. Hay pruebas que lo atan.
- Un cambio en `api/migrations/` puede exigir aprobación de migración además de
  la de rutas protegidas; son dos aprobaciones distintas.
- El servidor de desarrollo es un solo proceso con dos Workers: si matas uno,
  termina el otro. Usa `pnpm dev` y no mezcles hosts en la misma corrida.
- La caché de listas del navegador dura cinco minutos; toda escritura la vacía.
