# syntax=docker/dockerfile:1
# check=skip=SecretsUsedInArgOrEnv
#
# The skip covers VITE_API_KEY. Anything prefixed VITE_ is inlined into the
# JavaScript bundle and served to every visitor, so it can never hold a real
# secret - see .env.example. Leaving the warning on would train readers to
# ignore build output.

# ---- build: compile the static bundle --------------------------------------
FROM node:26-alpine AS build
WORKDIR /app

# Dependencies first, so editing source does not invalidate this layer.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# VITE_* values are read at build time and baked into the bundle. The defaults
# are empty, which makes the app call its own origin - what the nginx proxy
# below serves. Override only when the API lives on another host.
ARG VITE_API_URL=""
ARG VITE_API_KEY=""
ENV VITE_API_URL=$VITE_API_URL VITE_API_KEY=$VITE_API_KEY
RUN npm run build

# ---- runtime: nginx serving the bundle -------------------------------------
# The unprivileged variant runs as uid 101 and listens on 8080.
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime

# Where to reach the API. In compose this is the backend service name.
ENV BACKEND_HOST=backend:8000
# Substitute only BACKEND_*, leaving nginx's own $host, $uri and friends alone.
ENV NGINX_ENVSUBST_FILTER="^BACKEND_"

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
    CMD ["wget", "--spider", "-q", "http://127.0.0.1:8080/index.html"]
