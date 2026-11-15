#!/usr/bin/env bash
# Run the mentor agent in this terminal.
#
#   ./run.sh [api]   the API with reload on :8000
#
# Needs MongoDB running (make -C ../../infra up). Reads .env (copy .env.example), or the
# environment if there is none.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")"

usage() {
    sed -n '2,7p' "$SELF" | sed 's/^# \{0,1\}//'
    exit "${1:-0}"
}

load_env() {
    if [ -f .env ]; then
        set -a
        # shellcheck source=/dev/null
        . ./.env
        set +a
    fi
    local missing=()
    for name in ANTHROPIC_API_KEY OPENROUTER_API_KEY MONGO_URI; do
        [ -n "${!name:-}" ] || missing+=("$name")
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Not set: ${missing[*]}. Copy .env.example to .env and fill it in." >&2
        exit 1
    fi
}

run_api() {
    uv sync --locked
    exec uv run --locked uvicorn mentor_agent.main:app --reload \
        --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --no-access-log
}

case "${1:-api}" in
    api) load_env; run_api ;;
    -h | --help | help) usage ;;
    *) usage 1 ;;
esac
