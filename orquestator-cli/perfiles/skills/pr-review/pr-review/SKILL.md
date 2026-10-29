---

name: revisar-pr
description: Checklist de riesgos para validar una PR de Esencial antes del merge.
---

# Revisar una PR completa

1. ¿El cuerpo explica qué, por qué y cómo probarlo sin leer el diff entero?
2. ¿Los checks cubren lo que se tocó? ¿La revisión previa está resuelta?
3. Riesgo de despliegue: migraciones (¿aditivas?, ¿aplicadas antes del merge?),
   variables de entorno, CORS/CSP entre los dos Workers, datos existentes.
4. ¿Puede el humano validar con lo que tiene delante? Si no, es **crítico**.
5. Primera línea: `Veredicto: APROBADO` o `Veredicto: CAMBIOS`; cada punto como
   **crítico** o **deuda**, con `archivo:línea` cuando aplique.
