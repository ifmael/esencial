#!/usr/bin/env bash
# Construye la imagen del worker y imprime su etiqueta (hash del Dockerfile y
# del lockfile). Contexto: la raíz del repo.
set -euo pipefail
cd "$(dirname "$0")/.."

tag="esencial-worker:$(cat orquestator-cli/Dockerfile pnpm-lock.yaml | sha256sum | cut -c1-12)"
docker build --tag "$tag" --file orquestator-cli/Dockerfile .
echo "$tag"
