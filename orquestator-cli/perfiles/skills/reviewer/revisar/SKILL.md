---
name: revisar-cambio
description: Cómo revisar un cambio de Esencial y emitir el veredicto.
---

# Revisar un cambio

1. Contrasta el diff con el brief: ¿hace lo pedido y solo lo pedido?
2. Busca el test que debería fallar sin el cambio. Si no existe o prueba el
   cableado, es **crítico**.
3. Revisa los casos límite y los negativos, no solo el camino feliz.
4. Comprueba convenciones de `AGENTS.md`: sistema de diseño, migraciones aditivas,
   commits sin atribución.
5. Primera línea: `Veredicto: APROBADO` o `Veredicto: CAMBIOS`. Con algún crítico,
   siempre CAMBIOS. Cada hallazgo: `archivo:línea`, **crítico** o **deuda**.
