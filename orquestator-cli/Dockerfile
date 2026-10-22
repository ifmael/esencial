# Worker de las fases: Node 24 (el del CI), pnpm, Playwright/Chromium y Hermes.
# El contexto es la raíz del repo (lo hace build.sh) y la etiqueta sale del
# hash de este fichero y de pnpm-lock.yaml.
FROM node:24-bookworm

# Hermes v0.22.4; se sube a mano junto con la imagen.
ARG HERMES_COMMIT=64dbae64747ab640a3fece06f359307c30d129da
ARG PNPM_VERSION=12.4.2

ENV npm_config_store_dir=/opt/pnpm-store \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    WRANGLER_SEND_METRICS=false \
    DEBIAN_FRONTEND=noninteractive \
    HERMES_HOME=/opt/hermes/home

# pnpm instalado en la imagen (corepack lo bajaría en cada contenedor, sin red).
RUN npm install -g "pnpm@${PNPM_VERSION}" \
 && pnpm --version \
 && apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates libatomic1 \
 && rm -rf /var/lib/apt/lists/*

# Hermes fijado por commit, sin su navegador (usamos el de Playwright) y con
# los datos fuera de /root, porque el contenedor corre con el UID del host.
RUN curl -fsSL https://hermes-agent.nousresearch.com/install.sh \
      | bash -s -- --commit "${HERMES_COMMIT}" --non-interactive \
                     --skip-browser --skip-computer-use \
                     --dir /opt/hermes/hermes-agent --hermes-home /opt/hermes/home \
 && cp /root/.local/bin/hermes /usr/local/bin/hermes \
 && chmod -R a+rX /opt/hermes /usr/local/bin/hermes

# Store caliente y Chromium con el lockfile del repo. El clon de la tarea se
# monta en /work y reutiliza el store con `pnpm install --offline`.
WORKDIR /opt/plantilla
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY web/package.json web/
COPY e2e/package.json e2e/
RUN pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm --filter @esencial/e2e exec playwright install --with-deps chromium \
 && pnpm store prune \
 && chown -R node:node /opt/pnpm-store /ms-playwright

RUN mkdir -p /work && chown node:node /work

USER node
WORKDIR /work
