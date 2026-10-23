---
name: implementar-esencial
description: Procedimiento para implementar una tarea de Esencial con TDD y entregarla.
---

# Implementar una tarea

1. Lee `.task/brief.md` y `AGENTS.md` antes de tocar nada.
2. Escribe primero el test que demuestra el comportamiento pedido. Ejecútalo y
   comprueba que falla por el motivo correcto (no por un import roto).
3. Implementa lo mínimo que lo hace pasar. Si el cambio no es de comportamiento,
   dilo en `impl.md` en vez de inventar un test.
4. Ejecuta `pnpm lint`, `pnpm typecheck` y los tests del paquete tocado
   (`pnpm --filter api test` o `pnpm --filter web test`); si tocaste UI, añade el
   e2e que corresponda.
5. Commit conventional, en español, sin `Co-Authored-By`. No hagas push.
6. Cierra `impl.md` (qué, por qué, cómo lo probaste) y `pr-body.md` (qué, por qué,
   cómo probarlo).
