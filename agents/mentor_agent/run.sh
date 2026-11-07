#!/usr/bin/env bash
# Run the mentor agent in this terminal.
#
#   ./run.sh [api|seed|evaluate]   api: the API with reload on :8000 (default)
#                                  seed: load the mentors, then build their long-term memory
#                                  evaluate: generate a dataset and score the agent with Opik
#
# Needs MongoDB running (make -C ../../infra up). Reads .env (copy .env.example), or the
# environment if there is none. `seed` and `evaluate` call paid model APIs.
set -euo pipefail

SELF="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
cd "$(dirname "$SELF")"

usage() {
    sed -n '2,9p' "$SELF" | sed 's/^# \{0,1\}//'
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
    for name in OPENROUTER_API_KEY MONGO_URI; do
        [ -n "${!name:-}" ] || missing+=("$name")
    done
    if [ "${#missing[@]}" -gt 0 ]; then
        echo "Not set: ${missing[*]}. Copy .env.example to .env and fill it in." >&2
        exit 1
    fi
}

run_api() {
    uv sync --locked
    exec uv run --locked mentor-agent serve --reload
}

run_seed() {
    uv run --locked mentor-agent load-mentors
    uv run --locked mentor-agent create-memory
}

run_evaluate() {
    uv run --locked mentor-agent generate-dataset
    uv run --locked mentor-agent evaluate
}

case "${1:-api}" in
    api) load_env; run_api ;;
    seed) load_env; run_seed ;;
    evaluate) load_env; run_evaluate ;;
    -h | --help | help) usage ;;
    *) usage 1 ;;
esac
