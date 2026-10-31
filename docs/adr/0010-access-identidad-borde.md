# ADR-0010 — Cloudflare Access como identidad de borde

- **Estado:** Aceptada
- **Fecha:** 2026-10-04

## Contexto

La app es personal y familiar, pero necesita identificar a cada persona para
separar sus datos. Mantener un login propio exigiría usuarios, contraseñas,
sesiones, recuperación y un formulario que el repo no quiere mantener. Cloudflare
ya está delante de los Workers y puede autenticar antes de que la petición llegue
al código.

## Decisión

**Cloudflare Access** autentica en el borde. La API no crea ni valida sesiones
propias: lee el email ya autenticado de `ctx.access` y falla cerrada si no hay
una identidad válida. No hay `AUTH_SECRET` ni `PASSWORD_HASH` en los Workers.

En las Preview URLs `ctx.access` llega `undefined`, así que la API verifica el
`Cf-Access-Jwt-Assertion` contra el JWKS del equipo (`TEAM_DOMAIN` y
`POLICY_AUD`). La cookie de Access es por host; el puente `/api/session/return`
autentica primero el host de la API y vuelve a la web.

En desarrollo, `[access.dev]` simula una identidad fija. En las pruebas de
extremo a extremo se usa `X-Dev-Email` solo con `DEV_AUTH=1`; sin ese flag la
cabecera se ignora.

## Alternativas

- **Login propio con sesión y contraseña:** da control total, pero añade
  almacenamiento de credenciales, recuperación, rotación y una superficie de
  ataque que Access ya cubre.
- **OAuth con un proveedor externo:** evita contraseñas, pero exige registrar una
  app, gestionar el retorno y mantener la sesión igualmente.
- **Confiar en una cabecera o en el origen de red:** es más simple, pero
  cualquiera que alcance el Worker podría suplantar la identidad.
- **Access solo en el frontal:** protege el HTML, pero deja la API expuesta si se
  llama directamente.

## Consecuencias

- No hay pantalla de login ni gestión de usuarios en la app; el alta y el cierre
  de sesión son de Access.
- El email es el único dato de identidad que llega; el nombre se pide aparte en
  Ajustes.
- La cookie es por host: abrir la web antes que la API puede dar la impresión de
  que la base falla; el puente lo resuelve.
- Los previews necesitan su propia app de Access, el JWT verificado y
  `options_preflight_bypass` para que el preflight CORS no reciba 403.
- Los seams de desarrollo (`[access.dev]` y `X-Dev-Email`) son deliberados y
  deben quedar cerrados fuera de dev y pruebas.

## Referencias

- `api/src/identity.ts` y `api/src/middleware.ts`.
- `web/src/lib/session-bridge.ts` y `api/src/index.ts` (`/session/return`).
- `DEPLOY.md` §5; `docs/flujo.md`, «Preview por rama (M5a)».
- `api/wrangler.toml` (`[access.dev]`).
