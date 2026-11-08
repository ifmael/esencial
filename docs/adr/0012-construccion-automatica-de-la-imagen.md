# ADR-0012 — Construcción automática de la imagen del worker

- **Estado:** Aceptada
- **Fecha:** 2026-11-08

## Contexto

La etiqueta `esencial-worker:<hash>` (12 primeros hex del sha256 de
`orquestator-cli/Dockerfile` y `pnpm-lock.yaml`) es la prueba de que una fase
corre con la receta correcta. Hasta ahora el único productor era
`orquestator-cli/build.sh`, a mano y solo en el Docker local. Cuando `main` cambió
`Dockerfile` o lockfile y la imagen no se construyó, la fase murió con un `exit
125` desnudo y `autoSpecs` la relanzó cada minuto sin marcador ni freno (pasó con
ESN-10).

Además, `imageTag()` leía el árbol de trabajo de cada consumidor: el checkout, el
clon de la tarea o la sonda RED podían discrepar sobre qué receta se estaba
usando, y la puerta de lockfile no existía.

## Decisión

- **Una sola fuente de lo que se instala: el `main` del espejo**
  `~/.orquestator/upstream.git`. De ahí salen la etiqueta (`imageTag()` entero,
  para todos sus consumidores), la puerta de lockfile, la sonda RED (su worktree y
  el «before») y el contexto de build, que es una exportación de ese commit. Sin
  espejo, el error manda a ejecutar `start`. Si el `fetch` del refresco falla, se
  sigue con el espejo que hay y se avisa.
- **Construcción por quien la pide, con una única función `ensureImage(tag)`.**
  Si la imagen existe, vuelve; si hay un build vivo (cerrojo con pid comprobado),
  espera con una anotación por minuto en el diario; si el cerrojo es huérfano (pid
  muerto), toma el relevo; si no hay build, toma el cerrojo y construye. La
  llaman el refresco del servicio (cada cinco minutos, en segundo plano y sin
  esperar), la fase (de forma síncrona) y el CLI manual (`run`/`check` sin
  `watch`). No hay una vía aparte. Todo lo que rodea al build —retención,
  anotación del fallo, liberación del cerrojo— vive en la función compartida.
- **Tope de build de 60 minutos.** El proceso hijo de `docker build` se mata al
  agotarlo; se suelta el cerrojo, se anota el fallo y la fase para con el mensaje.
  Ninguna espera es infinita.
- **Freno de diez minutos por etiqueta** en `~/.orquestator/image-fail.json`, que
  guarda etiqueta, hora y último error y sobrevive al reinicio del servicio. Antes
  de diez minutos, cualquier llamada devuelve el error guardado sin invocar
  Docker; a los diez minutos se reintenta una vez; un build correcto limpia la
  anotación. Los relanzamientos son baratos: lo que el freno limita son los
  builds, no los ticks.
- **Fallo con etiqueta, comando y final del error.** La fase no se aparca por
  falta de imagen: espera o construye. Si el build falla, para con ese mensaje y
  hay que arreglar el Dockerfile. Un éxito posterior del refresco no reanima sola
  la tarea parada por ese fallo: la reanudación es un toque humano.
- **`ORQUESTATOR_IMAGE` manda y no se construye.** El preflight comprueba que la
  imagen señalada existe y, si no, se para con un mensaje que solo ofrece lo que
  existe: quitar la variable, poner el valor del hash derivado del espejo
  (impreso en ese momento) o `build.sh --tag <nombre>`. Con la variable definida,
  el refresco mantiene los dos fetches —espejo y checkout— y solo se salta el
  cálculo de la etiqueta y la construcción: la variable cambia la imagen, no el
  origen de los datos. La puerta de lockfile se desactiva y nadie garantiza el
  store de esa imagen.
- **Retención**: tras un build correcto quedan las tres etiquetas más recientes
  por fecha de creación, con la esperada siempre protegida. Un `rm` fallido se
  registra y se sigue; no se tocan contenedores.
- **`build.sh` como vía manual y de diagnóstico.** Valida `Dockerfile` y
  `pnpm-lock.yaml` del árbol contra el `main` del espejo y se para si no
  coinciden; `--tag` explícita salta esa validación. Toma la misma cerradura que
  la vía automática (nunca dos escritores sobre la misma etiqueta), se salta el
  freno de diez minutos con y sin `--tag` (para eso existe) y borra o escribe el
  marcador de fallo de la etiqueta según el resultado.
- **Los dos empujes pasan a forzar con `+`**: `importBranch` (clon→espejo) y
  `pushBranch` (espejo→GitHub). Una rama reescrita llega a los dos sitios, lo que
  deja el rebase como opción real (ADR 0013).
- **El refresco hace dos fetches**: espejo (`fetch --prune origin` en el espejo) y
  checkout (`git fetch --prune --no-tags origin`). Son la misma verdad vista desde
  dos sitios: `guard`, `agents` y `migrate` siguen leyendo `origin/main` del
  checkout. **Límite escrito:** los dos fetches no son atómicos. Si el del
  checkout falla, esas lecturas quedan atrasadas y `guard` cuenta como tocado por
  la tarea lo que tocó `main` después: falla cerrado (bloquea de más), nunca de
  menos.

## Alternativas

- **Construir en CI y publicar en un registry:** el único consumidor es este
  host; añade credenciales, red y una espera de CI antes de cada fase.
- **Construir siempre en el refresco y hacer esperar a la fase por el marcador:**
  es más frágil (una fase podría quedarse sin imagen si el refresco está parado) y
  separa la construcción de quien la necesita.
- **Un daemon o cola de builds:** más superficie y estado que un cerrojo de
  fichero con pid comprobado, para un host con `--max-parallel` pequeño.
- **Leer la etiqueta del árbol de trabajo:** es lo que había; deja consumidores
  discrepando sobre la receta y hace imposible comparar contra el espejo.

## Consecuencias

- La etiqueta es la misma para todos los consumidores y se puede comparar con el
  `main` del espejo.
- Un host nuevo paga el build en frío (~30 min) una vez; el refresco lo evita en
  los siguientes arranques. Las cifras de tiempo y tamaño son ESN-13.
- Una fase puede ocupar su hueco de `--max-parallel` mientras espera; está en
  curso de verdad.
- La rama que toca el lockfile se bloquea hasta alinearse con un merge
  (ADR 0013).
- La trazabilidad de un fallo está en `image-fail.json` y en el diario de la fase,
  no en un estado `Blocked` ni en un comentario de Linear.
- No se promete inmutabilidad de la imagen y ninguna construcción pasa
  `--build-arg`: el Dockerfile es el único origen de la fijación de Hermes.

## Referencias

- `orquestator-cli/lib/image.mjs`, `image-build.mjs`, `image-refresh.mjs`,
  `lockfile.mjs`, `build.mjs` y `build.sh`.
- `orquestator-cli/test/image.test.mjs`, `ensure-image.test.mjs`,
  `image-refresh.test.mjs`, `lockfile.test.mjs` y `build.test.mjs`.
- `docs/construccion-imagen.md` y `docs/flujo.md`, «Imagen del worker (M1)».
- ADR 0013 (dependencias antes por main).
