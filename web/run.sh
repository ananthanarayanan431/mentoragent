#!/usr/bin/env bash
# Run the web app.
#
#   ./run.sh [dev|build|preview]           dev: Vite dev server on :5173 with hot reload (default)
#                                          build: type-check and build the bundle into dist/
#                                          preview: serve the built bundle
#   ./run.sh docker [up|down|logs|ps]      the nginx image, joined to the infra network
#
# dev proxies /api to the agent on :8000 (agents/mentor_agent/run.sh). Settings come from
# .env (copy .env.example); none are required for local development.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")"
COMPOSE=(docker compose -f ../infra/docker-compose.frontend.yml)

usage() {
    sed -n '2,10p' "$SELF" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

ensure_deps() {
    [ -d node_modules ] || pnpm install --frozen-lockfile
}

run_docker() {
    case "${1:-up}" in
        up) exec "${COMPOSE[@]}" up -d --build ;;
        down) exec "${COMPOSE[@]}" down ;;
        logs) exec "${COMPOSE[@]}" logs -f ;;
        ps) exec "${COMPOSE[@]}" ps -a ;;
        *) usage 1 ;;
    esac
}

case "${1:-dev}" in
    dev) ensure_deps; exec pnpm run dev ;;
    build) ensure_deps; exec pnpm run build ;;
    preview) ensure_deps; exec pnpm run preview ;;
    docker) shift; run_docker "$@" ;;
    -h | --help | help) usage ;;
    *) usage 1 ;;
esac
