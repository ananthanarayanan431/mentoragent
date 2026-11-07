# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
#
# The skip covers VITE_API_KEY. Anything prefixed VITE_ is inlined into the
# JavaScript bundle and served to every visitor, so it can never hold a real
# secret - see .env.example. Leaving the warning on would train readers to
# ignore build output.

# Build from the repo root, like every image in this repo, so the pnpm
# workspace lockfile is in the context:
#   docker build -f web/Dockerfile .

# ---- build: compile the static bundle --------------------------------------
FROM node:26-alpine AS build
# Same pnpm as "packageManager" in package.json (Node 25+ no longer ships corepack).
RUN npm install -g pnpm@10.15.0
WORKDIR /repo

# Dependencies first, so editing source does not invalidate this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY web/package.json web/
COPY libs/mentor-agent-contracts/package.json libs/mentor-agent-contracts/
# `...` also installs the workspace packages the web app depends on (the contracts).
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @mentoragent/web...

COPY libs/ libs/
COPY web/ web/

# VITE_* values are read at build time and baked into the bundle. The defaults
# are empty, which makes the app call its own origin - what the nginx proxy
# below serves. Override only when the API lives on another host.
ARG VITE_API_URL=""
ARG VITE_API_KEY=""
ENV VITE_API_URL=$VITE_API_URL VITE_API_KEY=$VITE_API_KEY
RUN pnpm --filter @mentoragent/web build

# ---- runtime: nginx serving the bundle -------------------------------------
# The unprivileged variant runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.31-alpine AS runtime

# Where to reach the API. Compose sets it to the agent's container name
# (infra/docker-compose.frontend.yml).
ENV BACKEND_HOST=mentoragent-mentor-agent-api:8000
# Substitute only BACKEND_*, leaving nginx's own $host, $uri and friends alone.
ENV NGINX_ENVSUBST_FILTER="^BACKEND_"

COPY web/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY web/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /repo/web/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "--spider", "-q", "http://127.0.0.1:8080/index.html"]
