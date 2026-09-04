# Spec — E8 ejecución de ejercicios

## Requirement: Pasos de ejecución en el detalle

El detalle de ejercicio (`/ejercicios/:id`) DEBE mostrar la sección "Cómo se ejecuta" con una lista ordenada y numerada de pasos cuando el ejercicio tiene `steps`; cuando no tiene pasos, la sección NO DEBE aparecer.

- Given un ejercicio con `steps: ["Paso 1","Paso 2"]`, When se abre `/ejercicios/:id`, Then se muestra el heading "Cómo se ejecuta" y los pasos como ítems de lista ordenada.
- Given un ejercicio sin `steps`, When se abre su detalle, Then no se muestra la sección "Cómo se ejecuta".
- Given un ejercicio con `steps` en la API, Then `GET /api/exercises/:id` devuelve `steps` como array de strings (y `null` si no hay).

## Requirement: Vídeo de técnica empotrado

El detalle DEBE renderizar un iframe de YouTube empotrado cuando `technique_url` sea una URL de YouTube (watch, shorts o youtu.be); para cualquier otra URL DEBE conservar solo el enlace externo "Ver técnica".

- Given `techniqueUrl: "https://youtu.be/dQw4w9WgXcQ"`, When se abre el detalle, Then hay un iframe con `src` `https://www.youtube.com/embed/dQw4w9WgXcQ` y el enlace "Ver técnica" (target=_blank, noopener).
- Given `techniqueUrl: "https://example.com/tec"`, When se abre el detalle, Then no hay iframe y sí el enlace "Ver técnica".
- Given `techniqueUrl` nulo, Then no hay iframe ni enlace.

## Requirement: Editor de pasos

El editor de ejercicio DEBE permitir escribir pasos (un paso por línea) y guardarlos como array; las líneas vacías se descartan y si no queda ninguna el valor es `null`.

- Given el editor con "Paso uno\nPaso dos" en "Pasos de ejecución", When se guarda, Then el POST/PUT envía `steps: ["Paso uno","Paso dos"]`.
- Given el editor con pasos vacíos, When se guarda, Then `steps` es `null`.

## Requirement: Validación API de pasos

La API DEBE rechazar `steps` con ítems vacíos (400 con `{error, field}`).

- Given `POST /api/exercises` con `steps: ["ok", ""]`, Then 400 con `field: "steps.1"`.
- Given `steps` con más de 40 ítems, Then 400.

## Requirement: Ingesta del catálogo

La migración 0006 DEBE dejar los 91 ejercicios del seed con `steps` no nulos y `technique_url` con URL de YouTube (o sus valores corregidos manualmente).

- Given la migración 0005+0006 aplicadas, Then todos los ejercicios del catálogo tienen `steps` no vacío.
- Given una URL de `technique_url` no vacía en el catálogo, Then apunta a YouTube.
