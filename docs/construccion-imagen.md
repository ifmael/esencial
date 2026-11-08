# La imagen del worker

La imagen `esencial-worker:<hash>` es el entorno en el que corren las fases
(`check`, `implementer`, `reviewer`, `pr-review`, `preview` y `spec-review`). Este
documento explica de dónde sale, quién la construye, qué la frena y qué queda
fuera. Las decisiones están en [ADR 0012](adr/0012-construccion-automatica-de-la-imagen.md)
y [ADR 0013](adr/0013-dependencias-antes-por-main.md); el uso diario, en
[`flujo.md`](flujo.md#imagen-del-worker-m1).

## 1. Para qué una etiqueta

La etiqueta es la prueba de que una fase corre con la receta correcta. Un clon
antiguo con un store de pnpm de otra versión falla de forma difícil de leer
(`--offline`), y una imagen que no existe mata la fase con un `exit 125` desnudo.
La etiqueta convierte las dos cosas en un único dato comprobable.

## 2. Fuente única: el main del espejo

Todo lo que se instala sale del `main` de `~/.orquestator/upstream.git`:

- la **etiqueta** (`imageTag()`), para todos sus consumidores;
- la **puerta de lockfile**, que compara el lockfile del clon con el del espejo;
- la **sonda RED**, que crea su worktree desde el espejo (también el `git show`
  del «before»);
- el **contexto de build**, una exportación del commit del espejo.

El árbol de trabajo del checkout principal no decide la receta. Si falta el
espejo, el error manda a ejecutar `start` de una tarea; si el `fetch` del refresco
falla, se sigue con el espejo que hay y se avisa.

## 3. La etiqueta

```text
esencial-worker:<12 primeros hex de sha256(Dockerfile + pnpm-lock.yaml)>
```

El Dockerfile es `orquestator-cli/Dockerfile` y el lockfile, `pnpm-lock.yaml`, los
dos leídos del `main` del espejo. `build.sh` imprime el mismo hash y
`orquestator-cli/test/image.test.mjs` lo ata. No se promete inmutabilidad: la
etiqueta identifica la receta, no un artefacto firmado.

`ORQUESTATOR_IMAGE` corto-circuita la etiqueta: manda la imagen indicada y no se
construye.

## 4. `ensureImage(etiqueta)`: la única función

```text
ensureImage(tag):
  si el último build de esa etiqueta falló hace menos de diez minutos:
      devolver el error guardado (sin tocar docker)
  si la imagen existe: volver
  repetir:
      si la imagen existe: volver
      si el cerrojo está libre o su pid está muerto: tomarlo y construir
          éxito  → retención, borrar la anotación de fallo, soltar el cerrojo
          fallo  → anotar etiqueta/hora/error, soltar el cerrojo, parar la fase
      si hay un build vivo: anotar la espera y dormir un minuto
      si la espera supera el tope del build más un margen: parar con mensaje
```

La llaman tres sitios y no hay una vía aparte:

- el **refresco del servicio**, cada cinco minutos, en segundo plano y sin
  esperar;
- la **fase**, de forma síncrona, antes de lanzar el contenedor;
- el **CLI manual** (`run`/`check` sin `watch`), que recorre la misma ruta.

Una fase que espera está en curso de verdad: ocupa su hueco de `--max-parallel`
hasta que la imagen está lista, igual que lo ocuparía ejecutando.

## 5. Cerrojo

`~/.orquestator/image-<etiqueta>.lock` guarda el pid del que construye. Un cerrojo
con el pid vivo hace esperar; con el pid muerto (o ilegible) se toma el relevo.
Nunca hay dos escritores sobre la misma etiqueta. La ruta manual y la automática
comparten esta cerradura.

## 6. Freno, marcador y tope

- **Freno**: `~/.orquestator/image-fail.json` guarda, por etiqueta, la hora y el
  último error. Dentro de los diez minutos siguientes, cualquier llamada devuelve
  ese error sin invocar Docker: los relanzamientos son baratos y no generan
  construcciones. A los diez minutos se reintenta una vez. Un build correcto
  limpia la anotación. El fichero sobrevive al reinicio del servicio.
- **Tope**: el proceso hijo de `docker build` se mata a los 60 minutos. Al
  agotarlo se suelta el cerrojo, se anota el fallo (entra en el freno) y la fase
  para con el mensaje.
- **Mensaje**: etiqueta, comando exacto (`docker build --tag … --file … …`) y el
  final de la salida del error.

Ninguna construcción pasa `--build-arg`: `HERMES_COMMIT` y `PNPM_VERSION` viven en
el Dockerfile y son el único origen de la fijación.

## 7. Construcción manual (`build.sh`)

`orquestator-cli/build.sh` es la vía manual y de diagnóstico. No llama a
`docker build` a pelo: pide la imagen a la misma función, con dos excepciones
deliberadas.

```bash
orquestator-cli/build.sh                 # valida y construye la etiqueta del espejo
orquestator-cli/build.sh --tag <nombre>  # construcción a propósito, sin validar
```

- Sin `--tag`, compara `orquestator-cli/Dockerfile` y `pnpm-lock.yaml` del árbol
  con el `main` del espejo. Si no coinciden, se para e imprime la etiqueta
  derivada del espejo para que se pueda copiar.
- Con `--tag` explícita se omite la validación: una etiqueta elegida a mano no se
  deriva de nada y se construye a propósito.
- Toma la misma cerradura que la construcción automática (si hay un build vivo,
  espera) y **se salta el freno de diez minutos**: esa es su razón de ser,
  arreglar el Dockerfile y reconstruir ya.
- Al terminar bien borra la anotación de fallo de la etiqueta construida; si
  falla, la escribe. Así el bucle automático sigue espaciándose.

## 8. Diagrama

```text
refresco (cada 5 min, en segundo plano)        fase (síncrona)
  fetch espejo ─┐                                runPhase
  fetch checkout├─ (no atómicos)                   │
  imageTag() ───┘                                 ▼
        │                                   puerta de lockfile
        ▼                                   (salvo spec-review y etiqueta forzada)
   ensureImage(tag) ◄─────────────────────────────┘
        │
        ├─ freno vigente ───────────────► error guardado, sin docker
        ├─ imagen existe ───────────────► adelante
        ├─ build vivo (pid vivo) ───────► anotar y esperar (cada minuto)
        ├─ cerrojo huérfano (pid muerto)► tomar el relevo
        └─ sin build ───────────────────► docker build con tope de 60 min
                                             │
                                             ├─ éxito → retención + limpiar fallo
                                             └─ fallo → anotar y parar la fase
```

Los dos fetches del refresco no son atómicos: si el del checkout falla, `guard`,
`agents` y `migrate` ven una referencia atrasada y `guard` falla cerrado (bloquea
de más, nunca de menos).

## 9. Retención

Tras un build correcto, por cualquiera de los caminos, se conservan las tres
etiquetas más recientes por fecha de creación y, siempre, la esperada. Un
`docker image rm` fallido (imagen en uso) se registra en el diario y se sigue; no
se tocan contenedores. La caché de BuildKit no se poda aquí (ESN-13).

## 10. Límites y pendientes

- **Lockfile desalineado**: la puerta compara conjuntos de paquete+versión. Si la
  rama pide algo que no está en el `main` del espejo, la fase no arranca; el
  remedio es un `git merge` del main del espejo en la rama, ejecutado por una
  persona. Está en [ADR 0013](adr/0013-dependencias-antes-por-main.md). No hay
  comando de alineación en el flujo.
- **Tarea parada por un build fallido**: una vez arreglado el Dockerfile, un
  éxito posterior del refresco no la reanima sola. La reanudación es un toque
  humano (`resume`); no se añade maquinaria de reanimación.
- **`build.sh` es la única puerta de escape del freno**, deliberadamente.
- **Etiqueta forzada**: la puerta de lockfile queda desactivada y nadie garantiza
  el store de esa imagen; se construye o se señala a propósito.
- **Fuera de esta entrega**: línea base y cifras de tiempo/tamaño, purga de la
  caché de BuildKit, separar imágenes por tipo de fase y recortar el store
  (ESN-13); cambios al revisor de especificación (ESN-14); CI y registry, porque
  el único consumidor es este host.
