#!/usr/bin/env bash
# Vía manual y de diagnóstico de la imagen del worker: valida el árbol contra
# el main del espejo (salvo con --tag), toma la misma cerradura que la
# construcción automática y se salta el freno de diez minutos. Imprime la
# etiqueta construida. La lógica vive en lib/build.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
exec node orquestator-cli/bin/build.mjs "$@"
